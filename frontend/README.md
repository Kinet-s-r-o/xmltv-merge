# Frontend router

| Folder or file | What lives there | Read before changing |
| --- | --- | --- |
| `index.html` | HTML shell and pre-paint theme script (`data-theme` on `<html>`). | Theme storage key in `src/lib/theme.ts`. |
| `src/main.tsx` | React root, IBM Plex font imports, TanStack Query client, Feedback provider and router. | Query defaults and global bootstrapping. |
| `src/router.tsx` | Browser routes for dashboard, EPG, channels, programme detail, sources and outputs. | Add a route here and update navigation if needed. |
| `src/api/client.ts` | Fetch wrapper, TypeScript API models and all backend calls. | Keep JSON fields and empty-array handling aligned with Go. |
| `src/components/layout/Layout.tsx` | Kinet app shell: grouped sidebar (collapsible rail, mobile drawer), topbar with API service pill and theme switch. | Global navigation and layout behavior. |
| `src/components/ui/` | Shared Kinet components: `Dialog`, `ConfirmDialog`, `Feedback` (notice stack, `useFeedback`), `PageHeader`, `ResourceState` (loading/empty/error), `Pagination`, `AppErrorBoundary`, `ImportPreviewDialog` (generic configuration import preview/confirm). | Dialog a11y contract and copy rules in the design master. |
| `src/components/sources/SourceImportDialog.tsx` | Preview/confirm dialog for source configuration import (new / updated / unchanged, validation errors). | `../docs/source-config-format.md`. |
| `src/lib/theme.ts`, `src/lib/sourceStatus.ts` | Theme preference (dark/light/system); source status labels, badges and timestamp formatting. | Keep status labels in sync across Dashboard and Sources. |
| `src/lib/configTransfer.ts` | `useConfigTransfer`: hidden file input, export download, server-side preview and confirmed apply for XML configuration files. | Sources and Outputs pages; `../docs/*-config-format.md`. |
| `src/components/outputs/OutputImportDialog.tsx` | Output configuration import preview (new / updated / unchanged, channel changes, channels not found). | `../docs/output-config-format.md`. |
| `src/lib/tableSelection.ts` | `useTableSelection`: row checkboxes, page select-all, Shift range, Ctrl/Cmd+A and Delete shortcuts for data tables. | Selection rules in the design master (Tables → Row selection). |
| `src/pages/Dashboard.tsx` | Source-backed counts and quick links. | Source statistics contract. |
| `src/pages/EPGView.tsx` | Date/channel filtered programme grid, paging and selection. | Programme query parameters and detail navigation. |
| `src/pages/Channels.tsx` | Channel listing with search and source filter; opens a station's schedule dialog. | Channel API and source list. |
| `src/components/channels/StationScheduleDialog.tsx` | One station's schedule: days as rows, 24 h horizontally, opens at the current time. | `../design-system/xmltv-epg/pages/channels.md`; programmes query (`channel_id`, `limit`). |
| `src/pages/ProgrammeDetail.tsx` | Full programme metadata, credits and categories. | Programme detail response shape. |
| `src/pages/Sources.tsx` | URL source CRUD (add/edit in a modal with unsaved-changes guard), refresh, activation, search, paging, import status UI, XML configuration Import/Export and bulk delete / download & import of selected sources. | Source lifecycle API and disabled-source behavior. |
| `src/pages/Outputs.tsx` | Configurable output editor, channel search/source labels, field toggles, public URL and XML configuration Import/Export (Import is disabled while the open output has unsaved changes). | Output/channel serialization contract. |
| `src/index.css` | Kinet tokens (dark/light), `@theme inline` semantic utilities, base reset and all component classes, including EPG timeline and output editor. | Global visual behavior; no raw hex or palette-shade utilities. |
| `../design-system/xmltv-epg/MASTER.md` | Project-wide visual source of truth. | Read before UI changes; page overrides are under its `pages/` directory. |
| `vite.config.ts` | Vite/Tailwind plugins and local `/api` proxy. | Local development routing. |
| `nginx.conf` | Production SPA fallback, backend API/feed proxy and static caching. | Container/runtime routing. |
| `Dockerfile`, `.dockerignore` | Locked npm install and patched Nginx image; exclude host dependencies and build output. | Root `docker-compose.yml` and `../docs/map/OPERATIONS.md`. |

## Checks

Run `npm run build` from `frontend/`, then
`node ../.claude/skills/ui-ux/scripts/validate-design.mjs src` (its
`data-table` check reports React `className` tables as false positives). Use the existing `node_modules` only for
local validation; dependency changes belong in `package.json` and the lockfile.
