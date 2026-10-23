package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/models"
)

type ProgrammeRepository struct {
	db *pgxpool.Pool
}

func NewProgrammeRepository(db *pgxpool.Pool) *ProgrammeRepository {
	return &ProgrammeRepository{db: db}
}

func (r *ProgrammeRepository) DeleteCurrentAndFuture(ctx context.Context, sourceID int, channelIDs []int, from time.Time) error {
	if len(channelIDs) == 0 {
		return nil
	}
	_, err := r.db.Exec(ctx,
		`DELETE FROM programmes
		 WHERE source_id = $1 AND channel_id = ANY($2::int[]) AND start_time >= $3`,
		sourceID, channelIDs, from,
	)
	return err
}

func (r *ProgrammeRepository) CleanupHistory(ctx context.Context) (int64, error) {
	result, err := r.db.Exec(ctx,
		`DELETE FROM programmes p USING sources s
		 WHERE p.source_id = s.id
		   AND p.start_time < now() - (s.history_days * interval '1 day')`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (r *ProgrammeRepository) Upsert(ctx context.Context, sourceID, channelID int, startTime, stopTime time.Time,
	subtitle, subtitleLang, desc, descLang, country, iconURL, epNum, epNumSys string, year *int16) (int64, error) {

	var id int64
	err := r.db.QueryRow(ctx,
		`INSERT INTO programmes (source_id, channel_id, start_time, stop_time, subtitle, subtitle_lang,
			description, description_lang, country, year, episode_num, episode_num_system, icon_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 ON CONFLICT (source_id, channel_id, start_time) DO UPDATE SET
			stop_time = EXCLUDED.stop_time,
			subtitle = EXCLUDED.subtitle,
			subtitle_lang = EXCLUDED.subtitle_lang,
			description = EXCLUDED.description,
			description_lang = EXCLUDED.description_lang,
			country = EXCLUDED.country,
			year = EXCLUDED.year,
			episode_num = EXCLUDED.episode_num,
			episode_num_system = EXCLUDED.episode_num_system,
			icon_url = EXCLUDED.icon_url
		 RETURNING id`,
		sourceID, channelID, startTime, stopTime, subtitle, subtitleLang,
		desc, descLang, country, year, epNum, epNumSys, iconURL,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("upsert programme: %w", err)
	}
	return id, nil
}

func (r *ProgrammeRepository) InsertTitles(ctx context.Context, programmeID int64, titles []models.Title) error {
	for _, t := range titles {
		_, err := r.db.Exec(ctx,
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

func (r *ProgrammeRepository) InsertCredits(ctx context.Context, programmeID int64, credits []models.Credit) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM programme_credits WHERE programme_id = $1`, programmeID); err != nil {
		return err
	}
	for _, c := range credits {
		if _, err := r.db.Exec(ctx,
			`INSERT INTO programme_credits (programme_id, type, name) VALUES ($1, $2, $3)`,
			programmeID, c.Type, c.Name,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *ProgrammeRepository) InsertCategories(ctx context.Context, programmeID int64, categories []models.Category) error {
	if _, err := r.db.Exec(ctx, `DELETE FROM programme_categories WHERE programme_id = $1`, programmeID); err != nil {
		return err
	}
	for _, c := range categories {
		if _, err := r.db.Exec(ctx,
			`INSERT INTO programme_categories (programme_id, lang, category) VALUES ($1, $2, $3)`,
			programmeID, c.Lang, c.Category,
		); err != nil {
			return err
		}
	}
	return nil
}

func (r *ProgrammeRepository) List(ctx context.Context, date *time.Time, channelID *int, sourceID *int, page, limit int) ([]models.Programme, int, error) {
	query := `SELECT p.id, p.source_id, p.channel_id, p.start_time, p.stop_time,
		        p.subtitle, p.subtitle_lang, p.description, p.description_lang,
		        p.country, p.year, p.episode_num, p.episode_num_system, p.icon_url, p.created_at,
		        COALESCE(title.lang, ''), COALESCE(title.title, '')
		 FROM programmes p
		 LEFT JOIN LATERAL (
			SELECT lang, title FROM programme_titles WHERE programme_id = p.id ORDER BY lang LIMIT 1
		 ) title ON TRUE
		 WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM programmes p WHERE 1=1`
	args := []interface{}{}
	argNum := 1

	if date != nil {
		query += fmt.Sprintf(" AND p.start_time >= $%d AND p.start_time < $%d::date + interval '1 day'", argNum, argNum)
		countQuery += fmt.Sprintf(" AND p.start_time >= $%d AND p.start_time < $%d::date + interval '1 day'", argNum, argNum)
		args = append(args, *date)
		argNum++
	}
	if channelID != nil {
		query += fmt.Sprintf(" AND p.channel_id = $%d", argNum)
		countQuery += fmt.Sprintf(" AND p.channel_id = $%d", argNum)
		args = append(args, *channelID)
		argNum++
	}
	if sourceID != nil {
		query += fmt.Sprintf(" AND p.source_id = $%d", argNum)
		countQuery += fmt.Sprintf(" AND p.source_id = $%d", argNum)
		args = append(args, *sourceID)
		argNum++
	}

	query += fmt.Sprintf(" ORDER BY p.start_time LIMIT $%d OFFSET $%d", argNum, argNum+1)
	args = append(args, limit, (page-1)*limit)

	var total int
	if err := r.db.QueryRow(ctx, countQuery, args[:len(args)-2]...).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var programmes []models.Programme
	for rows.Next() {
		var p models.Programme
		var titleLang, titleText string
		if err := rows.Scan(&p.ID, &p.SourceID, &p.ChannelID, &p.StartTime, &p.StopTime,
			&p.Subtitle, &p.SubtitleLang, &p.Description, &p.DescriptionLang,
			&p.Country, &p.Year, &p.EpisodeNum, &p.EpisodeNumSys, &p.IconURL, &p.CreatedAt,
			&titleLang, &titleText); err != nil {
			return nil, 0, err
		}
		if titleText != "" {
			p.Titles = []models.Title{{ProgrammeID: p.ID, Lang: titleLang, Title: titleText}}
		}
		programmes = append(programmes, p)
	}
	return programmes, total, nil
}

func (r *ProgrammeRepository) GetByID(ctx context.Context, id int64) (*models.Programme, error) {
	var p models.Programme
	var channelName, channelIcon string
	err := r.db.QueryRow(ctx,
		`SELECT p.id, p.source_id, p.channel_id, p.start_time, p.stop_time,
		        p.subtitle, p.subtitle_lang, p.description, p.description_lang,
		        p.country, p.year, p.episode_num, p.episode_num_system, p.icon_url, p.created_at,
		        c.name, c.icon_url
		 FROM programmes p
		 JOIN channels c ON c.id = p.channel_id
		 WHERE p.id = $1`, id,
	).Scan(&p.ID, &p.SourceID, &p.ChannelID, &p.StartTime, &p.StopTime,
		&p.Subtitle, &p.SubtitleLang, &p.Description, &p.DescriptionLang,
		&p.Country, &p.Year, &p.EpisodeNum, &p.EpisodeNumSys, &p.IconURL, &p.CreatedAt,
		&channelName, &channelIcon)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.Channel = &models.Channel{Name: channelName, IconURL: channelIcon}

	// Load titles
	titleRows, err := r.db.Query(ctx, `SELECT id, programme_id, lang, title FROM programme_titles WHERE programme_id = $1`, id)
	if err != nil {
		return nil, err
	}
	for titleRows.Next() {
		var t models.Title
		if err := titleRows.Scan(&t.ID, &t.ProgrammeID, &t.Lang, &t.Title); err != nil {
			titleRows.Close()
			return nil, err
		}
		p.Titles = append(p.Titles, t)
	}
	titleRows.Close()

	// Load credits
	creditRows, err := r.db.Query(ctx, `SELECT id, programme_id, type, name FROM programme_credits WHERE programme_id = $1`, id)
	if err != nil {
		return nil, err
	}
	for creditRows.Next() {
		var c models.Credit
		if err := creditRows.Scan(&c.ID, &c.ProgrammeID, &c.Type, &c.Name); err != nil {
			creditRows.Close()
			return nil, err
		}
		p.Credits = append(p.Credits, c)
	}
	creditRows.Close()

	// Load categories
	catRows, err := r.db.Query(ctx, `SELECT id, programme_id, lang, category FROM programme_categories WHERE programme_id = $1`, id)
	if err != nil {
		return nil, err
	}
	for catRows.Next() {
		var c models.Category
		if err := catRows.Scan(&c.ID, &c.ProgrammeID, &c.Lang, &c.Category); err != nil {
			catRows.Close()
			return nil, err
		}
		p.Categories = append(p.Categories, c)
	}
	catRows.Close()

	return &p, nil
}
