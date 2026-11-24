# Backend router

| Folder or file | What lives there | Read before changing |
| --- | --- | --- |
| `cmd/server/main.go` | Application startup, dependency wiring, scheduler start, middleware, routes and graceful shutdown. | `internal/config`, `internal/database`, `internal/handler`, `internal/service`. |
| `postgres.Dockerfile` | PostgreSQL 17 image with Alpine security updates and su-exec privilege switching. | Root `docker-compose.yml` and `../docs/map/OPERATIONS.md`; preserve the database major version. |
| `internal/config/` | Environment-backed runtime configuration. | `config.go`; keep secret values out of docs. |
| `internal/database/` | PostgreSQL pool setup and embedded ordered migrations. | `db.go` and the full migration sequence. |
| `internal/database/migrations/` | Schema for sources, channels, programmes, retention, activation, outputs, feed tokens and multicast outputs (`008`: outputs, stations, EIT versions). | Add a new numbered migration; do not rewrite applied migrations. |
| `internal/models/` | JSON/database-facing Go structs for sources, channels, programmes and outputs. | `models.go` and frontend `src/api/client.ts`. |
| `internal/parser/` | XMLTV decode and normalization into import records. | `xmltv.go`; preserve timezone, BOM and multilingual handling. |
| `internal/repository/source_repo.go` | Source CRUD, due selection, activation, import status and transactional configuration import (never deletes). | Scheduler and import service when changing lifecycle behavior. |
| `internal/repository/channel_repo.go` | Channel upsert, list/search and lookup. | Import service and output editor contracts. |
| `internal/repository/programme_repo.go` | Programme upsert/list/detail and history cleanup. | Import service, EPG API and retention behavior. |
| `internal/repository/output_repo.go` | Output slug/token generation, channel rules, transactional saves, and configuration export/import (`ListConfigs`, `ChannelIDsByRef`, `ApplyConfigImport`; never deletes, keeps tokens). | Feed handlers and output editor. |
| `internal/service/config_file.go` | Shared helpers for versioned XML configuration files: `ConfigFileError` (422 details), size-limited read, root/version check, bool parsing. | Both `source_config.go` and `output_config.go`. |
| `internal/service/output_config.go` | Versioned XML output configuration: export (no tokens), parse/validate, portable channel references (source name + XMLTV id), import plan with missing channels, apply. Tested in `output_config_test.go`. | `../docs/output-config-format.md`, `OutputRepository.ApplyConfigImport`. |
| `internal/service/source_config.go` | Versioned XML source configuration: export, parse/validate, import plan (create/update/unchanged) and apply. Tested in `source_config_test.go`. | `../docs/source-config-format.md`, `SourceRepository.ApplyConfigImport`. |
| `internal/service/import_service.go` | File/URL import orchestration and validation. | Parser, source/channel/programme repositories and scheduler. |
| `internal/service/epg_service.go` | Thin application service over read/write repositories. | Handler contracts and repository changes. |
| `internal/service/scheduler.go` | Due source imports and hourly programme retention cleanup. | Source enabled/interval/history semantics. |
| `internal/dvb/` | DVB SI generation without DB/network dependencies: CRC-32/MPEG-2, MJD/BCD time, EN 300 468 text encodings, short/extended event descriptors, EIT p/f + schedule (actual/other, segments, versions), TDT/TOT, TS packetization, carousel/dump and the multicast UDP sender. Tested in `dvb_test.go`. | EN 300 468 / TR 101 211; keep event ids stable (start minute). |
| `internal/repository/multicast_repo.go` | Multicast outputs, stations (channel link `ON DELETE SET NULL` + source/XMLTV snapshot, `RelinkMissing`), EIT version persistence, programme window query for EIT and transactional config import. | Migration `008`, `multicast_service.go`. |
| `internal/service/multicast_service.go` | Validation, CRUD, EIT build per output, preview (now/next per station) and TS dump. | `internal/dvb`, frontend multicast editor. |
| `internal/service/multicast_streamer.go` | `MulticastManager`: one playout goroutine per enabled output, reconcile on config change, rebuild on import / p-f change / 60 s, pacing, continuity counters, backoff and live status. | `MULTICAST_*` env in `internal/config`. |
| `internal/service/multicast_config.go` | Versioned XML multicast configuration export/parse/plan/apply. Tested in `multicast_config_test.go`. | `../docs/multicast-config-format.md`. |
| `internal/handler/multicast.go` | `/api/v1/multicast-outputs` handlers (CRUD, activation, status, preview, `dump.ts`, export/import). | Route registration in `cmd/server/main.go`. |
| `internal/handler/handler.go` | HTTP handlers, JSON contracts, XMLTV feed serialization and source/output configuration export/import (`/api/v1/{sources,outputs}/export`, `/import/preview`, `/import`) via the shared `configImport` helper. | `cmd/server/main.go` route registration and frontend API client. |

## Checks

Run `go test ./...` from `backend/`. Unit tests cover the source, output and multicast
configuration XML parse/validation/plan (`internal/service`) and the DVB/EIT
encoder (`internal/dvb`); other packages are compile-checked only.
