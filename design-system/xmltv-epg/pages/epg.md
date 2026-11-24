# EPG grid (`/epg`) — page override

Overrides [`../MASTER.md`](../MASTER.md) only for the programme timeline.
Classes live in `frontend/src/index.css` §17 (`.epg-*`).

- **Timeline instead of a data table.** Stations are rows, the day is a 24-hour
  horizontal axis at 160px per hour. The station column is sticky (220px,
  140px below 640px via `--epg-station-width`); the hour header row is sticky
  (z-20) inside `.epg-scroll`, which scrolls in both axes so the page never
  scrolls horizontally.
- **Inline geometry is allowed** for programme `left`/`width`, hour lines and
  the current-time line only, and each such element carries
  `data-dynamic-style`.
- **Programme blocks** are `<button class="epg-programme">` with 3px radius,
  accent tint (`/.1` fill, `/.3` border). On-air programmes use the success
  tint (`.is-live`), ended programmes are dimmed (`.is-past`, opacity .62).
  Each block has an `aria-label` with title, station, time range and "on air
  now" — the state is never color-only, and the footer legend names all three
  markers.
- **Current-time line** uses `--warning` with a mono `HH:mm` label in
  `--shadow-color` text for contrast in both themes.
- **Programme preview** opens the shared large `Dialog`; "Open full detail"
  links to `/programmes/:id` and preserves the grid URL as the back target.
- Collection fallbacks (`sourceData ?? []`, `channelData ?? []`,
  `programmes?.data ?? []`) are required so an empty database renders the
  empty state instead of crashing.
