package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"xmltv-merge/internal/dvb"
	"xmltv-merge/internal/models"
)

// MulticastRepository persists multicast outputs, their DVB services and
// EIT sub_table versions.
type MulticastRepository struct{ db *pgxpool.Pool }

func NewMulticastRepository(db *pgxpool.Pool) *MulticastRepository {
	return &MulticastRepository{db: db}
}

// Pool returns the underlying connection pool.
func (r *MulticastRepository) Pool() *pgxpool.Pool { return r.db }

const multicastOutputColumns = `o.id, o.name, o.description, o.multicast_address, o.multicast_port, o.pid, o.chunk_seconds,
	o.timezone, o.days_ahead, o.text_encoding, o.language_code, o.table_mode, o.home_transport_stream_id,
	o.include_tdt_tot, o.ttl, o.interface, o.enabled, o.created_at, o.updated_at`

func scanMulticastOutput(row pgx.Row, extra ...any) (models.MulticastOutput, error) {
	var o models.MulticastOutput
	dest := []any{&o.ID, &o.Name, &o.Description, &o.MulticastAddress, &o.MulticastPort, &o.PID, &o.ChunkSeconds,
		&o.Timezone, &o.DaysAhead, &o.TextEncoding, &o.LanguageCode, &o.TableMode, &o.HomeTransportStreamID,
		&o.IncludeTDTTOT, &o.TTL, &o.Interface, &o.Enabled, &o.CreatedAt, &o.UpdatedAt}
	err := row.Scan(append(dest, extra...)...)
	o.LanguageCode = strings.TrimSpace(o.LanguageCode)
	return o, err
}

