# Multicast outputs (`/multicast`) — page override

Overrides [`../MASTER.md`](../MASTER.md) only for the multicast output editor.

- **Wide editor dialog with tabs.** Create/edit uses a `wide` `Dialog` with a
  `.tab-bar` (`role="tablist"`): "Stream settings" (four-column `.field` grid)
  and "Stations (N)". A tab with invalid values shows an error badge with
  text ("Check", "N invalid"), so problems on the hidden tab stay visible.
  The master create/edit rules (dirty banner, discard confirmation,
  `beforeunload`) apply unchanged.
- **Station table is editable.** Rows hold inputs (channel name, frequency,
  transport/network/service ID) instead of read-only values; the second header
  row holds per-column filters, matching the column order of the operator's
  previous headend tool. Duplicate network/transport/service ID triples set
  `aria-invalid` on the affected inputs with a `title` that explains why.
- **Add / relink row.** Source select → channel search → channel select →
  "Add station". The link action on a row reuses the same controls to point
  the row at another channel without changing its DVB identifiers. Stations
  whose channel was deleted show a "Channel missing" error badge.
- **Filtered bulk set.** When station filters are active, a `.bulk-bar`
  offers setting frequency, transport stream ID and network ID for all shown
  stations.
- **Live stream state** in the list refreshes every 5 s: badge with text
  (Streaming / Starting / Stream error / Off / Streaming disabled on server),
  the error message, event count and build time, and stations without
  programmes as a warning line. Bitrate shows the computed value and, while
  streaming, the measured one.
- **TS dump** is a row icon action (`FileVideo`) that downloads one EIT cycle
  as `.ts` for TSDuck/dvbsnoop analysis.
