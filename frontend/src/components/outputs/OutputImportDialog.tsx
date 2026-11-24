import type { OutputImportItem, OutputImportPlan } from '../../api/client'
import type { ConfigImportState } from '../../lib/configTransfer'
import { IMPORT_ACTION_BADGE, IMPORT_ACTION_LABEL, ImportPreviewDialog } from '../ui/ImportPreviewDialog'

interface OutputImportDialogProps {
  state: ConfigImportState<OutputImportPlan>
  applying: boolean
  applyError: string | null
  onClose: () => void
  onConfirm: () => void
}

function changeSummary(item: OutputImportItem) {
  const parts: string[] = []
  if (item.changes.includes('name')) parts.push('name casing')
  if (item.channels_added) parts.push(`+${item.channels_added} channel${item.channels_added === 1 ? '' : 's'}`)
  if (item.channels_removed) parts.push(`−${item.channels_removed} channel${item.channels_removed === 1 ? '' : 's'}`)
  if (item.channels_changed) parts.push(`${item.channels_changed} rule${item.channels_changed === 1 ? '' : 's'} changed`)
  if (item.changes.includes('order')) parts.push('channel order')
  return parts.join(', ')
}

/**
 * Preview of an output configuration import. Outputs are matched by name; a
 * matching output's channel list is replaced by the file's, existing feed URLs
 * and tokens are kept, new outputs get a fresh token. Channels that do not
 * exist on this instance are listed and left out. Nothing is deleted.
 */
export function OutputImportDialog(props: OutputImportDialogProps) {
  return (
    <ImportPreviewDialog<OutputImportItem, OutputImportPlan>
      {...props}
      title="Import output configuration"
      noun={['output', 'outputs']}
      matchingNote="Outputs are matched by name; outputs not listed in the file are kept, nothing is deleted."
      updateNote="Updated outputs get the file's channel list, station names and field rules; their feed URL and token stay the same. New outputs get a new token — share their feed URL with customers after the import."
      formatHint={'<xmltv-outputs version="1"> with one <output> per feed and <channel source="…" id="…"> per channel'}
      extraSummary={(plan) => plan.summary.missing_channels > 0 && (
        <span className="badge badge-error">{plan.summary.missing_channels} channel{plan.summary.missing_channels === 1 ? '' : 's'} not found</span>
      )}
      planNotice={(plan) => plan.summary.missing_channels > 0 && (
        <p className="inline-alert is-warning" role="status">
          {plan.summary.missing_channels} channel reference{plan.summary.missing_channels === 1 ? ' does' : 's do'} not match any source name + XMLTV channel ID
          here and will be left out. Add and import the missing sources first, then import this file again to include them.
        </p>
      )}
      columns={['Output', 'Result', 'Channels', 'Not found']}
      rowKey={(item) => item.name}
      pageSizeKey="xmltv-output-import-page-size"
      renderRow={(item) => (
        <>
          <td className="min-w-[200px]">
            <span className="table-text font-semibold">{item.name}</span>
            <span className="cell-sub font-mono break-all">/{item.slug}.xml</span>
          </td>
          <td>
            <span className={IMPORT_ACTION_BADGE[item.action]}>{IMPORT_ACTION_LABEL[item.action]}</span>
            {item.action === 'update' && <span className="cell-sub">Changes: {changeSummary(item)}</span>}
          </td>
          <td><span className="table-text font-mono">{item.channel_count.toLocaleString()}</span></td>
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
