# XMLTV Merge

## Purpose

XMLTV EPG Aggregator: imports XMLTV schedules from uploaded files or HTTP(S)
sources, stores them in PostgreSQL, serves EPG data through a Go API, and
provides a React web UI plus configurable public XMLTV feeds.

## Read first

- Read [`docs/map/PRODUCT.md`](docs/map/PRODUCT.md) for feature ownership.
- Read [`docs/map/OPERATIONS.md`](docs/map/OPERATIONS.md) for commands,
  deployment and runtime configuration.
- Read the area router before changing that area:
  [`backend/README.md`](backend/README.md) or
  [`frontend/README.md`](frontend/README.md).
- For any UI change, read the visual source of truth:
  [`design-system/xmltv-epg/MASTER.md`](design-system/xmltv-epg/MASTER.md).
- [`PLAN.md`](PLAN.md) is the current architecture and implementation record;
  verify it against code when they disagree.

## Hard rules

- Preserve the Go/PostgreSQL/React split and the existing API contracts unless
  the task explicitly changes them.
- Database migrations are embedded and applied in sorted filename order. Add a
  new numbered migration for schema changes; do not rewrite applied history.
- Keep source lifecycle changes end to end: persistence, API, scheduler/manual
  refresh behavior, and UI must agree.
- Keep public feed URLs token-protected. Do not expose real tokens, credentials,
  private hosts, or environment values in documentation or logs.
- Empty API collections must serialize as `[]`, not `null`; preserve the
  frontend null-safe fallbacks for collection queries.
- XMLTV imports must retain timezone handling, duplicate protection, current /
  future replacement, and source history cleanup behavior.
- Preserve unrelated working-tree changes. Do not commit, push, deploy, or
  change application behavior when the task only asks for documentation.
- System-wide UI changes update the design-system master; page-specific
  exceptions belong under `design-system/xmltv-epg/pages/`.

## Core checks

Run from the relevant directory:

```sh
cd backend && go test ./...
cd frontend && npm run build
docker compose config
```

For a runtime check, use `docker compose up --build` and verify
`/api/v1/health` through the frontend proxy. Do not assume Git SHA equality
proves runtime equality.

## Project map upkeep

- Start from the relevant map, then read only the files it routes to; search
  further when the map is incomplete.
- When a file, endpoint, migration, service, or UI area is added, moved, or
  removed, update the owning router in the same change.
- Keep this file under roughly 8 KB. Put detailed reference material in
  `docs/` or the owning area README.
