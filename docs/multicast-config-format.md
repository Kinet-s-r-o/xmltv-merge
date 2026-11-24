# Multicast output configuration file (XML, version 1)

The Multicast outputs page exports and imports the **configuration** of DVB
EIT multicast outputs and their stations as a versioned XML file, for backups
and for moving the headend setup between installations. Companion of
[`source-config-format.md`](source-config-format.md); import sources first so
that the channels referenced here exist.

Never exported: database ids, the on/off state, EIT section versions,
programmes and timestamps.

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<multicast-outputs version="1" exported-at="2026-11-24T10:00:00Z">
  <output>
    <name>Kablovka_new</name>
    <description>EPG for the DVB-C headend</description>
    <multicast address="233.11.22.241" port="1234" ttl="16" interface=""></multicast>
    <eit pid="18" chunk-seconds="30" days-ahead="4" timezone="Europe/Bratislava" encoding="utf8"
         language="slk" table-mode="actual" home-tsid="" tdt-tot="false"></eit>
    <service source="EPG - kinet.sk" id="Jednotka" frequency="306" tsid="1001" onid="1" sid="20" enabled="true">
      <name>Jednotka HD</name>
    </service>
  </output>
</multicast-outputs>
```

## Schema

| Node | Required | Rules |
| --- | --- | --- |
| `<multicast-outputs>` | yes | Root element. |
| `@version` | yes | Must be `1`. |
| `@exported-at` | no | RFC 3339 UTC timestamp written by export; ignored on import. |
| `<output>` | 1–200 | One per multicast stream. |
| `<name>` | yes | Trimmed, 1–200 characters, unique in the file case-insensitively. |
| `<description>` | no | Free text. |
| `<multicast>` | yes | `address` (IPv4 in 224.0.0.0/4, not 224.0.0.0/24), `port` (1–65535), `ttl` (1–255, default 16), `interface` (name or IPv4 address; empty uses the server default). |
| `<eit>` | no | `pid` (16–8190, default 18), `chunk-seconds` (2–300, default 30), `days-ahead` (1–16, default 4), `timezone` (IANA, default `Europe/Bratislava`), `encoding` (`utf8`, `iso8859-2`, `iso6937`; default `utf8`), `language` (ISO 639-2, default `slk`), `table-mode` (`actual` or `actual_other`), `home-tsid` (required for `actual_other`), `tdt-tot` (`true`/`false`, default `false`; PID 20 is then reserved). |
| `<service>` | 0–2000 per output | One station, in list order. |
| `<service @source>`, `@id` | yes | Source name (case-insensitive) and XMLTV channel id (exact). |
| `@tsid`, `@sid` | yes | Transport stream id 0–65535, service id 1–65535. |
| `@onid` | no | Original network id 0–65535, default 1. The triple onid/tsid/sid must be unique within an output. |
| `@frequency` | no | Informative (MHz), not signalled in the EIT. |
| `@enabled` | no | `true`/`false`, default `true`. |
| `<name>` | no | Station name shown in the UI; defaults to the XMLTV id. |

Unknown elements are ignored, a UTF-8 BOM is accepted, maximum file size is
8 MB. Every output is validated with the same rules as the API.

## Endpoints

- `GET /api/v1/multicast-outputs/export` → `multicast-outputs-YYYYMMDD-HHMMSS.xml`.
- `POST /api/v1/multicast-outputs/import/preview` (multipart `file`) validates
  and returns the plan without writing.
- `POST /api/v1/multicast-outputs/import` (multipart `file`) recomputes the plan
  and applies it in one transaction.

Plan shape (collections are arrays, never `null`):

```json
{
  "version": "1",
  "items": [
    {
      "name": "Kablovka_new",
      "action": "update",
      "existing_id": 1,
      "changes": ["eit", "services"],
      "service_count": 12,
      "missing_channels": [{ "source": "EPG - kinet.sk", "id": "RTVS24" }]
    }
  ],
  "summary": { "create": 0, "update": 1, "unchanged": 0, "missing_channels": 1 },
  "applied": false
}
```

## Matching rules

- Outputs are matched by name (case-insensitive). A match gets the file's
  settings and station list; outputs missing from the file are kept.
- Existing outputs keep their on/off state; new outputs are created **off**.
- Stations whose source name + XMLTV id do not exist are imported unlinked and
  reported in `missing_channels`. They carry no events until a channel with
  that reference is imported, then they link automatically.
- An update that would move an enabled output onto the address and port of
  another enabled output is rejected.
