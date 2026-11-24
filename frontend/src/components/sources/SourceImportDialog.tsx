import type { SourceImportItem, SourceImportPlan } from '../../api/client'
import type { ConfigImportState } from '../../lib/configTransfer'
import { formatInterval } from '../../lib/sourceStatus'
import { IMPORT_ACTION_BADGE, IMPORT_ACTION_LABEL, ImportPreviewDialog } from '../ui/ImportPreviewDialog'

const CHANGE_LABEL: Record<string, string> = {
  name: 'name casing',
  url: 'URL',
  enabled: 'enabled state',
  refresh_interval: 'refresh interval',
  history_days: 'history',
}

interface SourceImportDialogProps {
  state: ConfigImportState<SourceImportPlan>
  applying: boolean
  applyError: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Preview of a source configuration import. Sources are matched by name: new
 * names are created, matching sources are updated, identical ones are skipped
 * and sources missing from the file are kept. Nothing is deleted.
 */
export function SourceImportDialog(props: SourceImportDialogProps) {
  return (
    <ImportPreviewDialog<SourceImportItem, SourceImportPlan>
      {...props}
      title="Import source configuration"
      noun={['source', 'sources']}
      matchingNote="Sources are matched by name; sources not listed in the file are kept, nothing is deleted."
      updateNote="Updated sources take the URL, schedule, history and enabled state from the file. A changed URL or schedule clears the source's import status, so it downloads again on the next scheduler run; stored channels and programmes are kept."
      formatHint={'<xmltv-sources version="1"> with one <source> per entry'}
      columns={['Source', 'Result', 'Schedule', 'Refresh']}
      rowKey={(item) => item.name}
      pageSizeKey="xmltv-source-import-page-size"
      renderRow={(item) => (
        <>
          <td className="min-w-[220px]">
            <span className="table-text font-semibold">{item.name}</span>
            <span className="cell-sub font-mono break-all">{item.url}</span>
          </td>
          <td>
            <span className={IMPORT_ACTION_BADGE[item.action]}>{IMPORT_ACTION_LABEL[item.action]}</span>
            {item.action === 'update' && (
              <span className="cell-sub">Changes: {item.changes.map((change) => CHANGE_LABEL[change] ?? change).join(', ')}</span>
            )}
          </td>
          <td>
            <span className="table-text font-mono whitespace-nowrap">every {formatInterval(item.refresh_interval_minutes)}</span>
            <span className="cell-sub font-mono">keep {item.history_days} d</span>
          </td>
          <td><span className="table-text">{item.enabled ? 'Enabled' : 'Disabled'}</span></td>
        </>
      )}
    />
  )
}
