# XMLTV EPG Aggregator — Implementation Plan

## Overview
Docker stack application for aggregating XMLTV EPG data from multiple sources.
- **Backend:** Go 1.27 + chi router + pgx
- **Frontend:** React 19 + Vite 8 + Tailwind CSS 4
- **Database:** PostgreSQL 17

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│  PostgreSQL │
│  (Nginx)    │     │   (Go)      │     │             │
│  :3000      │     │   :8080     │     │  :5432      │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Database Schema

### sources
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PK |
| name | VARCHAR(200) | UNIQUE, NOT NULL |
| generator_info_name | VARCHAR(500) | |
| generator_info_url | TEXT | |
| last_import_at | TIMESTAMPTZ | |
| last_import_status | VARCHAR(20) | |
| last_import_error | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now() |

### channels
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PK |
| source_id | INT | FK → sources.id |
| external_id | VARCHAR(200) | NOT NULL |
| name | VARCHAR(500) | NOT NULL |
| name_lang | VARCHAR(5) | |
| icon_url | TEXT | |
| url | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| | | UNIQUE(source_id, external_id) |

### programmes
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGSERIAL | PK |
| source_id | INT | FK → sources.id |
| channel_id | INT | FK → channels.id |
| start_time | TIMESTAMPTZ | NOT NULL |
| stop_time | TIMESTAMPTZ | NOT NULL |
| subtitle | TEXT | |
| subtitle_lang | VARCHAR(5) | |
| description | TEXT | |
| description_lang | VARCHAR(5) | |
| country | VARCHAR(10) | |
| year | SMALLINT | |
| episode_num | VARCHAR(20) | |
| episode_num_system | VARCHAR(50) | |
| icon_url | TEXT | |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| | | UNIQUE(source_id, channel_id, start_time) |
| | | INDEX(channel_id, start_time) |

### programme_titles
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGSERIAL | PK |
| programme_id | BIGINT | FK → programmes.id |
| lang | VARCHAR(5) | NOT NULL |
| title | VARCHAR(500) | NOT NULL |
| | | UNIQUE(programme_id, lang) |

### programme_credits
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGSERIAL | PK |
| programme_id | BIGINT | FK → programmes.id |
| type | VARCHAR(20) | NOT NULL |
| name | VARCHAR(200) | NOT NULL |

### programme_categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | BIGSERIAL | PK |
| programme_id | BIGINT | FK → programmes.id |
| lang | VARCHAR(5) | |
| category | VARCHAR(100) | NOT NULL |


## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/health | Health check |
| POST | /api/v1/import | Import XML (multipart, param: source_name) |
| GET | /api/v1/sources | List sources + stats |
| GET | /api/v1/sources/export | Download source configuration XML ([format](docs/source-config-format.md)) |
| POST | /api/v1/sources/import/preview | Validate configuration XML and return the create/update/unchanged plan |
| POST | /api/v1/sources/import | Apply configuration XML (never deletes sources) |
| GET | /api/v1/outputs/export | Download output configuration XML without tokens ([format](docs/output-config-format.md)) |
| POST | /api/v1/outputs/import/preview | Validate output configuration XML; plan with missing channels |
| POST | /api/v1/outputs/import | Apply output configuration XML (never deletes outputs, keeps tokens) |
| GET/POST | /api/v1/multicast-outputs | List (with live status) / create multicast DVB EIT outputs |
| GET/PUT/DELETE | /api/v1/multicast-outputs/:id | Output with stations / replace settings + stations / delete |
| PATCH | /api/v1/multicast-outputs/:id/activation | Switch streaming on/off (`{enabled}`) |
| GET | /api/v1/multicast-outputs/status | Live playout state of every output (`streaming_enabled` = server switch) |
| GET | /api/v1/multicast-outputs/:id/preview | Now/next and event count per station, computed bitrate |
| GET | /api/v1/multicast-outputs/:id/dump.ts | One or more EIT cycles as MPEG-TS (`?cycles=1-10`) |
| GET/POST | /api/v1/multicast-outputs/export, /import/preview, /import | Multicast configuration XML ([format](docs/multicast-config-format.md)) |
| GET | /api/v1/channels | List channels (filter: source_id, search) |
| GET | /api/v1/channels/:id | Channel detail |
| GET | /api/v1/programmes | EPG query (filter: date, channel_id, source_id, page, limit) |
| GET | /api/v1/programmes/:id | Programme detail (with credits, categories) |
| GET | /api/v1/epg/grid | Grid view: date, channel_ids[], start_hour, end_hour |

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | / | Overview: counts, recent imports, quick access |
| EPG Grid | /epg | Main view — TV programme grid (time × channels) |
| Channels | /channels | Channel list with icons, filter by source |
| Programme Detail | /programmes/:id | Full programme details |
| Sources | /sources | Source management: upload XML, import stats |
| Outputs | /outputs | Token-protected XMLTV feeds |
| Multicast outputs | /multicast | DVB EIT multicast streams for DVB-C modulators: settings, stations with DVB ids, live state, TS dump |

## Dependencies

