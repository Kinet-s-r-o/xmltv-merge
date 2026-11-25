package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
	"xmltv-merge/internal/parser"
	"xmltv-merge/internal/repository"
)

type ImportService struct {
	db          *pgxpool.Pool
	sourceRepo  *repository.SourceRepository
	channelRepo *repository.ChannelRepository
	progRepo    *repository.ProgrammeRepository
	logRepo     *repository.ImportLogRepository
	// OnImported is called after a source import finished successfully.
	OnImported func(sourceID int)

	// refreshMu guards refreshing: the URL sources with a manual or scheduled
	// import in flight, so one source never imports twice at the same time.
	refreshMu  sync.Mutex
	refreshing map[int]bool
	// importSlots caps how many URL imports run concurrently.
	importSlots chan struct{}
}

var ErrSourceDisabled = fmt.Errorf("source is disabled")

// ErrRefreshInProgress is returned when a source already has an import running or queued.
var ErrRefreshInProgress = errors.New("source refresh is already running")

// sourceImportTimeout bounds one URL import (download, parse and store),
// counted from when it gets an import slot.
const sourceImportTimeout = 6 * time.Minute

// maxConcurrentImports limits parallel URL imports so bulk refreshes do not
// overload PostgreSQL or the upstream servers.
const maxConcurrentImports = 2

var sourceHTTPClient = &http.Client{Timeout: 5 * time.Minute}

// ImportURL downloads and imports a URL source and records the attempt in
// the import log.
func (s *ImportService) ImportURL(ctx context.Context, source models.Source, trigger ImportTrigger) error {
	sourceID := source.ID
	run := s.startRun(&sourceID, source.Name, trigger, StageDownload)
	err := s.importURL(ctx, source, run)
	s.finishRun(run, err)
	if err != nil {
		// The import context may have expired; record the failure regardless.
		statusCtx, cancel := logCtx()
		defer cancel()
		_ = s.sourceRepo.UpdateImportStatus(statusCtx, source.ID, "error", run.entry.Error)
	}
	return err
}

func (s *ImportService) importURL(ctx context.Context, source models.Source, run *importRun) error {
	parsed, err := url.ParseRequestURI(source.SourceURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("source URL must be a valid HTTP or HTTPS URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.SourceURL, nil)
	if err != nil {
		return err
	}
	response, err := sourceHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("source returned HTTP %s", response.Status)
	}
	const maxSourceSize = 100 << 20
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSourceSize+1))
	run.entry.Bytes = int64(len(body))
	if err != nil {
		return fmt.Errorf("download interrupted after %d bytes: %w", len(body), err)
	}
	if len(body) > maxSourceSize {
		return fmt.Errorf("source file exceeds 100 MB limit")
	}
	_, err = s.importXML(ctx, source.ID, source.Name, bytes.NewReader(body), run)
	return err
}

func NewImportService(db *pgxpool.Pool) *ImportService {
	return &ImportService{
		db:          db,
		sourceRepo:  repository.NewSourceRepository(db),
		channelRepo: repository.NewChannelRepository(db),
		progRepo:    repository.NewProgrammeRepository(db),
		logRepo:     repository.NewImportLogRepository(db),
		refreshing:  make(map[int]bool),
		importSlots: make(chan struct{}, maxConcurrentImports),
	}
}

func (s *ImportService) AddURLSource(ctx context.Context, name, sourceURL string, intervalMinutes, historyDays int) (int, error) {
	name = strings.TrimSpace(name)
	sourceURL = strings.TrimSpace(sourceURL)
	if historyDays == 0 {
		historyDays = 7
	}
	parsed, err := url.ParseRequestURI(sourceURL)
	if name == "" || err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return 0, fmt.Errorf("name and a valid HTTP or HTTPS source URL are required")
	}
	if intervalMinutes < 5 || intervalMinutes > 10080 {
		return 0, fmt.Errorf("refresh interval must be between 5 and 10080 minutes")
	}
	if historyDays < 1 || historyDays > 3650 {
		return 0, fmt.Errorf("history retention must be between 1 and 3650 days")
	}
	return s.sourceRepo.SaveURL(ctx, name, sourceURL, intervalMinutes, historyDays)
}

func (s *ImportService) UpdateURLSource(ctx context.Context, id int, name, sourceURL string, intervalMinutes, historyDays int) (bool, error) {
	name = strings.TrimSpace(name)
	sourceURL = strings.TrimSpace(sourceURL)
	if historyDays == 0 {
		historyDays = 7
	}
	parsed, err := url.ParseRequestURI(sourceURL)
	if name == "" || err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return false, fmt.Errorf("name and a valid HTTP or HTTPS source URL are required")
	}
	if intervalMinutes < 5 || intervalMinutes > 10080 {
		return false, fmt.Errorf("refresh interval must be between 5 and 10080 minutes")
	}
	if historyDays < 1 || historyDays > 3650 {
		return false, fmt.Errorf("history retention must be between 1 and 3650 days")
	}
	return s.sourceRepo.UpdateURL(ctx, id, name, sourceURL, intervalMinutes, historyDays)
}

