# Backend router

| Folder or file | What lives there | Read before changing |
| --- | --- | --- |
| `cmd/server/main.go` | Application startup, dependency wiring, scheduler start, middleware, routes and graceful shutdown. | `internal/config`, `internal/database`, `internal/handler`, `internal/service`. |
| `postgres.Dockerfile` | PostgreSQL 17 image with Alpine security updates and su-exec privilege switching. | Root `docker-compose.yml` and `../docs/map/OPERATIONS.md`; preserve the database major version. |
| `internal/config/` | Environment-backed runtime configuration. | `config.go`; keep secret values out of docs. |
| `internal/database/` | PostgreSQL pool setup and embedded ordered migrations. | `db.go` and the full migration sequence. |
| `internal/database/migrations/` | Schema for sources, channels, programmes, retention, activation, outputs and feed tokens. | Add a new numbered migration; do not rewrite applied migrations. |
| `internal/models/` | JSON/database-facing Go structs for sources, channels, programmes and outputs. | `models.go` and frontend `src/api/client.ts`. |
| `internal/parser/` | XMLTV decode and normalization into import records. | `xmltv.go`; preserve timezone, BOM and multilingual handling. |
| `internal/repository/source_repo.go` | Source CRUD, due selection, activation, import status and transactional configuration import (never deletes). | Scheduler and import service when changing lifecycle behavior. |
| `internal/repository/channel_repo.go` | Channel upsert, list/search and lookup. | Import service and output editor contracts. |
| `internal/repository/programme_repo.go` | Programme upsert/list/detail and history cleanup. | Import service, EPG API and retention behavior. |
| `internal/repository/output_repo.go` | Output slug/token generation, channel rules and transactional saves. | Feed handlers and output editor. |
| `internal/service/source_config.go` | Versioned XML source configuration: export, parse/validate, import plan (create/update/unchanged) and apply. Tested in `source_config_test.go`. | `../docs/source-config-format.md`, `SourceRepository.ApplyConfigImport`. |
| `internal/service/import_service.go` | File/URL import orchestration and validation. | Parser, source/channel/programme repositories and scheduler. |
| `internal/service/epg_service.go` | Thin application service over read/write repositories. | Handler contracts and repository changes. |
| `internal/service/scheduler.go` | Due source imports and hourly programme retention cleanup. | Source enabled/interval/history semantics. |
| `internal/handler/handler.go` | HTTP handlers, JSON contracts, XMLTV feed serialization and source configuration export/import (`/api/v1/sources/export`, `/import/preview`, `/import`). | `cmd/server/main.go` route registration and frontend API client. |

## Checks

Run `go test ./...` from `backend/`. Unit tests currently cover the source
configuration XML parse/validation/plan (`internal/service`); other packages
are compile-checked only.
