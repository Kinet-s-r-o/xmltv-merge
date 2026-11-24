# Output configuration file (XML, version 1)

The Outputs page exports and imports the **configuration** of outputs
(aggregated customer feeds) as a versioned XML file, for backups and for moving
feeds between installations. Companion of
[`source-config-format.md`](source-config-format.md); import sources first so
that the channels referenced here exist.

Never exported: public feed tokens, database ids, slugs (derived from the
name), programmes and timestamps.

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xmltv-outputs version="1" exported-at="2026-11-24T10:00:00Z">
  <output>
    <name>Customer A</name>
    <channel source="Provider EPG – SK" id="joj.sk">
      <display-name>JOJ</display-name>
      <fields title="true" subtitle="true" description="true" credits="false" categories="false"
              country="false" year="false" episode-num="false" icon="true"></fields>
    </channel>
  </output>
</xmltv-outputs>
```

## Schema

| Node | Required | Rules |
| --- | --- | --- |
| `<xmltv-outputs>` | yes | Root element. |
| `@version` | yes | Must be `1`. |
| `@exported-at` | no | RFC 3339 UTC timestamp written by export; ignored on import. |
| `<output>` | 1–500 | One per feed. |
| `<name>` | yes | Trimmed, 1–200 characters, at least one letter or digit. Unique in the file case-insensitively, and its feed slug (lower-case letters/digits joined by `-`) must be unique too. |
| `<channel>` | 0–5000 per output | Channel rule, in feed order. |
| `<channel @source>` | yes | Source name (matched case-insensitively). |
| `<channel @id>` | yes | XMLTV channel id (`external_id`) within that source, matched exactly. The pair must be unique within an output. |
| `<display-name>` | no | Output station name, at most 500 characters. Empty is allowed. |
| `<fields>` | no | Attributes `title`, `subtitle`, `description`, `credits`, `categories`, `country`, `year`, `episode-num`, `icon`: `true`/`false` (or `1`/`0`). A missing element or attribute means `true`. |

Unknown elements are ignored, a UTF-8 BOM is accepted, maximum file size is
8 MB.

## Endpoints

- `GET /api/v1/outputs/export` → `xmltv-outputs-YYYYMMDD-HHMMSS.xml`
  (`Content-Disposition: attachment`).
- `POST /api/v1/outputs/import/preview` (multipart `file`) validates and
  returns the plan without writing.
- `POST /api/v1/outputs/import` (multipart `file`) validates, recomputes the
  plan against the current database and applies it in one transaction.

Plan shape (all collections are arrays, never `null`):

```json
{
  "version": "1",
  "items": [
    {
      "name": "Customer A",
      "slug": "customer-a",
      "action": "update",
      "existing_id": 4,
      "changes": ["channels", "rules"],
      "channel_count": 12,
      "channels_added": 1,
      "channels_removed": 2,
      "channels_changed": 3,
      "missing_channels": [{ "source": "Provider CZ", "id": "ct1.cz" }]
    }
  ],
  "summary": { "create": 0, "update": 1, "unchanged": 0, "missing_channels": 1 },
  "applied": false
}
```

## Matching rules

- Outputs are matched to existing ones by name, case-insensitively.
- `create`: a new output with a **freshly generated feed token**; its feed URL
  must be shared again.
- `update`: the output's channel list is **replaced** by the file's channels
  (order, station names, field rules). Its slug, feed URL and token are kept.
  `changes` lists `name` (casing), `channels` (added/removed), `rules`
  (station name or fields), `order`.
- `unchanged`: identical; skipped.
- Outputs not in the file are never modified or deleted.
- Channel references that match no `source name + XMLTV id` on this instance
  are reported in `missing_channels` (per output and in the summary) and left
  out; the rest of the output is imported. Import the sources and run their
  first download, then import the file again to add them.
- A new output whose slug equals an existing output with a different name is a
  conflict (422), because feed slugs are unique.

Validation failures return `422` `{ "error": "...", "details": ["output 2
(\"Feed\"): channel 3 (\"x\"): listed twice; ..."] }` and nothing is written.

Implementation: `backend/internal/service/output_config.go` (tests in
`output_config_test.go`), shared helpers in `config_file.go`,
`OutputRepository.ListConfigs` / `ChannelIDsByRef` / `ApplyConfigImport`,
handlers `ExportOutputs`, `PreviewOutputImport`, `ImportOutputs`; UI in
`frontend/src/pages/Outputs.tsx` and
`frontend/src/components/outputs/OutputImportDialog.tsx`.
