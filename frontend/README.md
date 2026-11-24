# Frontend router

| Folder or file | What lives there | Read before changing |
| --- | --- | --- |
| `index.html` | HTML shell and pre-paint theme script (`data-theme` on `<html>`). | Theme storage key in `src/lib/theme.ts`. |
| `src/main.tsx` | React root, IBM Plex font imports, TanStack Query client, Feedback provider and router. | Query defaults and global bootstrapping. |
| `src/router.tsx` | Browser routes for dashboard, EPG, channels, programme detail, sources, outputs, multicast outputs, System (users, roles, RADIUS servers) and My account; all wrapped in `AuthGate`, each section route in `RequirePermission`. | Add a route here, give it a section, and update navigation if needed. |
| `src/components/auth/` | `AuthGate` (session query, sign-in page until signed in, clears cached data on sign-in/out and on 401), `LoginPage` (first-admin setup, credentials, TOTP code, TOTP enrollment), `RequirePermission`, `TotpQrCode`, `UserTypeIndicator`. | `../docs/authentication.md`. |
| `src/lib/auth.tsx` | `SECTIONS` / `PERMISSION_ACTIONS` (mirror backend `auth.Sections`), `useAuth()` with `can(section, action)`. | Hide actions the role cannot perform; the backend enforces them anyway. |
| `src/pages/system/` | `Users` (local/remote indicator, 2FA, lock), `Roles` (permission matrix), `RadiusServers` (CRUD, activation, test request). | `../design-system/xmltv-epg/pages/system.md`. |
| `src/pages/Account.tsx` | Own profile, password change (local users), TOTP enrollment/disable and effective permissions. | `authApi` in `src/api/client.ts`. |
| `src/api/client.ts` | `apiFetch` wrapper (same-origin cookie, `X-CSRF-Token` on unsafe methods, 401 fires `UNAUTHORIZED_EVENT`), TypeScript API models and all backend calls (`api`, `authApi`, `systemApi`). | Keep JSON fields and empty-array handling aligned with Go. |
| `src/components/layout/Layout.tsx` | Kinet app shell: grouped sidebar filtered by Read permission (Monitor / Configure / System), collapsible rail, mobile drawer, topbar with API service pill, theme switch and user menu (My account, 2FA, Sign out). | Global navigation and layout behavior. |
| `src/components/ui/` | Shared Kinet components: `Dialog`, `ConfirmDialog`, `Feedback` (notice stack, `useFeedback`), `PageHeader`, `ResourceState` (loading/empty/error), `Pagination`, `AppErrorBoundary`, `ImportPreviewDialog` (generic configuration import preview/confirm), `TableControls` (table search, column sorting, column filter dropdowns, filter chips, drag/keyboard column reorder, column show/hide menu, per-table localStorage persistence under `xmltv-table:<key>`; used by every record table). | Dialog a11y contract and copy rules in the design master. |
| `src/components/sources/SourceImportDialog.tsx` | Preview/confirm dialog for source configuration import (new / updated / unchanged, validation errors). | `../docs/source-config-format.md`. |
| `src/lib/theme.ts`, `src/lib/sourceStatus.ts` | Theme preference (dark/light/system); source status labels, badges and timestamp formatting. | Keep status labels in sync across Dashboard and Sources. |
| `src/lib/configTransfer.ts` | `useConfigTransfer`: hidden file input, export download, server-side preview and confirmed apply for XML configuration files. | Sources and Outputs pages; `../docs/*-config-format.md`. |
| `src/components/outputs/OutputImportDialog.tsx` | Output configuration import preview (new / updated / unchanged, channel changes, channels not found). | `../docs/output-config-format.md`. |
| `src/lib/tableSelection.ts` | `useTableSelection`: row checkboxes, page select-all, Shift range, Ctrl/Cmd+A and Delete shortcuts for data tables. | Selection rules in the design master (Tables → Row selection). |
| `src/pages/Dashboard.tsx` | Source totals register and the source import status table (search, column sort and filters, paging). | Source statistics contract. |
| `src/pages/EPGView.tsx` | Date/channel filtered programme grid, paging and selection. | Programme query parameters and detail navigation. |
| `src/pages/Channels.tsx` | Channel listing (all channels loaded once; search, column sort and filters client-side, Source as a column filter); opens a station's schedule dialog. | Channel API and source list. |
| `src/components/channels/StationScheduleDialog.tsx` | One station's schedule: days as rows, 24 h horizontally, opens at the current time. | `../design-system/xmltv-epg/pages/channels.md`; programmes query (`channel_id`, `limit`). |
| `src/pages/ProgrammeDetail.tsx` | Full programme metadata, credits and categories. | Programme detail response shape. |
| `src/pages/Sources.tsx` | URL source CRUD (add/edit in a modal with unsaved-changes guard), refresh, activation, search, paging, import status UI, XML configuration Import/Export and bulk delete / download & import of selected sources. | Source lifecycle API and disabled-source behavior. |
| `src/pages/MulticastOutputs.tsx` | Multicast DVB EIT outputs: list with live stream state (5 s polling), on/off switch, TS dump download, bulk delete and XML Import/Export. | `../design-system/xmltv-epg/pages/multicast.md`; `/api/v1/multicast-outputs`. |
| `src/components/multicast/` | `MulticastOutputDialog` (tabbed create/edit: stream settings + editable station table with filters, add/relink, filtered bulk set, now/next preview) and `MulticastImportDialog`. | `../docs/multicast-config-format.md`. |
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
