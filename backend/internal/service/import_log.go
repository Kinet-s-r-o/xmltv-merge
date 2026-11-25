package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"xmltv-merge/internal/models"
)

// Import triggers recorded in the import log.
const (
	TriggerManual    = "manual"
	TriggerScheduled = "scheduled"
	TriggerUpload    = "upload"
)

// Import stages; a failed attempt keeps the stage it failed in.
const (
	StageDownload   = "download"
	StageParse      = "parse"
	StageChannels   = "channels"
	StageProgrammes = "programmes"
	StageDone       = "done"
)

// Import log statuses.
const (
	ImportRunning = "running"
	ImportSuccess = "success"
	ImportPartial = "partial"
	ImportError   = "error"
)

// maxLoggedIssues caps the issue messages stored per attempt; issue_count keeps the total.
const maxLoggedIssues = 100

// importLogRetention is how long import attempts stay in the log.
const importLogRetention = 90 * 24 * time.Hour

// ImportTrigger says what started an import and, for manual ones, who.
type ImportTrigger struct {
	Kind string
	User string
}

// importRun collects the audit record of one import attempt.
type importRun struct {
	entry models.SourceImportLog
}

func (r *importRun) issue(format string, args ...any) {
	r.entry.IssueCount++
	if len(r.entry.Issues) < maxLoggedIssues {
		r.entry.Issues = append(r.entry.Issues, fmt.Sprintf(format, args...))
	}
}

// problems counts programmes or programme details that were not imported.
func (r *importRun) problems() int {
	e := r.entry
	return e.ProgrammesInvalid + e.ProgrammesUnknownChannel + e.ProgrammesFailed + e.DetailErrors
}

// logCtx is used for log writes so they succeed after the import context expired.
func logCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

func (s *ImportService) startRun(sourceID *int, sourceName string, trigger ImportTrigger, stage string) *importRun {
	run := &importRun{entry: models.SourceImportLog{
		SourceID:    sourceID,
		SourceName:  sourceName,
		Trigger:     trigger.Kind,
		TriggeredBy: trigger.User,
		StartedAt:   time.Now().UTC(),
		Status:      ImportRunning,
		Stage:       stage,
		Issues:      []string{},
	}}
	ctx, cancel := logCtx()
	defer cancel()
	if err := s.logRepo.Start(ctx, &run.entry); err != nil {
		log.Printf("import log: record start of %q: %v", sourceName, err)
	}
	return run
}

func (s *ImportService) finishRun(run *importRun, err error) {
	finished := time.Now().UTC()
	run.entry.FinishedAt = &finished
	switch {
	case err != nil:
		run.entry.Status = ImportError
		run.entry.Error = describeImportError(err, run.entry.Stage)
	case run.problems() > 0:
		run.entry.Status = ImportPartial
	default:
		run.entry.Status = ImportSuccess
	}
	if run.entry.ID == 0 {
		return
	}
	ctx, cancel := logCtx()
	defer cancel()
	if err := s.logRepo.Finish(ctx, &run.entry); err != nil {
		log.Printf("import log: record result of %q: %v", run.entry.SourceName, err)
	}
}

func describeImportError(err error, stage string) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("import timed out after %s in the %s stage: %v", sourceImportTimeout, stage, err)
	}
	if errors.Is(err, context.Canceled) {
		return fmt.Sprintf("import cancelled in the %s stage: %v", stage, err)
	}
	return err.Error()
}

// ImportLog returns the newest import attempts of a source.
func (s *ImportService) ImportLog(ctx context.Context, sourceID, limit int) ([]models.SourceImportLog, error) {
	return s.logRepo.ListBySource(ctx, sourceID, limit)
}

// MarkInterruptedImports closes log entries left running by a stopped server.
func (s *ImportService) MarkInterruptedImports(ctx context.Context) (int64, error) {
	return s.logRepo.MarkInterrupted(ctx)
}

// CleanupImportLog removes import attempts older than the retention period.
func (s *ImportService) CleanupImportLog(ctx context.Context) (int64, error) {
	return s.logRepo.Cleanup(ctx, time.Now().Add(-importLogRetention))
}
