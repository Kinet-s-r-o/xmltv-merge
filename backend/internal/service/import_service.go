package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
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
}

var sourceHTTPClient = &http.Client{Timeout: 5 * time.Minute}

func (s *ImportService) ImportURL(ctx context.Context, source models.Source) error {
	parsed, err := url.ParseRequestURI(source.SourceURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		err = fmt.Errorf("source URL must be a valid HTTP or HTTPS URL")
	} else {
		var req *http.Request
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, source.SourceURL, nil)
		if err == nil {
			var response *http.Response
			response, err = sourceHTTPClient.Do(req)
			if err == nil {
				defer response.Body.Close()
				if response.StatusCode < 200 || response.StatusCode >= 300 {
					err = fmt.Errorf("source returned HTTP %s", response.Status)
				} else {
					const maxSourceSize = 100 << 20
					body, readErr := io.ReadAll(io.LimitReader(response.Body, maxSourceSize+1))
					if readErr != nil {
						err = readErr
					} else if len(body) > maxSourceSize {
						err = fmt.Errorf("source file exceeds 100 MB limit")
					} else {
						_, err = s.importXML(ctx, source.ID, source.Name, bytes.NewReader(body))
					}
				}
			}
		}
	}
	if err != nil {
		_ = s.sourceRepo.UpdateImportStatus(ctx, source.ID, "error", err.Error())
	}
	return err
}

func NewImportService(db *pgxpool.Pool) *ImportService {
	return &ImportService{
		db:          db,
		sourceRepo:  repository.NewSourceRepository(db),
		channelRepo: repository.NewChannelRepository(db),
		progRepo:    repository.NewProgrammeRepository(db),
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

type ImportResult struct {
	SourceName string `json:"source_name"`
	Channels   int    `json:"channels"`
	Programmes int    `json:"programmes"`
	Duration   string `json:"duration"`
	ImportedAt string `json:"imported_at"`
}

func (s *ImportService) ImportXML(ctx context.Context, sourceName string, data io.Reader) (*ImportResult, error) {
	return s.importXML(ctx, 0, sourceName, data)
}

func (s *ImportService) importXML(ctx context.Context, sourceID int, sourceName string, data io.Reader) (*ImportResult, error) {
	start := time.Now()

	// Read all data
	buf := make([]byte, 0, 1024*1024)
	tmp := make([]byte, 64*1024)
	for {
		n, err := data.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}

	// Parse XML
	result, err := parser.ParseXML(buf)
	if err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
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

	// Upsert channels
	channelMap := make(map[string]int)
	for _, ch := range result.Channels {
		id, err := s.channelRepo.Upsert(ctx, sourceID, ch.ExternalID, ch.Name, ch.NameLang, ch.IconURL, ch.URL)
		if err != nil {
			return nil, fmt.Errorf("upsert channel %s: %w", ch.ExternalID, err)
		}
		channelMap[ch.ExternalID] = id
	}
	channelIDs := make([]int, 0, len(channelMap))
	for _, id := range channelMap {
		channelIDs = append(channelIDs, id)
	}
	now := time.Now().UTC()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if err := s.progRepo.DeleteCurrentAndFuture(ctx, sourceID, channelIDs, todayStart); err != nil {
		return nil, fmt.Errorf("replace current and future programme data: %w", err)
	}

	// Import only today's and future programmes; older schedules remain unchanged.
	progCount := 0
	for _, pp := range result.Programmes {
		if pp.StartTime.Before(todayStart) {
			continue
		}
		channelID, ok := channelMap[pp.ChannelExternalID]
		if !ok {
			// Channel not found, skip
			continue
		}

		progID, err := s.progRepo.Upsert(ctx, sourceID, channelID, pp.StartTime, pp.StopTime,
			pp.Subtitle, pp.SubtitleLang, pp.Description, pp.DescriptionLang,
			pp.Country, pp.IconURL, pp.EpisodeNum, pp.EpisodeNumSystem, pp.Year)
		if err != nil {
			continue
		}

		// Insert titles, credits, categories
		if err := s.insertTitles(ctx, progID, pp.Titles); err != nil {
			// Non-fatal
		}
		if err := s.insertCredits(ctx, progID, pp.Credits); err != nil {
			// Non-fatal
		}
		if err := s.insertCategories(ctx, progID, pp.Categories); err != nil {
			// Non-fatal
		}

		progCount++
	}

	// Update source import status
	s.sourceRepo.UpdateImportStatus(ctx, sourceID, "success", "")

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
