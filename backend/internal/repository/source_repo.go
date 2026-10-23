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
		`SELECT s.id, s.name, s.generator_info_name, s.generator_info_url,
		        s.last_import_at, s.last_import_status, s.last_import_error,
		        s.created_at, s.updated_at,
		        COUNT(DISTINCT c.id) as channel_count,
		        COUNT(DISTINCT p.id) as programme_count
		 FROM sources s
		 LEFT JOIN channels c ON c.source_id = s.id
		 LEFT JOIN programmes p ON p.source_id = s.id
		 GROUP BY s.id
		 ORDER BY s.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []models.Source
	for rows.Next() {
		var s models.Source
		if err := rows.Scan(&s.ID, &s.Name, &s.GeneratorInfoName, &s.GeneratorInfoURL,
			&s.LastImportAt, &s.LastImportStatus, &s.LastImportError,
			&s.CreatedAt, &s.UpdatedAt, &s.ChannelCount, &s.ProgrammeCount); err != nil {
			return nil, err
		}
		sources = append(sources, s)
	}
	return sources, nil
}

func (r *SourceRepository) GetByID(ctx context.Context, id int) (*models.Source, error) {
	var s models.Source
	err := r.db.QueryRow(ctx,
		`SELECT id, name, generator_info_name, generator_info_url,
		        last_import_at, last_import_status, last_import_error, created_at, updated_at
		 FROM sources WHERE id = $1`, id,
	).Scan(&s.ID, &s.Name, &s.GeneratorInfoName, &s.GeneratorInfoURL,
		&s.LastImportAt, &s.LastImportStatus, &s.LastImportError, &s.CreatedAt, &s.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
