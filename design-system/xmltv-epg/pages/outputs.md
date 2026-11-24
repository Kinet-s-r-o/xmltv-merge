# Outputs (`/outputs`) — page override

Overrides [`../MASTER.md`](../MASTER.md) only for the feed editor.
Classes live in `frontend/src/index.css` §18.

- **Master–detail split.** `.split-layout` puts a 280px feed list
  (`.feed-list` / `.feed-item`, styled like active nav links, with
  `aria-current`) beside the editor at ≥1024px; below that they stack.
- **Channel picker** is a checkbox list (`.picker-row` labels wrapping native
  checkboxes) rather than a data table, because selection is its only action.
  "Select shown" / "Clear shown" act on the filtered rows.
- **Per-channel rules** render as `.data-panel-section` blocks with an output
  station name and a `fieldset` of field checkboxes in `.rule-grid`
  (1 / 2 / 3 columns).
- **Feed URL** is a read-only mono input with a Copy button and a hint that the
  URL contains the access token. Never print the token elsewhere on the page or
  in notices.
- **Unsaved state** is shown as text and badge ("Unsaved" warning / "Saved"
  success) in the Feed settings header; Save is disabled when nothing changed.
