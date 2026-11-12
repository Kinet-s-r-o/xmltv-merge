# Operations map

| Task | Where | Notes |
| --- | --- | --- |
| Install dependencies and run backend checks | [`../../backend/go.mod`](../../backend/go.mod) | Run `cd backend && go test ./...`; the module uses Go 1.27 and pgx/chi. |
| Run frontend checks/build | [`../../frontend/package.json`](../../frontend/package.json) | Run `cd frontend && npm run build`; Vite builds the React/Tailwind app. |
| Start the full local stack | [`../../docker-compose.yml`](../../docker-compose.yml) | PostgreSQL, Go backend and Nginx frontend; use `docker compose up --build`. |
| Validate Compose configuration | [`../../docker-compose.yml`](../../docker-compose.yml) | Run `docker compose config`; values come from environment defaults or an external `.env`. |
| Change backend image/runtime | [`../../backend/Dockerfile`](../../backend/Dockerfile) | Multi-stage Go build; runtime exposes port 8080 and includes CA certificates, tzdata and wget. |
| Change database image/runtime | [`../../backend/postgres.Dockerfile`](../../backend/postgres.Dockerfile) | PostgreSQL 17 with Alpine security updates; su-exec replaces the bundled Go-based gosu. Keep major version 17 for existing data volumes. |
| Change frontend image/runtime | [`../../frontend/Dockerfile`](../../frontend/Dockerfile) | Node build followed by Nginx static serving on port 80. |
| Change proxy/API/feed routing | [`../../frontend/nginx.conf`](../../frontend/nginx.conf) | SPA fallback, `/api/` proxy, public `/feeds/` proxy, upload limit and static cache policy. |
| Change backend configuration | [`../../backend/internal/config/config.go`](../../backend/internal/config/config.go) | `DATABASE_URL` and `PORT`; defaults target local PostgreSQL and port 8080. |
| Check service health | [`../../backend/cmd/server/main.go`](../../backend/cmd/server/main.go), [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go) | `GET` or `HEAD /api/v1/health`; Compose healthchecks use this endpoint. |
| Change schema bootstrap | [`../../backend/internal/database/db.go`](../../backend/internal/database/db.go) | Embedded `migrations/*.sql` are sorted and executed at startup. |
| Change source refresh cadence | [`../../backend/internal/service/scheduler.go`](../../backend/internal/service/scheduler.go), [`../../backend/internal/repository/source_repo.go`](../../backend/internal/repository/source_repo.go) | Scheduler scans due enabled sources every minute and cleans history hourly. |
| Change customer feed access | [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go), [`../../backend/internal/repository/output_repo.go`](../../backend/internal/repository/output_repo.go) | Feed is `/feeds/{slug}.xml?token=...`; token is a secret-link credential. |
| Verify a change before handoff | Root [`../../AGENTS.md`](../../AGENTS.md) | Run backend tests, frontend build and Compose config validation appropriate to the change. |

Container builds pull fresh base images and upgrade Alpine packages. To apply
security updates, rebuild with `docker compose build --pull --no-cache`, then
recreate services with `docker compose up -d`. Rescan the resulting images;
updating source files alone does not patch running containers.
