package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
)

type SourceRepository struct {
	db *pgxpool.Pool
}

func NewSourceRepository(db *pgxpool.Pool) *SourceRepository {
	return &SourceRepository{db: db}
}

func (r *SourceRepository) SaveURL(ctx context.Context, name, sourceURL string, intervalMinutes, historyDays int) (int, error) {
	var id int
	err := r.db.QueryRow(ctx,
		`INSERT INTO sources (name, source_url, refresh_interval_minutes, history_days)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (name) DO UPDATE SET source_url = EXCLUDED.source_url,
			refresh_interval_minutes = EXCLUDED.refresh_interval_minutes,
			history_days = EXCLUDED.history_days,
			last_import_at = NULL, last_import_status = NULL, last_import_error = NULL,
			updated_at = now()
		 RETURNING id`, name, sourceURL, intervalMinutes, historyDays,
	).Scan(&id)
	return id, err
}

func (r *SourceRepository) Delete(ctx context.Context, id int) (bool, error) {
	result, err := r.db.Exec(ctx, `DELETE FROM sources WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func (r *SourceRepository) UpdateURL(ctx context.Context, id int, name, sourceURL string, intervalMinutes, historyDays int) (bool, error) {
	result, err := r.db.Exec(ctx,
		`UPDATE sources
		 SET name = $2, source_url = $3, refresh_interval_minutes = $4, history_days = $5,
		     last_import_at = NULL, last_import_status = NULL, last_import_error = NULL,
		     updated_at = now()
		 WHERE id = $1`, id, name, sourceURL, intervalMinutes, historyDays,
	)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func (r *SourceRepository) Due(ctx context.Context) ([]models.Source, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, source_url, refresh_interval_minutes
		 FROM sources
		 WHERE enabled = TRUE AND source_url <> '' AND (last_import_at IS NULL OR
		       last_import_at + make_interval(mins => refresh_interval_minutes) <= now())
		 ORDER BY last_import_at NULLS FIRST`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := make([]models.Source, 0)
	for rows.Next() {
		var source models.Source
		if err := rows.Scan(&source.ID, &source.Name, &source.SourceURL, &source.RefreshIntervalMinutes); err != nil {
			return nil, err
		}
		sources = append(sources, source)
	}
	return sources, rows.Err()
}

func (r *SourceRepository) SetEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	result, err := r.db.Exec(ctx,
		`UPDATE sources SET enabled = $2, updated_at = now() WHERE id = $1`, id, enabled,
	)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}

func (r *SourceRepository) Upsert(ctx context.Context, name, genName, genURL string) (int, error) {
	var id int
	err := r.db.QueryRow(ctx,
		`INSERT INTO sources (name, generator_info_name, generator_info_url)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (name) DO UPDATE SET
			generator_info_name = EXCLUDED.generator_info_name,
			generator_info_url = EXCLUDED.generator_info_url,
			updated_at = now()
		 RETURNING id`,
		name, genName, genURL,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert source: %w", err)
	}
	return id, nil
}

func (r *SourceRepository) UpdateImportStatus(ctx context.Context, id int, status, errMsg string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE sources SET last_import_at = now(), last_import_status = $2, last_import_error = $3, updated_at = now() WHERE id = $1`,
		id, status, errMsg,
	)
	return err
}

func (r *SourceRepository) List(ctx context.Context) ([]models.Source, error) {
	rows, err := r.db.Query(ctx,
		`SELECT s.id, s.name, s.source_url, s.enabled, s.refresh_interval_minutes, s.history_days,
		        COALESCE(s.generator_info_name, ''), COALESCE(s.generator_info_url, ''),
		        s.last_import_at, COALESCE(s.last_import_status, ''), COALESCE(s.last_import_error, ''),
		        s.created_at, s.updated_at,
		        (SELECT COUNT(*) FROM channels c WHERE c.source_id = s.id) AS channel_count,
		        (SELECT COUNT(*) FROM programmes p WHERE p.source_id = s.id) AS programme_count
		 FROM sources s
		 ORDER BY s.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := make([]models.Source, 0)
	for rows.Next() {
		var s models.Source
		if err := rows.Scan(&s.ID, &s.Name, &s.SourceURL, &s.Enabled, &s.RefreshIntervalMinutes, &s.HistoryDays,
			&s.GeneratorInfoName, &s.GeneratorInfoURL,
			&s.LastImportAt, &s.LastImportStatus, &s.LastImportError,
			&s.CreatedAt, &s.UpdatedAt, &s.ChannelCount, &s.ProgrammeCount); err != nil {
			return nil, err
		}
		sources = append(sources, s)
	}
	return sources, rows.Err()
}

func (r *SourceRepository) GetByID(ctx context.Context, id int) (*models.Source, error) {
	var s models.Source
	err := r.db.QueryRow(ctx,
		`SELECT id, name, source_url, enabled, refresh_interval_minutes, history_days,
		        COALESCE(generator_info_name, ''), COALESCE(generator_info_url, ''),
		        last_import_at, COALESCE(last_import_status, ''), COALESCE(last_import_error, ''), created_at, updated_at
		 FROM sources WHERE id = $1`, id,
	).Scan(&s.ID, &s.Name, &s.SourceURL, &s.Enabled, &s.RefreshIntervalMinutes, &s.HistoryDays, &s.GeneratorInfoName, &s.GeneratorInfoURL,
		&s.LastImportAt, &s.LastImportStatus, &s.LastImportError, &s.CreatedAt, &s.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
