# Documentation map

| Question | Where | Notes |
| --- | --- | --- |
| What is the intended architecture and scope? | [`../../PLAN.md`](../../PLAN.md) | Historical implementation plan that still documents the main design. |
| Where are all feature ownership links? | [`PRODUCT.md`](PRODUCT.md) | Start here for backend/frontend/database changes. |
| How do I run, build, deploy, or health-check the stack? | [`OPERATIONS.md`](OPERATIONS.md) | Operational commands and owning files. |
| What rules apply to every coding task? | [`../../AGENTS.md`](../../AGENTS.md) | Always-loaded project instructions and map upkeep rules. |
| What is the database schema? | [`../../backend/internal/database/migrations/001_init.sql`](../../backend/internal/database/migrations/001_init.sql) and later migrations | Current truth is the ordered migration set, not only `PLAN.md`. |
| What is the public feed contract? | [`../../backend/internal/handler/handler.go`](../../backend/internal/handler/handler.go) and [`../../frontend/src/pages/Outputs.tsx`](../../frontend/src/pages/Outputs.tsx) | Backend serializes XMLTV; UI exposes the copyable tokenized URL. |
| What is the source configuration export/import format? | [`../source-config-format.md`](../source-config-format.md) | Versioned XML schema, endpoints and matching rules. |
| What is the output configuration export/import format? | [`../output-config-format.md`](../output-config-format.md) | Portable channel references, no tokens, missing-channel reporting. |
| What visual rules apply to UI work? | [`../../design-system/xmltv-epg/MASTER.md`](../../design-system/xmltv-epg/MASTER.md) | Project-wide visual source of truth; route-specific exceptions are under its `pages/` directory. |