### Frontend (package.json)
| Package | Version |
|---------|---------|
| react | 19.3.1 |
| react-dom | 19.3.1 |
| vite | 8.3.5 |
| typescript | 7.0.2 |
| tailwindcss | 4.3.3 |
| @vitejs/plugin-react | 6.1.2 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |
| @tanstack/react-query | 5.104.5 |
| react-router-dom | 7.18.4 |
| framer-motion | 14.6.0 |
| lucide-react | 1.61.0 |
| clsx | 2.1.1 |
| tailwind-merge | 3.7.0 |
| date-fns | 4.4.0 |
| @tanstack/react-table | 9.3.1 |
| @radix-ui/react-dialog | 1.3.1 |
| @radix-ui/react-select | 2.4.1 |
| @radix-ui/react-tabs | 1.2.1 |
| @radix-ui/react-scroll-area | 1.4.0 |
| @radix-ui/react-tooltip | 1.4.1 |
| @radix-ui/react-slot | 1.5.0 |

### Backend (go.mod)
| Package | Version |
|---------|---------|
| go | 1.27 |
| github.com/go-chi/chi/v5 | v5.5.0 |
| github.com/jackc/pgx/v5 | v5.11.0 |

### Docker Images
| Service | Image |
|---------|-------|
| PostgreSQL | postgres:17-alpine |
| Nginx | nginx:1.27-alpine |
| Go builder | golang:1.27-alpine |

## Implementation Steps

| Step | Task | Status |
|------|------|--------|
| 1 | Project structure + PLAN.md + docker-compose.yml + .env | ⬜ |
| 2 | DB migration SQL (001_init.sql) | ⬜ |
| 3 | Go backend: config, database, models | ⬜ |
| 4 | Go backend: XML parser | ⬜ |
| 5 | Go backend: repositories | ⬜ |
| 6 | Go backend: services | ⬜ |
| 7 | Go backend: HTTP handlers + router + main | ⬜ |
| 8 | Go backend: Dockerfile | ⬜ |
| 9 | Frontend: Vite + React + Tailwind setup | ⬜ |
| 10 | Frontend: API client + hooks | ⬜ |
| 11 | Frontend: Layout + Dashboard | ⬜ |
| 12 | Frontend: EPG Grid | ⬜ |
| 13 | Frontend: Channels + Programme Detail + Sources | ⬜ |
| 14 | Frontend: Dockerfile (nginx) | ⬜ |
| 15 | End-to-end test | ⬜ |

## Key Technical Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Go router | chi v5 | Lightweight, middleware-friendly |
| DB driver | pgx/v5 | Native Go, better performance |
| XML parser | encoding/xml (stdlib) | Sufficient, no external deps |
| Migrations | Raw SQL | Simple, no extra tools |
| Frontend build | Vite 8 + React 19 + TS 7 | Fast dev, modern tooling |
| Frontend styling | Tailwind CSS 4 | Modern, CSS-first config |
| Frontend hosting | Nginx static + proxy | Simple, performant |
| State management | TanStack Query 5 | Server state, caching |
| Routing | React Router 7 | createBrowserRouter API |
| Animations | Framer Motion 14 (motion/react) | Smooth transitions |
| UI components | Radix UI + custom | Accessible, headless |

## Multicast DVB EIT outputs

Replaces the former cherryEPG/Perl chain (import script + SQLite carousel +
`ringelspiel` UDP player) with native Go code in the backend.

- **Model** (migration `008`): `multicast_outputs` (address, port, PID, chunk
  time, days ahead, IANA timezone, text encoding, language, table mode, home
  TSID, TDT/TOT, TTL, interface, enabled), `multicast_output_services`
  (channel link `ON DELETE SET NULL` + source name / XMLTV id snapshot,
  frequency, TSID, ONID, SID, enabled, position) and `multicast_eit_versions`
  (version + content hash per EIT sub_table, kept across restarts).
- **EIT** (`internal/dvb`): p/f (0x4E/0x4F) and schedule (0x50+/0x60+) with
  3-hour segments, up to 16 days; short (0x4D: title + sub-title) and
  extended (0x4E: description, split into up to 16 descriptors) event
  descriptors; UTF-8 (0x15), ISO 8859-2 (0x10 0x00 0x02) or ISO 6937 text;
  event id = start minute (stable across re-imports); version bumped only
  when a sub_table's content changes. Schedule keeps today's past events so
  versions change only with data or at UTC midnight. Default table mode
  signals every station as *actual* with its own TSID (as the Luminato
  headend expects); `actual_other` uses a home TSID.
- **Playout** (`MulticastManager`): one goroutine per enabled output; the
  carousel cycle (`chunk_seconds`) carries the full schedule once and p/f
  every 2 s, split into self-contained slots; 7 TS packets per UDP datagram,
  null-packet padding, continuity counters per PID, absolute-time pacing,
  optional TDT/TOT every 5 s on PID 0x14. Rebuild after imports (5 s
  debounce), at the next p/f change and every 60 s; errors back off 5–60 s.
- **Deployment**: streaming is off unless `MULTICAST_ENABLED=true`;
  `docker-compose.multicast.yml` adds a macvlan interface on the headend
  network. Times in the DB are UTC; the output timezone only drives the TOT
  local time offset.

## Risks & Notes

- **BOM in grab.xml** — parser must strip UTF-8 BOM before parsing
- **Multi-language titles** — grab.xml has `<title lang="cs">` + `<title lang="">` → parser takes all
- **Large files** — grab.xml ~5MB; use streaming xml.Decoder
- **Timezones** — XML has offsets (+0200, +0100); DB stores UTC, frontend converts
- **Deduplication** — UNIQUE(source_id, channel_id, start_time) prevents duplicates on re-import
- **Tailwind 4** — CSS-first config, use `@tailwindcss/vite` plugin, no tailwind.config.js
- **React Router 7** — uses `createBrowserRouter` + `RouterProvider`
- **Framer Motion 14** — import from `"motion/react"` not `"framer-motion"`