// StartRefresh queues a background import of a URL source and returns at once.
// The outcome is recorded in the source's last import status. It reports
// false when the source does not exist.
func (s *ImportService) StartRefresh(ctx context.Context, id int, user string) (bool, error) {
	source, err := s.sourceRepo.GetByID(ctx, id)
	if err != nil {
		return false, err
	}
	if source == nil {
		return false, nil
	}
	if !source.Enabled {
		return true, ErrSourceDisabled
	}
	if !s.beginRefresh(source.ID) {
		return true, ErrRefreshInProgress
	}
	go func() {
		defer s.endRefresh(source.ID)
		// Detached from the HTTP request: the import must outlive the response.
		if err := s.runImport(context.Background(), *source, ImportTrigger{Kind: TriggerManual, User: user}); err != nil {
			log.Printf("refresh: import source %q: %v", source.Name, err)
		} else {
			log.Printf("refresh: imported source %q", source.Name)
		}
	}()
	return true, nil
}

// ImportScheduled imports a due source unless it is already being refreshed,
// in which case it reports skipped.
func (s *ImportService) ImportScheduled(ctx context.Context, source models.Source) (skipped bool, err error) {
	if !s.beginRefresh(source.ID) {
		return true, nil
	}
	defer s.endRefresh(source.ID)
	return false, s.runImport(ctx, source, ImportTrigger{Kind: TriggerScheduled})
}

// IsRefreshing reports whether the source has an import running or queued.
func (s *ImportService) IsRefreshing(id int) bool {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	return s.refreshing[id]
}

func (s *ImportService) beginRefresh(id int) bool {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	if s.refreshing[id] {
		return false
	}
	s.refreshing[id] = true
	return true
}

func (s *ImportService) endRefresh(id int) {
	s.refreshMu.Lock()
	defer s.refreshMu.Unlock()
	delete(s.refreshing, id)
}

// runImport waits for an import slot, then imports the source within sourceImportTimeout.
func (s *ImportService) runImport(ctx context.Context, source models.Source, trigger ImportTrigger) error {
	select {
	case s.importSlots <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-s.importSlots }()
	importCtx, cancel := context.WithTimeout(ctx, sourceImportTimeout)
	defer cancel()
	return s.ImportURL(importCtx, source, trigger)
}

type ImportResult struct {
	SourceName string `json:"source_name"`
	Channels   int    `json:"channels"`
	Programmes int    `json:"programmes"`
	Duration   string `json:"duration"`
	ImportedAt string `json:"imported_at"`
}

// ImportXML imports an uploaded XMLTV file and records the attempt in the import log.
func (s *ImportService) ImportXML(ctx context.Context, sourceName string, data io.Reader, user string) (*ImportResult, error) {
	run := s.startRun(nil, sourceName, ImportTrigger{Kind: TriggerUpload, User: user}, StageParse)
	result, err := s.importXML(ctx, 0, sourceName, data, run)
	s.finishRun(run, err)
	return result, err
}

