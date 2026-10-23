package service

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/parser"
	"xmltv-merge/internal/repository"
)

type ImportService struct {
	db          *pgxpool.Pool
	sourceRepo  *repository.SourceRepository
	channelRepo *repository.ChannelRepository
	progRepo    *repository.ProgrammeRepository
}

func NewImportService(db *pgxpool.Pool) *ImportService {
	return &ImportService{
		db:          db,
		sourceRepo:  repository.NewSourceRepository(db),
		channelRepo: repository.NewChannelRepository(db),
		progRepo:    repository.NewProgrammeRepository(db),
	}
}

type ImportResult struct {
	SourceName   string `json:"source_name"`
	Channels     int    `json:"channels"`
	Programmes   int    `json:"programmes"`
	Duration     string `json:"duration"`
	ImportedAt   string `json:"imported_at"`
}

func (s *ImportService) ImportXML(ctx context.Context, sourceName string, data io.Reader) (*ImportResult, error) {
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
	sourceID, err := s.sourceRepo.Upsert(ctx, name, result.Source.GeneratorInfoName, result.Source.GeneratorInfoURL)
	if err != nil {
		return nil, fmt.Errorf("upsert source: %w", err)
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

	// Upsert programmes
	progCount := 0
	for _, pp := range result.Programmes {
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
