package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
)

type ChannelRepository struct {
	db *pgxpool.Pool
}

func NewChannelRepository(db *pgxpool.Pool) *ChannelRepository {
	return &ChannelRepository{db: db}
}

func (r *ChannelRepository) Upsert(ctx context.Context, sourceID int, externalID, name, nameLang, iconURL, url string) (int, error) {
	var id int
	err := r.db.QueryRow(ctx,
		`INSERT INTO channels (source_id, external_id, name, name_lang, icon_url, url)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (source_id, external_id) DO UPDATE SET
			name = EXCLUDED.name,
			name_lang = EXCLUDED.name_lang,
			icon_url = EXCLUDED.icon_url,
			url = EXCLUDED.url
		 RETURNING id`,
		sourceID, externalID, name, nameLang, iconURL, url,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert channel: %w", err)
	}
	return id, nil
}

func (r *ChannelRepository) GetByExternalID(ctx context.Context, sourceID int, externalID string) (*models.Channel, error) {
	var c models.Channel
	err := r.db.QueryRow(ctx,
		`SELECT id, source_id, external_id, name, name_lang, icon_url, url, created_at
		 FROM channels WHERE source_id = $1 AND external_id = $2`,
		sourceID, externalID,
	).Scan(&c.ID, &c.SourceID, &c.ExternalID, &c.Name, &c.NameLang, &c.IconURL, &c.URL, &c.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *ChannelRepository) List(ctx context.Context, sourceID *int, search string) ([]models.Channel, error) {
	query := `SELECT id, source_id, external_id, name, name_lang, icon_url, url, created_at FROM channels WHERE 1=1`
	args := []interface{}{}
	argNum := 1

	if sourceID != nil {
		query += fmt.Sprintf(" AND source_id = $%d", argNum)
		args = append(args, *sourceID)
		argNum++
	}
	if search != "" {
		query += fmt.Sprintf(" AND name ILIKE $%d", argNum)
		args = append(args, "%"+search+"%")
		argNum++
	}
	query += " ORDER BY name"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	channels := make([]models.Channel, 0)
	for rows.Next() {
		var c models.Channel
		if err := rows.Scan(&c.ID, &c.SourceID, &c.ExternalID, &c.Name, &c.NameLang, &c.IconURL, &c.URL, &c.CreatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, c)
	}
	return channels, nil
}

func (r *ChannelRepository) GetByID(ctx context.Context, id int) (*models.Channel, error) {
	var c models.Channel
	err := r.db.QueryRow(ctx,
		`SELECT id, source_id, external_id, name, name_lang, icon_url, url, created_at
		 FROM channels WHERE id = $1`, id,
	).Scan(&c.ID, &c.SourceID, &c.ExternalID, &c.Name, &c.NameLang, &c.IconURL, &c.URL, &c.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}
