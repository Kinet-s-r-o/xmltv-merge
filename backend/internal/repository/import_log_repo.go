package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
)

// ImportLogRepository stores the audit log of source import attempts.
type ImportLogRepository struct {
	db *pgxpool.Pool
}

func NewImportLogRepository(db *pgxpool.Pool) *ImportLogRepository {
	return &ImportLogRepository{db: db}
}

// Start records a running import attempt and sets its ID.
func (r *ImportLogRepository) Start(ctx context.Context, entry *models.SourceImportLog) error {
	return r.db.QueryRow(ctx,
		`INSERT INTO source_import_log (source_id, source_name, trigger, triggered_by, started_at, status, stage)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		entry.SourceID, entry.SourceName, entry.Trigger, entry.TriggeredBy, entry.StartedAt, entry.Status, entry.Stage,
	).Scan(&entry.ID)
}

// Finish stores the outcome of an import attempt.
func (r *ImportLogRepository) Finish(ctx context.Context, entry *models.SourceImportLog) error {
	issues := entry.Issues
	if issues == nil {
		issues = []string{}
	}
	issuesJSON, err := json.Marshal(issues)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx,
		`UPDATE source_import_log SET source_id = $2, source_name = $3, finished_at = $4, status = $5, stage = $6,
			error = $7, bytes = $8, channels_total = $9, channels_imported = $10, programmes_total = $11,
			programmes_imported = $12, programmes_past = $13, programmes_invalid = $14,
			programmes_unknown_channel = $15, programmes_failed = $16, detail_errors = $17,
			issue_count = $18, issues = $19
		 WHERE id = $1`,
		entry.ID, entry.SourceID, entry.SourceName, entry.FinishedAt, entry.Status, entry.Stage,
		entry.Error, entry.Bytes, entry.ChannelsTotal, entry.ChannelsImported, entry.ProgrammesTotal,
		entry.ProgrammesImported, entry.ProgrammesPast, entry.ProgrammesInvalid,
		entry.ProgrammesUnknownChannel, entry.ProgrammesFailed, entry.DetailErrors,
		entry.IssueCount, issuesJSON)
	return err
}

// ListBySource returns the newest import attempts of a source first.
func (r *ImportLogRepository) ListBySource(ctx context.Context, sourceID, limit int) ([]models.SourceImportLog, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, source_id, source_name, trigger, triggered_by, started_at, finished_at, status, stage, error,
			bytes, channels_total, channels_imported, programmes_total, programmes_imported, programmes_past,
			programmes_invalid, programmes_unknown_channel, programmes_failed, detail_errors, issue_count, issues
		 FROM source_import_log WHERE source_id = $1 ORDER BY started_at DESC, id DESC LIMIT $2`,
		sourceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []models.SourceImportLog{}
	for rows.Next() {
		var e models.SourceImportLog
		var issuesJSON []byte
		if err := rows.Scan(&e.ID, &e.SourceID, &e.SourceName, &e.Trigger, &e.TriggeredBy, &e.StartedAt, &e.FinishedAt,
			&e.Status, &e.Stage, &e.Error, &e.Bytes, &e.ChannelsTotal, &e.ChannelsImported, &e.ProgrammesTotal,
			&e.ProgrammesImported, &e.ProgrammesPast, &e.ProgrammesInvalid, &e.ProgrammesUnknownChannel,
			&e.ProgrammesFailed, &e.DetailErrors, &e.IssueCount, &issuesJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(issuesJSON, &e.Issues); err != nil || e.Issues == nil {
			e.Issues = []string{}
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// MarkInterrupted closes attempts left running by a previous server process.
func (r *ImportLogRepository) MarkInterrupted(ctx context.Context) (int64, error) {
	result, err := r.db.Exec(ctx,
		`UPDATE source_import_log SET status = 'error', finished_at = now(),
			error = 'import interrupted: the server stopped before it finished'
		 WHERE status = 'running'`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

// Cleanup removes log entries that started before the cutoff.
func (r *ImportLogRepository) Cleanup(ctx context.Context, before time.Time) (int64, error) {
	result, err := r.db.Exec(ctx, `DELETE FROM source_import_log WHERE started_at < $1`, before)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}
