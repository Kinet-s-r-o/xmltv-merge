import type { MulticastImportItem, MulticastImportPlan } from '../../api/client'
import type { ConfigImportState } from '../../lib/configTransfer'
import { IMPORT_ACTION_BADGE, IMPORT_ACTION_LABEL, ImportPreviewDialog } from '../ui/ImportPreviewDialog'

interface MulticastImportDialogProps {
  state: ConfigImportState<MulticastImportPlan>
  applying: boolean
  applyError: string | null
  onClose: () => void
  onConfirm: () => void
}

const CHANGE_LABEL: Record<string, string> = {
  name: 'name casing',
  description: 'description',
  multicast: 'multicast address',
  eit: 'EIT settings',
  services: 'stations',
}

/**
 * Preview of a multicast output configuration import. Outputs are matched by
 * name; their settings and station list are replaced by the file's. Existing
 * outputs keep their on/off state, new outputs are created switched off.
 * Stations whose channel does not exist yet are kept unlinked. Nothing is
 * deleted.
 */
export function MulticastImportDialog(props: MulticastImportDialogProps) {
  return (
    <ImportPreviewDialog<MulticastImportItem, MulticastImportPlan>
      {...props}
      title="Import multicast output configuration"
      noun={['multicast output', 'multicast outputs']}
      matchingNote="Outputs are matched by name; outputs not listed in the file are kept, nothing is deleted."
      updateNote="Updated outputs get the file's multicast address, EIT settings and station list and keep streaming if they are switched on. New outputs are created switched off — check them, then switch them on."
      formatHint={'<multicast-outputs version="1"> with one <output> per stream and <service source="…" id="…" tsid="…" onid="…" sid="…"> per station'}
      extraSummary={(plan) => plan.summary.missing_channels > 0 && (
        <span className="badge badge-error">{plan.summary.missing_channels} channel{plan.summary.missing_channels === 1 ? '' : 's'} not found</span>
      )}
      planNotice={(plan) => plan.summary.missing_channels > 0 && (
        <p className="inline-alert is-warning" role="status">
          {plan.summary.missing_channels} station{plan.summary.missing_channels === 1 ? ' refers' : 's refer'} to a source name + XMLTV channel ID
          that does not exist here. They are imported unlinked, carry no EIT events and link automatically once the source is imported.
        </p>
      )}
      columns={['Multicast output', 'Result', 'Stations', 'Not found']}
      rowKey={(item) => item.name}
      pageSizeKey="xmltv-multicast-import-page-size"
      renderRow={(item) => (
        <>
          <td className="min-w-[200px]"><span className="table-text font-semibold">{item.name}</span></td>
          <td>
            <span className={IMPORT_ACTION_BADGE[item.action]}>{IMPORT_ACTION_LABEL[item.action]}</span>
            {item.action === 'update' && <span className="cell-sub">Changes: {item.changes.map((c) => CHANGE_LABEL[c] ?? c).join(', ')}</span>}
          </td>
          <td><span className="table-text font-mono">{item.service_count.toLocaleString()}</span></td>
          <td className="max-w-[320px]">
            {item.missing_channels.length === 0 ? (
              <span className="table-text text-muted">None</span>
            ) : (
              <>
                <span className="badge badge-error">{item.missing_channels.length} not found</span>
                <span className="cell-sub font-mono break-all">
                  {item.missing_channels.slice(0, 5).map((ref) => `${ref.source} · ${ref.id}`).join(', ')}
                  {item.missing_channels.length > 5 && ` and ${item.missing_channels.length - 5} more`}
                </span>
              </>
            )}
          </td>
        </>
      )}
    />
  )
}
