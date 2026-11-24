# Source configuration file (XML, version 1)

The Sources page exports and imports the **configuration** of URL sources as a
small versioned XML file. It is meant for backups and for moving sources
between installations. It is not an XMLTV file: channels, programmes and
runtime state (last import, counts, errors) are never included.

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xmltv-sources version="1" exported-at="2026-11-24T10:00:00Z">
  <source enabled="true">
    <name>Provider EPG – SK</name>
    <url>https://provider.example/epg.xml.gz</url>
    <refresh-interval-hours>6</refresh-interval-hours>
    <history-days>7</history-days>
  </source>
</xmltv-sources>
```

## Schema

| Node | Required | Rules |
| --- | --- | --- |
| `<xmltv-sources>` | yes | Root element. |
| `@version` | yes | Must be `1`. Other versions are rejected. |
| `@exported-at` | no | RFC 3339 UTC timestamp written by export; ignored on import. |
| `<source>` | 1–1000 | One per source. |
| `<source @enabled>` | no | `true`/`false` (or `1`/`0`); defaults to `true`. |
| `<name>` | yes | Trimmed, 1–200 characters, unique in the file (case-insensitive). |
| `<url>` | yes | Absolute `http` or `https` URL, at most 2048 characters. |
| `<refresh-interval-hours>` | yes | Whole number, 1–168. |
| `<history-days>` | yes | Whole number, 1–3650. |

Unknown elements are ignored. A UTF-8 BOM is accepted. Maximum file size is
1 MB. Values are text content, so XML escaping (`&amp;`, `&lt;`) applies.

## Export

`GET /api/v1/sources/export` returns `xmltv-sources-YYYYMMDD-HHMMSS.xml`
(`Content-Disposition: attachment`). Only sources with a URL are exported;
sources created by a one-off file upload have no URL and are skipped. Stored
intervals are minutes; export rounds them to whole hours, clamped to 1–168.

## Import

Import is two steps; both take a multipart upload with field `file`:

1. `POST /api/v1/sources/import/preview` validates the file and returns the
   plan without writing anything.
2. `POST /api/v1/sources/import` validates again, recomputes the plan against
   the current database and applies it in one transaction.

Both return the same JSON shape (`items` and `changes` are always arrays):

```json
{
  "version": "1",
  "items": [
    {
      "name": "Provider EPG – SK",
      "url": "https://provider.example/epg.xml.gz",
      "enabled": true,
      "refresh_interval_minutes": 360,
      "history_days": 7,
      "action": "update",
      "existing_id": 3,
      "changes": ["url"]
    }
  ],
  "summary": { "create": 0, "update": 1, "unchanged": 0 },
  "applied": false
}
```

Matching rules:

- Sources are matched to existing ones by name, case-insensitively.
- `create`: no source with that name exists; a new source is added and
  downloaded on the next scheduler run (if enabled).
- `update`: the file differs (`changes` lists `name`, `url`, `enabled`,
  `refresh_interval`, `history_days`); the source takes the file's values.
  Changing name, URL, interval or history clears the import status exactly
  like a manual edit, so the source downloads again. Changing only `enabled`
  keeps the status. Stored channels and programmes are kept.
- `unchanged`: identical configuration; skipped.
- Sources not listed in the file are never modified or deleted.

Validation failures return `422` with every problem, and nothing is written:

```json
{
  "error": "2 problem(s) found; nothing was imported",
  "details": [
    "source 2 (\"Provider\"): <refresh-interval-hours> must be between 1 and 168 hours, got 0",
    "source 3: <name> is required"
  ]
}
```

Implementation: `backend/internal/service/source_config.go` (schema, parse,
validation, plan; tested in `source_config_test.go`),
`SourceRepository.ApplyConfigImport`, handlers `ExportSources`,
`PreviewSourceImport`, `ImportSources`; UI in
`frontend/src/pages/Sources.tsx` and
`frontend/src/components/sources/SourceImportDialog.tsx`.
