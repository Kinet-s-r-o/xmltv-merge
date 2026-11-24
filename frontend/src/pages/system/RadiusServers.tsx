import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Pencil, Plug, Plus, Save, Search, Server, Trash2, XCircle } from 'lucide-react'
import { systemApi, type RadiusServer, type RadiusServerInput, type RadiusTestResult } from '../../api/client'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useFeedback } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../../components/ui/ResourceState'
import { ColumnHeader, TableFilterSummary, TableSearch, useTableControls, type TableColumn } from '../../components/ui/TableControls'
import { useAuth } from '../../lib/auth'

const EMPTY_FORM: RadiusServerInput = {
  name: '',
  host: '',
  port: 1812,
  secret: '',
  timeout_seconds: 5,
  retries: 1,
  nas_identifier: 'xmltv-epg',
  priority: 10,
  require_message_authenticator: true,
  enabled: true,
}

function sameForm(a: RadiusServerInput, b: RadiusServerInput) {
  return (Object.keys(a) as Array<keyof RadiusServerInput>).every((key) => a[key] === b[key])
}

const formatAddress = (server: RadiusServer) => `${server.host.includes(':') ? `[${server.host}]` : server.host}:${server.port}`

const RADIUS_COLUMNS: TableColumn<RadiusServer>[] = [
  { id: 'priority', label: 'Priority', kind: 'number', align: 'right', value: (server) => server.priority },
  { id: 'name', label: 'Server', kind: 'text', value: (server) => server.name },
  { id: 'address', label: 'Address', kind: 'text', value: formatAddress },
  { id: 'timing', label: 'Timing', kind: 'number', filterHint: 'timeout in seconds', value: (server) => server.timeout_seconds },
  {
    id: 'security',
    label: 'Security',
    kind: 'enum',
    value: (server) => (!server.has_secret ? 'no_secret' : server.require_message_authenticator ? 'secured' : 'msg_auth_optional'),
    options: [
      { value: 'no_secret', label: 'No secret' },
      { value: 'msg_auth_optional', label: 'Msg-Auth optional' },
      { value: 'secured', label: 'Secret stored, Msg-Auth required' },
    ],
  },
  {
    id: 'enabled',
    label: 'Sign-in',
    kind: 'enum',
    value: (server) => (server.enabled ? 'enabled' : 'disabled'),
    options: [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
  },
]

const radiusSearchText = (server: RadiusServer) => [server.name, formatAddress(server), server.nas_identifier].join(' ')

const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max

/** Test dialog: sends one Access-Request with the entered credentials to a saved server. */
function RadiusTestDialog({ server, onClose }: { server: RadiusServer | null; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<RadiusTestResult | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const test = useMutation({
    mutationFn: () => systemApi.testRadiusServer(server!.id, username.trim(), password),
    onSuccess: setResult,
    onError: (err: Error) => setResult({ accepted: false, error: err.message, duration_ms: 0 }),
  })

  useEffect(() => {
    if (!server) {
      setUsername('')
      setPassword('')
      setResult(null)
    }
  }, [server])

  return (
    <Dialog
      open={server !== null}
      size="small"
      busy={test.isPending}
      title={<span className="inline-flex items-center gap-2"><Plug className="h-4 w-4" aria-hidden="true" /> Test {server?.name}</span>}
      description="Sends one Access-Request to this server only. The credentials are not stored."
      onClose={() => { if (!test.isPending) onClose() }}
      initialFocusRef={usernameRef}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={test.isPending}>Close</button>
          <button type="submit" form="radius-test-form" className="btn btn-primary" disabled={test.isPending || !username.trim() || !password}>
            {test.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Plug className="h-3.5 w-3.5" aria-hidden="true" />}
            {test.isPending ? 'Testing…' : 'Send test request'}
          </button>
        </>
      }
    >
      <form id="radius-test-form" className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); setResult(null); test.mutate() }}>
        <label className="field">
          User name
          <input ref={usernameRef} className="input font-mono" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" className="input" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {result && (
          result.error ? (
            <p className="inline-alert is-error" role="alert"><XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> No valid answer: {result.error}</p>
          ) : result.accepted ? (
            <p className="inline-alert" role="status"><CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" /> Access-Accept in {result.duration_ms} ms{result.reply_message ? ` — ${result.reply_message}` : ''}. The server, shared secret and credentials work.</p>
          ) : (
            <p className="inline-alert is-warning" role="status"><XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> Access-Reject in {result.duration_ms} ms{result.reply_message ? ` — ${result.reply_message}` : ''}. The server answers and the shared secret is correct, but the credentials were rejected.</p>
          )
        )}
      </form>
    </Dialog>
  )
}

