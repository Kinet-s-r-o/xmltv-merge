# Frontend router

| Folder or file | What lives there | Read before changing |
| --- | --- | --- |
| `src/main.tsx` | React root, TanStack Query client and router provider. | Query defaults and global bootstrapping. |
| `src/router.tsx` | Browser routes for dashboard, EPG, channels, programme detail, sources and outputs. | Add a route here and update navigation if needed. |
| `src/api/client.ts` | Fetch wrapper, TypeScript API models and all backend calls. | Keep JSON fields and empty-array handling aligned with Go. |
| `src/components/layout/Layout.tsx` | Sidebar navigation, theme toggle and page shell. | Global navigation and layout behavior. |
| `src/pages/Dashboard.tsx` | Source-backed counts and quick links. | Source statistics contract. |
| `src/pages/EPGView.tsx` | Date/channel filtered programme grid, paging and selection. | Programme query parameters and detail navigation. |
| `src/pages/Channels.tsx` | Channel listing with search and source filter. | Channel API and source list. |
| `src/pages/ProgrammeDetail.tsx` | Full programme metadata, credits and categories. | Programme detail response shape. |
| `src/pages/Sources.tsx` | URL source CRUD, refresh, activation, search and import status UI. | Source lifecycle API and disabled-source behavior. |
| `src/pages/Outputs.tsx` | Configurable output editor, channel search/source labels, field toggles and public URL. | Output/channel serialization contract. |
| `src/index.css` | Tailwind import, theme variables and scrollbar styling. | Global visual behavior and light/dark theme. |
| `../design-system/xmltv-epg/MASTER.md` | Project-wide visual source of truth. | Read before UI changes; page overrides are under its `pages/` directory. |
| `vite.config.ts` | Vite/Tailwind plugins and local `/api` proxy. | Local development routing. |
| `nginx.conf` | Production SPA fallback, backend API/feed proxy and static caching. | Container/runtime routing. |

## Checks

Run `npm run build` from `frontend/`. Use the existing `node_modules` only for
local validation; dependency changes belong in `package.json` and the lockfile.
