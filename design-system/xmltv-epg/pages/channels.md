# Channels (`/channels`) — page override

Overrides [`../MASTER.md`](../MASTER.md) only for the station schedule dialog.
Classes live in `frontend/src/index.css` next to the EPG timeline
(`.station-schedule*`, reusing `.epg-*`).

- **Opening it.** Each channel row has a "Schedule" icon button
  (`CalendarDays`, `aria-label="Show schedule of <name>"`) and the channel name
  is a `.btn-link`; both open `StationScheduleDialog`
  (`frontend/src/components/channels/`) in the `wide` (1120px) `Dialog`.
- **Axes are transposed from the EPG grid.** Rows are days, the horizontal
  axis is 24 hours at 120px per hour (the EPG grid uses 160px because it shows
  one day). The sticky first column (150px) shows the weekday and date; today
  carries a warning "Today" badge, a warning-tinted cell and a 3px warning
  inset bar. Every day between the first and last day with programmes is
  shown; empty days say "No programmes stored for this day".
- **Data.** One request: `GET /api/v1/programmes?channel_id=<id>&limit=5000`
  (all stored days of that station). If the total is higher, a warning alert
  says how many are shown. A programme crossing midnight is drawn on both days.
- **Opens at now.** On open, the grid scrolls horizontally so the current
  time sits one hour right of the day column and vertically to today's row.
  The current-time line and `HH:mm` label are drawn on today's row only.
- **Programme blocks** reuse `.epg-programme` (`.is-live`, `.is-past`) but are
  links to `/programmes/:id` with `state.from = '/channels'`; the detail
  page's back button then reads "Back to channels".
- The scroll area is capped to the dialog height (`.station-schedule-scroll`)
  so the hour header stays sticky; the legend sits below it.
