/**
 * Kinet UI/UX — data table example (SolidJS).
 *
 * Contract (see references/components.md §Data tables):
 * - class "data-table" (sticky header, 12px text, 1px row separators)
 * - cell values use the shared "table-text" class (IBM Plex Sans 12px, --text-table)
 * - machine-readable values (IDs, serials, timestamps, metrics) add .font-mono
 * - status uses semantic badges, never raw color
 * - Actions column is right-aligned and fixed on horizontal scroll
 * - empty / loading / error states use ResourceState
 * - pagination uses the shared Pagination component (page sizes 10–1000, default 20)
 */
import { For, Show } from 'solid-js';
import { ResourceState } from './ResourceState';

interface Row {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  lastSeen: string;
}

interface DataTableProps {
  rows: Row[];
  state: 'loading' | 'empty' | 'error' | 'ready';
  onRetry?: () => void;
  onAction?: (row: Row) => void;
}

const statusBadge: Record<Row['status'], string> = {
  online: 'badge badge-success',
  offline: 'badge badge-error',
  warning: 'badge badge-warning',
};

export function DataTable(props: DataTableProps) {
  return (
    <ResourceState
      state={props.state}
      title={
        props.state === 'loading'
          ? 'Loading devices…'
          : props.state === 'empty'
            ? 'No devices match the current filters'
            : 'Unable to load devices'
      }
      message={props.state === 'error' ? 'The device list could not be retrieved. Check the connection and retry.' : undefined}
      onRetry={props.onRetry}
    >
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial</th>
              <th>Status</th>
              <th>Last seen</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <td class="table-text">{row.name}</td>
                  <td class="table-text font-mono">{row.id}</td>
                  <td>
                    <span class={statusBadge[row.status]}>{row.status}</span>
                  </td>
                  <td class="table-text font-mono">{row.lastSeen}</td>
                  <td class="text-right">
                    <button class="btn btn-secondary btn-xs" onClick={() => props.onAction?.(row)}>
                      Manage
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </ResourceState>
  );
}
