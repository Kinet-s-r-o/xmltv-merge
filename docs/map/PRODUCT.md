# Product map

| Task | Where | Notes |
| --- | --- | --- |
| Understand the current architecture and planned scope | [`../../PLAN.md`](../../PLAN.md) | Original architecture, schema, API and implementation record; validate against code. |
| Add or change XMLTV parsing | [`../../backend/internal/parser/xmltv.go`](../../backend/internal/parser/xmltv.go) | XMLTV structures, BOM-safe decode, date/time parsing and parsed result model. |
| Change file/URL import behavior | [`../../backend/internal/service/import_service.go`](../../backend/internal/service/import_service.go) | Validates HTTP(S) sources, size limit, source status and current/future replacement. |
| Change source persistence or source statistics | [`../../backend/internal/repository/source_repo.go`](../../backend/internal/repository/source_repo.go) | Source CRUD, due selection, import status and activation persistence. |
| Change scheduled refresh or retention | [`../../backend/internal/service/scheduler.go`](../../backend/internal/service/scheduler.go) | Minute-level due imports and hourly history cleanup. |
| Change channels or programme queries | [`../../backend/internal/repository/channel_repo.go`](../../backend/internal/repository/channel_repo.go), [`../../backend/internal/repository/programme_repo.go`](../../backend/internal/repository/programme_repo.go) | Filters, pagination, programme details and retention queries. |
| Change output configuration or feed serialization | [`../../backend/internal/repository/output_repo.go`](../../backend/internal/repository/output_repo.go), [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go) | Transactional channel rules, field selection, token lookup and XMLTV output. |
| Change database schema | [`../../backend/internal/database/migrations/`](../../backend/internal/database/migrations/) | Add the next numbered SQL migration; migrations are embedded by `db.go`. |
| Change API routes or HTTP status behavior | [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go), [`../../backend/cmd/server/main.go`](../../backend/cmd/server/main.go) | Router registration is in `main.go`; request/response behavior is in `handler.go`. |
| Change API types or frontend request contracts | [`../../backend/internal/models/models.go`](../../backend/internal/models/models.go), [`../../frontend/src/api/client.ts`](../../frontend/src/api/client.ts) | Keep JSON names and empty collection behavior aligned. |
| Change source management UI | [`../../frontend/src/pages/Sources.tsx`](../../frontend/src/pages/Sources.tsx) | URL sources, edit/delete, refresh, search and enabled switch. |
| Change output editor UI | [`../../frontend/src/pages/Outputs.tsx`](../../frontend/src/pages/Outputs.tsx) | Channel search, source labels, field toggles, tokenized feed URL. |
| Change EPG browsing UI | [`../../frontend/src/pages/EPGView.tsx`](../../frontend/src/pages/EPGView.tsx), [`../../frontend/src/pages/ProgrammeDetail.tsx`](../../frontend/src/pages/ProgrammeDetail.tsx) | Date/channel filtering, paging and programme details. |
| Change navigation or global UI behavior | [`../../frontend/src/components/layout/Layout.tsx`](../../frontend/src/components/layout/Layout.tsx), [`../../frontend/src/router.tsx`](../../frontend/src/router.tsx), [`../../frontend/src/index.css`](../../frontend/src/index.css) | Routes, sidebar, theme and global styling. |
| Change the visual system or UI conventions | [`../../design-system/xmltv-epg/MASTER.md`](../../design-system/xmltv-epg/MASTER.md) | Authoritative design tokens, layout, accessibility, interaction and responsive rules; page overrides live under `design-system/xmltv-epg/pages/`. |
