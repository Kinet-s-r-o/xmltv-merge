package repository

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"xmltv-merge/internal/models"
)

type OutputRepository struct{ db *pgxpool.Pool }

func NewOutputRepository(db *pgxpool.Pool) *OutputRepository { return &OutputRepository{db: db} }

func outputSlug(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if b.Len() > 0 {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func (r *OutputRepository) List(ctx context.Context) ([]models.Output, error) {
	rows, err := r.db.Query(ctx, `SELECT o.id, o.name, o.slug, o.public_token, o.created_at, o.updated_at,
		(SELECT COUNT(*) FROM output_channels oc WHERE oc.output_id=o.id) FROM outputs o ORDER BY o.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]models.Output, 0)
	for rows.Next() {
		var o models.Output
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.PublicToken, &o.CreatedAt, &o.UpdatedAt, &o.ChannelCount); err != nil {
			return nil, err
		}
		result = append(result, o)
	}
	return result, rows.Err()
}

func (r *OutputRepository) Get(ctx context.Context, id int) (*models.Output, error) {
	var o models.Output
	err := r.db.QueryRow(ctx, `SELECT id,name,slug,public_token,created_at,updated_at FROM outputs WHERE id=$1`, id).Scan(&o.ID, &o.Name, &o.Slug, &o.PublicToken, &o.CreatedAt, &o.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := r.db.Query(ctx, `SELECT oc.id,oc.output_id,oc.channel_id,oc.display_name,oc.include_title,oc.include_subtitle,oc.include_description,oc.include_credits,oc.include_categories,oc.include_country,oc.include_year,oc.include_episode_num,oc.include_icon,
		c.id,c.source_id,c.external_id,c.name,c.name_lang,c.icon_url,c.url,c.created_at
		FROM output_channels oc JOIN channels c ON c.id=oc.channel_id WHERE oc.output_id=$1 ORDER BY oc.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var oc models.OutputChannel
		var c models.Channel
		if err := rows.Scan(&oc.ID, &oc.OutputID, &oc.ChannelID, &oc.DisplayName, &oc.IncludeTitle, &oc.IncludeSubtitle, &oc.IncludeDescription, &oc.IncludeCredits, &oc.IncludeCategories, &oc.IncludeCountry, &oc.IncludeYear, &oc.IncludeEpisodeNum, &oc.IncludeIcon, &c.ID, &c.SourceID, &c.ExternalID, &c.Name, &c.NameLang, &c.IconURL, &c.URL, &c.CreatedAt); err != nil {
			return nil, err
		}
		oc.Channel = &c
		o.Channels = append(o.Channels, oc)
	}
	o.ChannelCount = len(o.Channels)
	return &o, rows.Err()
}

func (r *OutputRepository) Create(ctx context.Context, name string) (int, error) {
	tokenBytes := make([]byte, 24)
	if _, err := rand.Read(tokenBytes); err != nil {
		return 0, err
	}
	var id int
	err := r.db.QueryRow(ctx, `INSERT INTO outputs(name,slug,public_token) VALUES($1,$2,$3) RETURNING id`, strings.TrimSpace(name), outputSlug(name), fmt.Sprintf("%x", tokenBytes)).Scan(&id)
	return id, err
}

func (r *OutputRepository) GetBySlugAndToken(ctx context.Context, slug, token string) (*models.Output, error) {
	var id int
	err := r.db.QueryRow(ctx, `SELECT id FROM outputs WHERE slug=$1 AND public_token=$2`, slug, token).Scan(&id)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

func (r *OutputRepository) Update(ctx context.Context, id int, name string) (bool, error) {
	result, err := r.db.Exec(ctx, `UPDATE outputs SET name=$2,slug=$3,updated_at=now() WHERE id=$1`, id, strings.TrimSpace(name), outputSlug(name))
	return result.RowsAffected() > 0, err
}
func (r *OutputRepository) Delete(ctx context.Context, id int) (bool, error) {
	result, err := r.db.Exec(ctx, `DELETE FROM outputs WHERE id=$1`, id)
	return result.RowsAffected() > 0, err
}

func (r *OutputRepository) SaveChannels(ctx context.Context, outputID int, channels []models.OutputChannel) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `DELETE FROM output_channels WHERE output_id=$1`, outputID); err != nil {
		return err
	}
	for _, c := range channels {
		_, err = tx.Exec(ctx, `INSERT INTO output_channels(output_id,channel_id,display_name,include_title,include_subtitle,include_description,include_credits,include_categories,include_country,include_year,include_episode_num,include_icon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, outputID, c.ChannelID, c.DisplayName, c.IncludeTitle, c.IncludeSubtitle, c.IncludeDescription, c.IncludeCredits, c.IncludeCategories, c.IncludeCountry, c.IncludeYear, c.IncludeEpisodeNum, c.IncludeIcon)
		if err != nil {
			return fmt.Errorf("save output channel: %w", err)
		}
	}
	_, err = tx.Exec(ctx, `UPDATE outputs SET updated_at=now() WHERE id=$1`, outputID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// OutputSlug returns the public feed slug derived from an output name.
func OutputSlug(name string) string { return outputSlug(name) }

// OutputChannelRecord is a channel rule with the portable channel reference
// (source name + XMLTV external channel id) used by configuration export.
type OutputChannelRecord struct {
	models.OutputChannel
	SourceName string
	ExternalID string
}

// OutputConfigRecord is an output with its ordered channel rules.
type OutputConfigRecord struct {
	ID       int
	Name     string
	Slug     string
	Channels []OutputChannelRecord
}

// ListConfigs returns every output with its channel rules in editor order.
func (r *OutputRepository) ListConfigs(ctx context.Context) ([]OutputConfigRecord, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, slug FROM outputs ORDER BY name`)
	if err != nil {
		return nil, err
	}
	result := make([]OutputConfigRecord, 0)
	index := map[int]int{}
	for rows.Next() {
		var o OutputConfigRecord
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug); err != nil {
			rows.Close()
			return nil, err
		}
		o.Channels = make([]OutputChannelRecord, 0)
		index[o.ID] = len(result)
		result = append(result, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	rows, err = r.db.Query(ctx, `SELECT oc.output_id, oc.channel_id, oc.display_name, oc.include_title, oc.include_subtitle, oc.include_description,
		oc.include_credits, oc.include_categories, oc.include_country, oc.include_year, oc.include_episode_num, oc.include_icon,
		s.name, c.external_id
		FROM output_channels oc JOIN channels c ON c.id = oc.channel_id JOIN sources s ON s.id = c.source_id
		ORDER BY oc.output_id, oc.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var rec OutputChannelRecord
		if err := rows.Scan(&rec.OutputID, &rec.ChannelID, &rec.DisplayName, &rec.IncludeTitle, &rec.IncludeSubtitle, &rec.IncludeDescription,
			&rec.IncludeCredits, &rec.IncludeCategories, &rec.IncludeCountry, &rec.IncludeYear, &rec.IncludeEpisodeNum, &rec.IncludeIcon,
			&rec.SourceName, &rec.ExternalID); err != nil {
			return nil, err
		}
		if i, ok := index[rec.OutputID]; ok {
			result[i].Channels = append(result[i].Channels, rec)
		}
	}
	return result, rows.Err()
}

// ChannelRef identifies a channel portably: source name (lower-cased) + XMLTV id.
type ChannelRef struct {
	Source     string
	ExternalID string
}

// ChannelIDsByRef maps every stored channel to its database id.
func (r *OutputRepository) ChannelIDsByRef(ctx context.Context) (map[ChannelRef]int, error) {
	rows, err := r.db.Query(ctx, `SELECT c.id, s.name, c.external_id FROM channels c JOIN sources s ON s.id = c.source_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[ChannelRef]int{}
	for rows.Next() {
		var id int
		var source, externalID string
		if err := rows.Scan(&id, &source, &externalID); err != nil {
			return nil, err
		}
		result[ChannelRef{Source: strings.ToLower(strings.TrimSpace(source)), ExternalID: externalID}] = id
	}
	return result, rows.Err()
}

// OutputImportWrite is one planned change of an output configuration import.
// ExistingID 0 creates a new output with a fresh token; otherwise the output is
// renamed (when Rename is set) and/or its channel rules are replaced.
type OutputImportWrite struct {
	ExistingID      int
	Name            string
	Rename          bool
	ReplaceChannels bool
	Channels        []models.OutputChannel
}

// ApplyConfigImport creates and updates outputs in one transaction. Outputs are
// never deleted and existing feed tokens are kept.
func (r *OutputRepository) ApplyConfigImport(ctx context.Context, writes []OutputImportWrite) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, w := range writes {
		id := w.ExistingID
		if id == 0 {
			tokenBytes := make([]byte, 24)
			if _, err := rand.Read(tokenBytes); err != nil {
				return err
			}
			if err := tx.QueryRow(ctx, `INSERT INTO outputs(name,slug,public_token) VALUES($1,$2,$3) RETURNING id`,
				w.Name, outputSlug(w.Name), fmt.Sprintf("%x", tokenBytes)).Scan(&id); err != nil {
				return fmt.Errorf("create output %q: %w", w.Name, err)
			}
		} else if w.Rename {
			if _, err := tx.Exec(ctx, `UPDATE outputs SET name=$2, slug=$3, updated_at=now() WHERE id=$1`, id, w.Name, outputSlug(w.Name)); err != nil {
				return fmt.Errorf("rename output %q: %w", w.Name, err)
			}
		}
		if w.ExistingID == 0 || w.ReplaceChannels {
			if _, err := tx.Exec(ctx, `DELETE FROM output_channels WHERE output_id=$1`, id); err != nil {
				return err
			}
			for _, c := range w.Channels {
				if _, err := tx.Exec(ctx, `INSERT INTO output_channels(output_id,channel_id,display_name,include_title,include_subtitle,include_description,include_credits,include_categories,include_country,include_year,include_episode_num,include_icon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
					id, c.ChannelID, c.DisplayName, c.IncludeTitle, c.IncludeSubtitle, c.IncludeDescription, c.IncludeCredits, c.IncludeCategories, c.IncludeCountry, c.IncludeYear, c.IncludeEpisodeNum, c.IncludeIcon); err != nil {
					return fmt.Errorf("save channel rules of output %q: %w", w.Name, err)
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE outputs SET updated_at=now() WHERE id=$1`, id); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}