// List returns every output with its service count, ordered by name.
func (r *MulticastRepository) List(ctx context.Context) ([]models.MulticastOutput, error) {
	rows, err := r.db.Query(ctx, `SELECT `+multicastOutputColumns+`,
		(SELECT COUNT(*) FROM multicast_output_services s WHERE s.output_id = o.id)
		FROM multicast_outputs o ORDER BY o.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]models.MulticastOutput, 0)
	for rows.Next() {
		var count int
		o, err := scanMulticastOutput(rows, &count)
		if err != nil {
			return nil, err
		}
		o.ServiceCount = count
		result = append(result, o)
	}
	return result, rows.Err()
}

// Get returns an output with its services, or nil when it does not exist.
func (r *MulticastRepository) Get(ctx context.Context, id int) (*models.MulticastOutput, error) {
	o, err := scanMulticastOutput(r.db.QueryRow(ctx, `SELECT `+multicastOutputColumns+` FROM multicast_outputs o WHERE o.id = $1`, id))
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	services, err := r.services(ctx, `WHERE s.output_id = $1`, id)
	if err != nil {
		return nil, err
	}
	o.Services = services
	o.ServiceCount = len(services)
	return &o, nil
}

func (r *MulticastRepository) services(ctx context.Context, where string, args ...any) ([]models.MulticastService, error) {
	rows, err := r.db.Query(ctx, `SELECT s.id, s.output_id, s.channel_id, s.source_name, s.external_id, s.display_name,
		s.frequency, s.transport_stream_id, s.original_network_id, s.service_id, s.enabled,
		c.id, c.source_id, c.external_id, c.name, COALESCE(c.name_lang, ''), COALESCE(c.icon_url, ''), COALESCE(c.url, ''), c.created_at,
		COALESCE(src.name, '')
		FROM multicast_output_services s
		LEFT JOIN channels c ON c.id = s.channel_id
		LEFT JOIN sources src ON src.id = c.source_id
		`+where+` ORDER BY s.output_id, s.position, s.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]models.MulticastService, 0)
	for rows.Next() {
		var s models.MulticastService
		var cID, cSource *int
		var cExternal, cName *string
		var cLang, cIcon, cURL, sourceName string
		var cCreated *time.Time
		if err := rows.Scan(&s.ID, &s.OutputID, &s.ChannelID, &s.SourceName, &s.ExternalID, &s.DisplayName,
			&s.Frequency, &s.TransportStreamID, &s.OriginalNetworkID, &s.ServiceID, &s.Enabled,
			&cID, &cSource, &cExternal, &cName, &cLang, &cIcon, &cURL, &cCreated, &sourceName); err != nil {
			return nil, err
		}
		if cID != nil {
			s.Channel = &models.Channel{ID: *cID, SourceID: *cSource, ExternalID: *cExternal, Name: *cName,
				NameLang: cLang, IconURL: cIcon, URL: cURL, CreatedAt: *cCreated}
			// Keep the portable reference current (source renamed etc.).
			s.SourceName, s.ExternalID = sourceName, *cExternal
		} else {
			s.Missing = true
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// Services returns the services of the given outputs keyed by output id.
func (r *MulticastRepository) Services(ctx context.Context, outputIDs []int) (map[int][]models.MulticastService, error) {
	list, err := r.services(ctx, `WHERE s.output_id = ANY($1)`, outputIDs)
	if err != nil {
		return nil, err
	}
	result := map[int][]models.MulticastService{}
	for _, s := range list {
		result[s.OutputID] = append(result[s.OutputID], s)
	}
	return result, nil
}

// Create inserts an output and its services in one transaction.
func (r *MulticastRepository) Create(ctx context.Context, o models.MulticastOutput) (int, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	id, err := insertMulticastOutput(ctx, tx, o)
	if err != nil {
		return 0, err
	}
	if err := replaceMulticastServices(ctx, tx, id, o.Services); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

func insertMulticastOutput(ctx context.Context, tx pgx.Tx, o models.MulticastOutput) (int, error) {
	var id int
	err := tx.QueryRow(ctx, `INSERT INTO multicast_outputs(name, description, multicast_address, multicast_port, pid, chunk_seconds,
		timezone, days_ahead, text_encoding, language_code, table_mode, home_transport_stream_id, include_tdt_tot, ttl, interface, enabled)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
		o.Name, o.Description, o.MulticastAddress, o.MulticastPort, o.PID, o.ChunkSeconds, o.Timezone, o.DaysAhead,
		o.TextEncoding, o.LanguageCode, o.TableMode, o.HomeTransportStreamID, o.IncludeTDTTOT, o.TTL, o.Interface, o.Enabled).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("create multicast output %q: %w", o.Name, err)
	}
	return id, nil
}

func updateMulticastOutput(ctx context.Context, tx pgx.Tx, o models.MulticastOutput) (bool, error) {
	tag, err := tx.Exec(ctx, `UPDATE multicast_outputs SET name=$2, description=$3, multicast_address=$4, multicast_port=$5,
		pid=$6, chunk_seconds=$7, timezone=$8, days_ahead=$9, text_encoding=$10, language_code=$11, table_mode=$12,
		home_transport_stream_id=$13, include_tdt_tot=$14, ttl=$15, interface=$16, enabled=$17, updated_at=now() WHERE id=$1`,
		o.ID, o.Name, o.Description, o.MulticastAddress, o.MulticastPort, o.PID, o.ChunkSeconds, o.Timezone, o.DaysAhead,
		o.TextEncoding, o.LanguageCode, o.TableMode, o.HomeTransportStreamID, o.IncludeTDTTOT, o.TTL, o.Interface, o.Enabled)
	if err != nil {
		return false, fmt.Errorf("update multicast output %q: %w", o.Name, err)
	}
	return tag.RowsAffected() > 0, nil
}

func replaceMulticastServices(ctx context.Context, tx pgx.Tx, outputID int, services []models.MulticastService) error {
	if _, err := tx.Exec(ctx, `DELETE FROM multicast_output_services WHERE output_id=$1`, outputID); err != nil {
		return err
	}
	for i, s := range services {
		if _, err := tx.Exec(ctx, `INSERT INTO multicast_output_services(output_id, channel_id, source_name, external_id, display_name,
			frequency, transport_stream_id, original_network_id, service_id, enabled, position)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			outputID, s.ChannelID, s.SourceName, s.ExternalID, s.DisplayName, s.Frequency,
			s.TransportStreamID, s.OriginalNetworkID, s.ServiceID, s.Enabled, i); err != nil {
			return fmt.Errorf("save service %q: %w", s.DisplayName, err)
		}
	}
	return nil
}

// Update replaces an output's settings and services in one transaction.
func (r *MulticastRepository) Update(ctx context.Context, o models.MulticastOutput) (bool, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	ok, err := updateMulticastOutput(ctx, tx, o)
	if err != nil || !ok {
		return ok, err
	}
	if err := replaceMulticastServices(ctx, tx, o.ID, o.Services); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func (r *MulticastRepository) Delete(ctx context.Context, id int) (bool, error) {
	tag, err := r.db.Exec(ctx, `DELETE FROM multicast_outputs WHERE id=$1`, id)
	return tag.RowsAffected() > 0, err
}

func (r *MulticastRepository) SetEnabled(ctx context.Context, id int, enabled bool) (bool, error) {
	tag, err := r.db.Exec(ctx, `UPDATE multicast_outputs SET enabled=$2, updated_at=now() WHERE id=$1`, id, enabled)
	return tag.RowsAffected() > 0, err
}

// EnabledConflict returns the name of another enabled output that streams to
// the same address and port, or "" when there is none.
func (r *MulticastRepository) EnabledConflict(ctx context.Context, id int, address string, port int) (string, error) {
	var name string
	err := r.db.QueryRow(ctx, `SELECT name FROM multicast_outputs WHERE enabled AND id <> $1 AND multicast_address = $2 AND multicast_port = $3 LIMIT 1`,
		id, address, port).Scan(&name)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return name, err
}

// RelinkMissing reconnects services whose channel was deleted to a channel
// with the same source name and XMLTV id, and returns how many were linked.
func (r *MulticastRepository) RelinkMissing(ctx context.Context) (int64, error) {
	tag, err := r.db.Exec(ctx, `UPDATE multicast_output_services s SET channel_id = c.id
		FROM channels c JOIN sources src ON src.id = c.source_id
		WHERE s.channel_id IS NULL AND s.external_id <> ''
		AND lower(src.name) = lower(s.source_name) AND c.external_id = s.external_id`)
	return tag.RowsAffected(), err
}

// LoadVersions returns the persisted EIT sub_table versions of an output.
func (r *MulticastRepository) LoadVersions(ctx context.Context, outputID int) (map[dvb.SubTableKey]dvb.VersionEntry, error) {
	rows, err := r.db.Query(ctx, `SELECT table_id, original_network_id, transport_stream_id, service_id, version, content_hash
		FROM multicast_eit_versions WHERE output_id = $1`, outputID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[dvb.SubTableKey]dvb.VersionEntry{}
	for rows.Next() {
		var table, onid, tsid, sid, version int
		var hash int64
		if err := rows.Scan(&table, &onid, &tsid, &sid, &version, &hash); err != nil {
			return nil, err
		}
		key := dvb.SubTableKey{TableID: uint8(table), ONID: uint16(onid), TSID: uint16(tsid), SID: uint16(sid)}
		result[key] = dvb.VersionEntry{Version: uint8(version), Hash: uint64(hash)}
	}
	return result, rows.Err()
}

// SaveVersions upserts changed EIT sub_table versions of an output.
func (r *MulticastRepository) SaveVersions(ctx context.Context, outputID int, entries map[dvb.SubTableKey]dvb.VersionEntry) error {
	if len(entries) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for k, v := range entries {
		batch.Queue(`INSERT INTO multicast_eit_versions(output_id, table_id, original_network_id, transport_stream_id, service_id, version, content_hash)
			VALUES($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (output_id, table_id, original_network_id, transport_stream_id, service_id)
			DO UPDATE SET version = EXCLUDED.version, content_hash = EXCLUDED.content_hash, updated_at = now()`,
			outputID, int(k.TableID), int(k.ONID), int(k.TSID), int(k.SID), int(v.Version), int64(v.Hash))
	}
	return r.db.SendBatch(ctx, batch).Close()
}

// ProgrammesForEIT returns programmes of channelIDs overlapping [from, to),
// ordered by channel and start. The title prefers lang3/lang2 when present.
func (r *MulticastRepository) ProgrammesForEIT(ctx context.Context, channelIDs []int, from, to time.Time, lang3, lang2 string) (map[int][]dvb.Event, error) {
	result := map[int][]dvb.Event{}
	if len(channelIDs) == 0 {
		return result, nil
	}
	rows, err := r.db.Query(ctx, `SELECT p.channel_id, p.start_time, p.stop_time, COALESCE(t.title, ''),
		COALESCE(p.subtitle, ''), COALESCE(p.description, '')
		FROM programmes p
		LEFT JOIN LATERAL (
			SELECT title FROM programme_titles WHERE programme_id = p.id
			ORDER BY CASE WHEN lower(lang) IN ($4, $5) THEN 0 ELSE 1 END, lang LIMIT 1
		) t ON TRUE
		WHERE p.channel_id = ANY($1) AND p.stop_time > $2 AND p.start_time < $3
		ORDER BY p.channel_id, p.start_time`, channelIDs, from, to, lang3, lang2)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var channelID int
		var ev dvb.Event
		if err := rows.Scan(&channelID, &ev.Start, &ev.Stop, &ev.Title, &ev.Subtitle, &ev.Description); err != nil {
			return nil, err
		}
		result[channelID] = append(result[channelID], ev)
	}
	return result, rows.Err()
}

// ChannelRefs maps lower-cased source name + XMLTV id to channel ids.
func (r *MulticastRepository) ChannelRefs(ctx context.Context) (map[ChannelRef]int, error) {
	return (&OutputRepository{db: r.db}).ChannelIDsByRef(ctx)
}

// ApplyConfigImport creates (ID 0) or updates outputs and replaces their
// services in one transaction. Outputs are never deleted.
func (r *MulticastRepository) ApplyConfigImport(ctx context.Context, outputs []models.MulticastOutput) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, o := range outputs {
		id := o.ID
		if id == 0 {
			if id, err = insertMulticastOutput(ctx, tx, o); err != nil {
				return err
			}
		} else if _, err := updateMulticastOutput(ctx, tx, o); err != nil {
			return err
		}
		if err := replaceMulticastServices(ctx, tx, id, o.Services); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
