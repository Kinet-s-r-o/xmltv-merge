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
| Change backend configuration | [`../../backend/internal/config/config.go`](../../backend/internal/config/config.go) | `DATABASE_URL`, `PORT`, `MULTICAST_ENABLED` (default off), `MULTICAST_INTERFACE` (name or IPv4), `MULTICAST_LOOPBACK`; defaults target local PostgreSQL and port 8080. |
| Configure authentication | [`../authentication.md`](../authentication.md), [`../../backend/internal/config/config.go`](../../backend/internal/config/config.go), [`../../.env.example`](../../.env.example) | First start without users shows a setup page (or set `ADMIN_USERNAME`/`ADMIN_PASSWORD`). Set `AUTH_SECRET_KEY` to encrypt RADIUS secrets and TOTP seeds; also `AUTH_COOKIE_SECURE`, `AUTH_SESSION_IDLE_MINUTES`, `AUTH_SESSION_MAX_HOURS`, `AUTH_LOCKOUT_THRESHOLD`, `AUTH_LOCKOUT_MINUTES`, `AUTH_TRUST_PROXY_HEADERS`, `CORS_ALLOWED_ORIGINS`. |
| Send multicast EIT to the DVB-C network | [`../../docker-compose.yml`](../../docker-compose.yml), [`../../.env.example`](../../.env.example) | The backend always joins the macvlan network `catv`; set `MULTICAST_ENABLED=true`, `MULTICAST_PARENT_IF` (host NIC in the headend network, e.g. a Proxmox VLAN-tagged vNIC), `MULTICAST_SUBNET`, `MULTICAST_GATEWAY`, `MULTICAST_IPV4` (also in Coolify environment variables). Without a parent the network is an internal dummy (defaults `172.31.254.0/24`, change on conflict). The bridge network alone never reaches the LAN. On Proxmox disable the firewall MAC filter on that vNIC. One deployment per parent interface/subnet. Switches with IGMP snooping need a querier on that VLAN. |
| Check a multicast output | [`../../backend/internal/handler/multicast.go`](../../backend/internal/handler/multicast.go) | `GET /api/v1/multicast-outputs/{id}/dump.ts` (or the UI dump button) for offline analysis, e.g. `tsp -I file eit.ts -P tables --pid 18 -O drop`; on the network `tsp -I ip <group>:<port> -P bitrate_monitor -O drop`. Live state: `GET /api/v1/multicast-outputs/status`. |
| Check service health | [`../../backend/cmd/server/main.go`](../../backend/cmd/server/main.go), [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go) | `GET` or `HEAD /api/v1/health` (public, no session); Compose healthchecks use this endpoint. All other `/api/v1` endpoints need a session. |
| Change schema bootstrap | [`../../backend/internal/database/db.go`](../../backend/internal/database/db.go) | Embedded `migrations/*.sql` are sorted and executed at startup. |
| Change source refresh cadence | [`../../backend/internal/service/scheduler.go`](../../backend/internal/service/scheduler.go), [`../../backend/internal/repository/source_repo.go`](../../backend/internal/repository/source_repo.go) | Scheduler scans due enabled sources every minute and cleans history hourly. |
| Change customer feed access | [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go), [`../../backend/internal/repository/output_repo.go`](../../backend/internal/repository/output_repo.go) | Feed is `/feeds/{slug}.xml?token=...`; token is a secret-link credential. |
| Verify a change before handoff | Root [`../../AGENTS.md`](../../AGENTS.md) | Run backend tests, frontend build and Compose config validation appropriate to the change. |

Container builds pull fresh base images and upgrade Alpine packages. To apply
security updates, rebuild with `docker compose build --pull --no-cache`, then
recreate services with `docker compose up -d`. Rescan the resulting images;
updating source files alone does not patch running containers.