export function RadiusServers() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const { can } = useAuth()
  const canEdit = can('radius', 'edit')
  const canDelete = can('radius', 'delete')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<RadiusServerInput>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<RadiusServerInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RadiusServer | null>(null)
  const [testTarget, setTestTarget] = useState<RadiusServer | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const serversQuery = useQuery({ queryKey: ['radius-servers'], queryFn: systemApi.radiusServers })
  const servers = serversQuery.data ?? []
  const editingServer = servers.find((server) => server.id === editingId)
  const formDirty = formOpen && !sameForm(form, initialForm)
  const setField = <K extends keyof RadiusServerInput>(key: K, value: RadiusServerInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const table = useTableControls(servers, RADIUS_COLUMNS, { searchText: radiusSearchText })
  const { visible, paginationProps } = usePagedRows(table.rows, 'xmltv-radius-page-size', table.resetKey)

  const resetForm = () => {
    setFormOpen(false)
    setDiscardOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setFormError(null)
  }

  const openForm = (values: RadiusServerInput, id: number | null) => {
    setEditingId(id)
    setForm(values)
    setInitialForm(values)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (server: RadiusServer) => openForm({
    name: server.name,
    host: server.host,
    port: server.port,
    secret: '',
    timeout_seconds: server.timeout_seconds,
    retries: server.retries,
    nas_identifier: server.nas_identifier,
    priority: server.priority,
    require_message_authenticator: server.require_message_authenticator,
    enabled: server.enabled,
  }, server.id)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = { ...form, name: form.name.trim(), host: form.host.trim(), nas_identifier: form.nas_identifier.trim() }
      if (editingId !== null) await systemApi.updateRadiusServer(editingId, input)
      else await systemApi.addRadiusServer(input)
      return input
    },
    onSuccess: (input) => {
      notify({ tone: 'success', title: editingId !== null ? 'RADIUS server updated' : 'RADIUS server added', message: `${input.name} (${input.host}:${input.port}) ${input.enabled ? 'is used for remote sign-ins' : 'is saved but disabled'}.` })
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['radius-servers'] })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const activationMutation = useMutation({
    mutationFn: ({ server, enabled }: { server: RadiusServer; enabled: boolean }) => systemApi.setRadiusServerEnabled(server.id, enabled),
    onSuccess: (_, { server, enabled }) => {
      notify({ tone: 'success', title: enabled ? 'RADIUS server enabled' : 'RADIUS server disabled', message: enabled ? `${server.name} is used for remote sign-ins.` : `${server.name} is skipped for remote sign-ins.` })
      queryClient.invalidateQueries({ queryKey: ['radius-servers'] })
    },
    onError: (err: Error, { server }) => notify({ tone: 'error', title: `Could not change ${server.name}`, message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (server: RadiusServer) => systemApi.deleteRadiusServer(server.id),
    onSuccess: (_, server) => {
      notify({ tone: 'success', title: 'RADIUS server deleted', message: `${server.name} was removed.` })
      queryClient.invalidateQueries({ queryKey: ['radius-servers'] })
    },
    onError: (err: Error, server) => notify({ tone: 'error', title: `Could not delete ${server.name}`, message: err.message }),
  })

  const saving = saveMutation.isPending
  const requestCloseForm = () => {
    if (saving) return
    if (formDirty) setDiscardOpen(true)
    else resetForm()
  }

  useEffect(() => {
    if (!formDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [formDirty])

  const portInvalid = !inRange(form.port, 1, 65535)
  const timeoutInvalid = !inRange(form.timeout_seconds, 1, 60)
  const retriesInvalid = !inRange(form.retries, 0, 5)
  const priorityInvalid = !inRange(form.priority, 0, 1000)
  const secretMissing = editingId === null && !form.secret
  const formValid = form.name.trim() !== '' && form.host.trim() !== '' && !portInvalid && !timeoutInvalid && !retriesInvalid && !priorityInvalid && !secretMissing
  const enabledCount = servers.filter((server) => server.enabled).length

  return (
    <>
      <PageHeader title="RADIUS servers" description="Servers that verify the passwords of remote users. Enabled servers are tried in priority order; the next one is used only when a server does not answer.">
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add RADIUS server
          </button>
        )}
      </PageHeader>

      <Dialog
        open={formOpen}
        size="medium"
        busy={saving}
        title={<span className="inline-flex items-center gap-2">{editingId !== null ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit RADIUS server</> : <><Server className="h-4 w-4" aria-hidden="true" /> Add RADIUS server</>}</span>}
        description="Authentication uses PAP over UDP (RFC 2865) with a Message-Authenticator on every request."
        onClose={requestCloseForm}
        initialFocusRef={nameRef}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={requestCloseForm} disabled={saving}>Cancel</button>
            <button type="submit" form="radius-form" className="btn btn-primary" disabled={!formValid || saving || (editingId !== null && !formDirty)}>
              {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : editingId !== null ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Server className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add server'}
            </button>
          </>
        }
      >
        <form id="radius-form" className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); setFormError(null); saveMutation.mutate() }}>
          {formDirty && (
            <div className="form-dirty-banner" role="status">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Unsaved changes — save them or cancel to discard.
            </div>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="field sm:col-span-2">
              Name
              <input ref={nameRef} className="input" required maxLength={200} value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Primary RADIUS" />
            </label>
            <label className="field">
              Host
              <input className="input font-mono" required maxLength={255} spellCheck={false} value={form.host} onChange={(event) => setField('host', event.target.value)} placeholder="radius.example.net or 192.0.2.10" />
            </label>
            <label className="field">
              Authentication port
              <input type="number" min={1} max={65535} className="input font-mono" value={form.port} aria-invalid={portInvalid || undefined} onChange={(event) => setField('port', Number(event.target.value))} />
              <span className={portInvalid ? 'field-error' : 'field-hint'}>Usually 1812</span>
            </label>
            <label className="field sm:col-span-2">
              Shared secret
              <input type="password" className="input font-mono" autoComplete="new-password" maxLength={128} required={editingId === null} value={form.secret} onChange={(event) => setField('secret', event.target.value)} aria-describedby="secret-hint" />
              <span id="secret-hint" className="field-hint">
                {editingId !== null && editingServer?.has_secret ? 'A secret is stored and never shown. Leave empty to keep it.' : 'Must match the client entry for this application on the RADIUS server.'}
              </span>
            </label>
            <label className="field">
              NAS identifier
              <input className="input font-mono" maxLength={100} value={form.nas_identifier} onChange={(event) => setField('nas_identifier', event.target.value)} />
              <span className="field-hint">Sent as NAS-Identifier (attribute 32)</span>
            </label>
            <label className="field">
              Priority
              <input type="number" min={0} max={1000} className="input font-mono" value={form.priority} aria-invalid={priorityInvalid || undefined} onChange={(event) => setField('priority', Number(event.target.value))} />
              <span className={priorityInvalid ? 'field-error' : 'field-hint'}>Lower is tried first (0–1000)</span>
            </label>
            <label className="field">
              Timeout
              <span className="field-inline">
                <input type="number" min={1} max={60} className="input input-number font-mono" value={form.timeout_seconds} aria-invalid={timeoutInvalid || undefined} onChange={(event) => setField('timeout_seconds', Number(event.target.value))} />
                seconds
              </span>
              <span className={timeoutInvalid ? 'field-error' : 'field-hint'}>1–60 s per attempt</span>
            </label>
            <label className="field">
              Retries
              <input type="number" min={0} max={5} className="input input-number font-mono" value={form.retries} aria-invalid={retriesInvalid || undefined} onChange={(event) => setField('retries', Number(event.target.value))} />
              <span className={retriesInvalid ? 'field-error' : 'field-hint'}>0–5 resends</span>
            </label>
          </div>
          <label className="check-label">
            <input type="checkbox" className="checkbox" checked={form.require_message_authenticator} onChange={(event) => setField('require_message_authenticator', event.target.checked)} />
            Require Message-Authenticator in responses (BlastRADIUS protection, recommended)
          </label>
          <span className="switch-control">
            <button type="button" role="switch" className="switch" aria-checked={form.enabled} aria-label="Use this server for sign-in" onClick={() => setField('enabled', !form.enabled)} />
            <span className="table-text">{form.enabled ? 'Enabled — used for remote sign-ins' : 'Disabled — skipped'}</span>
          </span>
          {formError && <p className="inline-alert is-error" role="alert">{editingId !== null ? 'Changes were not saved: ' : 'Server was not added: '}{formError}</p>}
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description={editingId !== null ? `Your edits to ${editingServer?.name ?? 'this server'} have not been saved and will be lost.` : 'The new server has not been saved; what you entered will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={resetForm}
      />

      <RadiusTestDialog server={testTarget} onClose={() => setTestTarget(null)} />

      <section className="data-panel" aria-labelledby="radius-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="radius-table-title">Configured servers</h2>
            <p className="font-mono">{table.isFiltered ? `${table.rows.length} of ${servers.length}` : servers.length} servers · {enabledCount} enabled · tried in priority order</p>
          </div>
          {servers.length > 0 && <TableSearch controls={table} label="Search RADIUS servers by name, address or NAS-Identifier" placeholder="Search name, address or NAS-ID" />}
        </div>
        {servers.length > 0 && <TableFilterSummary controls={table} />}
        {serversQuery.isLoading ? (
          <LoadingState title="Loading RADIUS servers" compact />
        ) : serversQuery.isError ? (
          <ResourceError title="RADIUS servers could not be loaded" message={errorMessage(serversQuery.error)} onRetry={() => serversQuery.refetch()} />
        ) : servers.length === 0 ? (
          <EmptyState icon={Server} title="No RADIUS servers configured" message="Remote users cannot sign in until at least one RADIUS server is added and enabled.">
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add RADIUS server
              </button>
            )}
          </EmptyState>
        ) : table.rows.length === 0 ? (
          <EmptyState icon={Search} title="No RADIUS servers match the current filters" message="Change the search or column filters, or clear them to list all servers.">
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {RADIUS_COLUMNS.map((column) => <ColumnHeader key={column.id} column={column} controls={table} />)}
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((server) => {
                  const toggling = activationMutation.isPending && activationMutation.variables?.server.id === server.id
                  return (
                    <tr key={server.id}>
                      <td className="text-right"><span className="table-text font-mono">{server.priority}</span></td>
                      <td className="min-w-[200px]">
                        <span className="table-text font-semibold">{server.name}</span>
                        <span className="cell-sub font-mono">NAS-Identifier {server.nas_identifier}</span>
                      </td>
                      <td><span className="table-text font-mono whitespace-nowrap">{formatAddress(server)}</span></td>
                      <td><span className="table-text font-mono whitespace-nowrap">{server.timeout_seconds} s × {server.retries + 1}</span></td>
                      <td>
                        <span className="flex flex-wrap gap-1.5">
                          {server.has_secret ? <span className="badge badge-success">Secret stored</span> : <span className="badge badge-error">No secret</span>}
                          {server.require_message_authenticator ? <span className="badge badge-success">Msg-Auth required</span> : <span className="badge badge-warning">Msg-Auth optional</span>}
                        </span>
                      </td>
                      <td>
                        <span className="switch-control">
                          <button
                            type="button"
                            role="switch"
                            className="switch"
                            aria-checked={server.enabled}
                            aria-label={`Use ${server.name} for sign-in`}
                            onClick={() => activationMutation.mutate({ server, enabled: !server.enabled })}
                            disabled={!canEdit || toggling}
                          />
                          <span className="table-text">{server.enabled ? 'Enabled' : 'Disabled'}</span>
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          {canEdit && (
                            <>
                              <button type="button" className="icon-button" onClick={() => setTestTarget(server)} aria-label={`Test ${server.name}`} title="Send a test Access-Request">
                                <Plug className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button type="button" className="icon-button" onClick={() => openEdit(server)} aria-label={`Edit ${server.name}`} title="Edit server">
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button type="button" className="icon-button is-danger" onClick={() => setDeleteTarget(server)} disabled={deleteMutation.isPending} aria-label={`Delete ${server.name}`} title="Delete server">
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!serversQuery.isLoading && !serversQuery.isError && table.rows.length > 0 && <Pagination {...paginationProps} itemLabel="servers" />}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete RADIUS server?"
        description={`${deleteTarget?.name ?? 'This server'} and its shared secret are removed. ${enabledCount === 1 && deleteTarget?.enabled ? 'It is the only enabled server, so remote users will no longer be able to sign in. ' : ''}This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete server'}
        destructive
        busy={deleteMutation.isPending}
        onCancel={() => { if (!deleteMutation.isPending) setDeleteTarget(null) }}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget, { onSettled: () => setDeleteTarget(null) }) }}
      />
    </>
  )
}