func (s *ImportService) importXML(ctx context.Context, sourceID int, sourceName string, data io.Reader, run *importRun) (*ImportResult, error) {
	start := time.Now()
	run.entry.Stage = StageParse

	buf, err := io.ReadAll(data)
	if err != nil {
		return nil, fmt.Errorf("read xml: %w", err)
	}
	if run.entry.Bytes == 0 {
		run.entry.Bytes = int64(len(buf))
	}

	// Parse XML
	result, err := parser.ParseXML(buf)
	if err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
	}
	run.entry.ProgrammesInvalid = len(result.Invalid)
	run.entry.ProgrammesTotal = len(result.Programmes) + len(result.Invalid)
	for _, invalid := range result.Invalid {
		run.issue("programme on channel %q starting %q skipped: %s", invalid.Channel, invalid.Start, invalid.Reason)
	}

	// Determine source name
	name := sourceName
	if name == "" {
		name = result.Source.Name
	}
	if name == "" {
		name = "unknown"
	}

	// Upsert source
	if sourceID == 0 {
		sourceID, err = s.sourceRepo.Upsert(ctx, name, result.Source.GeneratorInfoName, result.Source.GeneratorInfoURL)
		if err != nil {
			return nil, fmt.Errorf("upsert source: %w", err)
		}
	}
	run.entry.SourceID = &sourceID
	run.entry.SourceName = name
	run.entry.Stage = StageChannels
	run.entry.ChannelsTotal = len(result.Channels)

	// Upsert channels
	channelMap := make(map[string]int)
	for _, ch := range result.Channels {
		id, err := s.channelRepo.Upsert(ctx, sourceID, ch.ExternalID, ch.Name, ch.NameLang, ch.IconURL, ch.URL)
		if err != nil {
			return nil, fmt.Errorf("store channel %q: %w", ch.ExternalID, err)
		}
		channelMap[ch.ExternalID] = id
		run.entry.ChannelsImported++
	}
	channelIDs := make([]int, 0, len(channelMap))
	for _, id := range channelMap {
		channelIDs = append(channelIDs, id)
	}
	run.entry.Stage = StageProgrammes
	now := time.Now().UTC()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if err := s.progRepo.DeleteCurrentAndFuture(ctx, sourceID, channelIDs, todayStart); err != nil {
		return nil, fmt.Errorf("replace current and future programme data: %w", err)
	}

	// Import only today's and future programmes; older schedules remain unchanged.
	progCount := 0
	unknownChannels := map[string]int{}
	for _, pp := range result.Programmes {
		if pp.StartTime.Before(todayStart) {
			run.entry.ProgrammesPast++
			continue
		}
		channelID, ok := channelMap[pp.ChannelExternalID]
		if !ok {
			unknownChannels[pp.ChannelExternalID]++
			continue
		}

		progID, err := s.progRepo.Upsert(ctx, sourceID, channelID, pp.StartTime, pp.StopTime,
			pp.Subtitle, pp.SubtitleLang, pp.Description, pp.DescriptionLang,
			pp.Country, pp.IconURL, pp.EpisodeNum, pp.EpisodeNumSystem, pp.Year)
		if err != nil {
			if ctx.Err() != nil {
				return nil, fmt.Errorf("stopped after storing %d programmes: %w", progCount, ctx.Err())
			}
			run.entry.ProgrammesFailed++
			run.issue("programme on channel %q at %s not stored: %v", pp.ChannelExternalID, pp.StartTime.Format(time.RFC3339), err)
			continue
		}

		// Titles, credits and categories: the programme stays, the failed detail is reported.
		details := []struct {
			what string
			err  error
		}{
			{"titles", s.insertTitles(ctx, progID, pp.Titles)},
			{"credits", s.insertCredits(ctx, progID, pp.Credits)},
			{"categories", s.insertCategories(ctx, progID, pp.Categories)},
		}
		for _, detail := range details {
			if detail.err != nil {
				run.entry.DetailErrors++
				run.issue("programme on channel %q at %s: %s not stored: %v", pp.ChannelExternalID, pp.StartTime.Format(time.RFC3339), detail.what, detail.err)
			}
		}

		progCount++
	}
	run.entry.ProgrammesImported = progCount
	missing := make([]string, 0, len(unknownChannels))
	for channel := range unknownChannels {
		missing = append(missing, channel)
	}
	sort.Strings(missing)
	for _, channel := range missing {
		run.entry.ProgrammesUnknownChannel += unknownChannels[channel]
		run.issue("%d programmes skipped: channel %q is not declared in the file", unknownChannels[channel], channel)
	}
	run.entry.Stage = StageDone

	// Update source import status; a partial import points to the import log.
	statusError := ""
	if problems := run.problems(); problems > 0 {
		statusError = fmt.Sprintf("imported with %d problems; see the import log", problems)
	}
	s.sourceRepo.UpdateImportStatus(ctx, sourceID, "success", statusError)
	if s.OnImported != nil {
		s.OnImported(sourceID)
	}

	duration := time.Since(start).Round(time.Millisecond).String()
	return &ImportResult{
		SourceName: name,
		Channels:   len(result.Channels),
		Programmes: progCount,
		Duration:   duration,
		ImportedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *ImportService) insertTitles(ctx context.Context, programmeID int64, titles []parser.ParsedTitle) error {
	for _, t := range titles {
		_, err := s.db.Exec(ctx,
			`INSERT INTO programme_titles (programme_id, lang, title)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (programme_id, lang) DO UPDATE SET title = EXCLUDED.title`,
			programmeID, t.Lang, t.Title,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ImportService) insertCredits(ctx context.Context, programmeID int64, credits []parser.ParsedCredit) error {
	_, _ = s.db.Exec(ctx, `DELETE FROM programme_credits WHERE programme_id = $1`, programmeID)
	for _, c := range credits {
		_, err := s.db.Exec(ctx,
			`INSERT INTO programme_credits (programme_id, type, name) VALUES ($1, $2, $3)`,
			programmeID, c.Type, c.Name,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *ImportService) insertCategories(ctx context.Context, programmeID int64, categories []parser.ParsedCategory) error {
	_, _ = s.db.Exec(ctx, `DELETE FROM programme_categories WHERE programme_id = $1`, programmeID)
	for _, c := range categories {
		_, err := s.db.Exec(ctx,
			`INSERT INTO programme_categories (programme_id, lang, category) VALUES ($1, $2, $3)`,
			programmeID, c.Lang, c.Category,
		)
		if err != nil {
			return err
		}
	}
	return nil
}
