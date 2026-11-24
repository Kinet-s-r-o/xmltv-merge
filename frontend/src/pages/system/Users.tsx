import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LockOpen, Pencil, Plus, Save, Search, ShieldCheck, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { systemApi, type User, type UserInput } from '../../api/client'
import { UserTypeIndicator } from '../../components/auth/UserTypeIndicator'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useFeedback } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../../components/ui/ResourceState'
import { ColumnVisibilityCell, ColumnVisibilityHeader, TableCells, TableFilterSummary, TableHeaderCells, TableSearch, useTableControls, type TableColumn } from '../../components/ui/TableControls'
import { useAuth } from '../../lib/auth'
import { formatTimestamp } from '../../lib/sourceStatus'

const MIN_PASSWORD = 10

interface UserForm extends UserInput {
  confirm: string
}

const EMPTY_FORM: UserForm = {
  username: '',
  display_name: '',
  email: '',
  auth_type: 'local',
  role_id: 0,
  enabled: true,
  totp_required: false,
  password: '',
  confirm: '',
}

function sameForm(a: UserForm, b: UserForm) {
  return (Object.keys(a) as Array<keyof UserForm>).every((key) => a[key] === b[key])
}

function isLocked(user: User) {
  return user.locked_until ? new Date(user.locked_until).getTime() > Date.now() : false
}

const USER_COLUMNS: TableColumn<User>[] = [
  {
    id: 'type',
    label: 'Type',
    kind: 'enum',
    value: (user) => user.auth_type,
    options: [{ value: 'local', label: 'Local' }, { value: 'remote', label: 'Remote (RADIUS)' }],
    cell: (user) => <UserTypeIndicator type={user.auth_type} />,
  },
  { id: 'user', label: 'User', kind: 'text', value: (user) => user.username, cellClassName: 'min-w-[220px]' },
  { id: 'role', label: 'Role', kind: 'text', value: (user) => user.role_name, cell: (user) => <span className="table-text">{user.role_name}</span> },
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    value: (user) => (!user.enabled ? 'disabled' : isLocked(user) ? 'locked' : 'enabled'),
    options: [{ value: 'locked', label: 'Locked' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
    cell: (user) => (!user.enabled
      ? <span className="badge">Disabled</span>
      : isLocked(user)
        ? <span className="badge badge-error" title={`Locked until ${formatTimestamp(user.locked_until)}`}>Locked</span>
        : <span className="badge badge-success">Enabled</span>),
  },
  {
    id: 'totp',
    label: '2FA',
    kind: 'enum',
    value: (user) => (user.totp_enabled ? 'enabled' : user.totp_required ? 'required' : 'off'),
    options: [{ value: 'required', label: 'Required, not set up' }, { value: 'enabled', label: 'Enabled' }, { value: 'off', label: 'Off' }],
    cell: (user) => (user.totp_enabled
      ? <span className="badge badge-success"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Enabled</span>
      : user.totp_required
        ? <span className="badge badge-warning">Required, not set up</span>
        : <span className="badge">Off</span>),
  },
  {
    id: 'last_login',
    label: 'Last sign-in',
    kind: 'date',
    value: (user) => user.last_login_at,
    cell: (user) => <span className="table-text font-mono whitespace-nowrap">{formatTimestamp(user.last_login_at) ?? 'Never'}</span>,
  },
]

const userSearchText = (user: User) => [user.username, user.display_name, user.email, user.role_name].join(' ')

export function Users() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const { session, can } = useAuth()
  const canEdit = can('users', 'edit')
  const canDelete = can('users', 'delete')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<UserForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: systemApi.users, refetchInterval: 60_000 })
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: systemApi.roles })
  const radiusQuery = useQuery({ queryKey: ['radius-servers'], queryFn: systemApi.radiusServers, enabled: can('radius') })
  const users = usersQuery.data ?? []
  const roles = rolesQuery.data ?? []
  const enabledRadius = (radiusQuery.data ?? []).filter((server) => server.enabled).length
  const editingUser = users.find((user) => user.id === editingId)
  const isSelf = editingId === session.user.id
  const formDirty = formOpen && !sameForm(form, initialForm)
  const setField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => setForm((current) => ({ ...current, [key]: value }))

  const resetForm = () => {
    setFormOpen(false)
    setDiscardOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setFormError(null)
  }

  const openForm = (values: UserForm, id: number | null) => {
    setEditingId(id)
    setForm(values)
    setInitialForm(values)
    setFormError(null)
    setFormOpen(true)
  }

  const openCreate = () => {
    const defaultRole = roles.find((role) => !role.builtin) ?? roles[0]
    openForm({ ...EMPTY_FORM, role_id: defaultRole?.id ?? 0 }, null)
  }

  const openEdit = (user: User) => openForm({
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    auth_type: user.auth_type,
    role_id: user.role_id,
    enabled: user.enabled,
    totp_required: user.totp_required,
    password: '',
    confirm: '',
  }, user.id)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
    queryClient.invalidateQueries({ queryKey: ['roles'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: UserInput = {
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        auth_type: form.auth_type,
        role_id: form.role_id,
        enabled: form.enabled,
        totp_required: form.totp_required,
        password: form.auth_type === 'local' ? form.password : '',
      }
      if (editingId !== null) await systemApi.updateUser(editingId, payload)
      else await systemApi.addUser(payload)
      return payload
    },
    onSuccess: (payload) => {
      notify({
        tone: 'success',
        title: editingId !== null ? 'User updated' : 'User added',
        message: editingId !== null
          ? `${payload.username} was saved. Changes to role, type, password or status sign the user out.`
          : `${payload.username} can sign in as a ${payload.auth_type === 'local' ? 'local user with the password you set' : 'remote user verified by RADIUS'}.`,
      })
      resetForm()
      invalidate()
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (user: User) => systemApi.deleteUser(user.id),
    onSuccess: (_, user) => {
      notify({ tone: 'success', title: 'User deleted', message: `${user.username} can no longer sign in; their sessions ended.` })
      invalidate()
    },
    onError: (err: Error, user) => notify({ tone: 'error', title: `Could not delete ${user.username}`, message: err.message }),
  })

  const resetTotpMutation = useMutation({
    mutationFn: (user: User) => systemApi.resetUserTotp(user.id),
    onSuccess: (_, user) => {
      notify({ tone: 'success', title: 'Two-factor authentication reset', message: user.totp_required ? `${user.username} sets up a new authenticator at the next sign-in.` : `${user.username} signs in with the password only until 2FA is set up again.` })
      invalidate()
    },
    onError: (err: Error, user) => notify({ tone: 'error', title: `Could not reset 2FA of ${user.username}`, message: err.message }),
  })

  const unlockMutation = useMutation({
    mutationFn: (user: User) => systemApi.unlockUser(user.id),
    onSuccess: (_, user) => {
      notify({ tone: 'success', title: 'Account unlocked', message: `${user.username} can sign in again.` })
      invalidate()
    },
    onError: (err: Error, user) => notify({ tone: 'error', title: `Could not unlock ${user.username}`, message: err.message }),
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

  // The User cell marks the signed-in account, so it is attached here.
  const columns = USER_COLUMNS.map((column) => (column.id !== 'user' ? column : {
    ...column,
    cell: (user: User) => (
      <>
        <span className="table-text font-mono font-semibold">{user.username}</span>
        {user.id === session.user.id && <span className="badge badge-accent ml-2">You</span>}
        {(user.display_name || user.email) && <span className="cell-sub">{[user.display_name, user.email].filter(Boolean).join(' · ')}</span>}
      </>
    ),
  }))
  const table = useTableControls(users, columns, { searchText: userSearchText, storageKey: 'users' })
  const filtered = table.rows
  const { visible, paginationProps } = usePagedRows(filtered, 'xmltv-users-page-size', table.resetKey)
  const localCount = users.filter((user) => user.auth_type === 'local').length

  const passwordNeeded = form.auth_type === 'local' && (editingId === null || editingUser?.auth_type === 'remote')
  const passwordTooShort = form.auth_type === 'local' && form.password.length > 0 && form.password.length < MIN_PASSWORD
  const passwordMismatch = form.auth_type === 'local' && form.confirm !== form.password
  const formValid = form.username.trim() !== '' && form.role_id > 0 && !passwordTooShort && !passwordMismatch && (!passwordNeeded || form.password.length >= MIN_PASSWORD)

  return (
    <>
      <PageHeader title="Users" description="Accounts that can sign in. Local users have a password stored here; remote users are verified by the RADIUS servers.">
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={rolesQuery.isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add user
          </button>
        )}
      </PageHeader>

      <Dialog
        open={formOpen}
        size="medium"
        busy={saving}
        title={<span className="inline-flex items-center gap-2">{editingId !== null ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit user</> : <><UserPlus className="h-4 w-4" aria-hidden="true" /> Add user</>}</span>}
        description={editingId !== null ? `Changes to ${editingUser?.username ?? 'this user'} apply at once; access changes end the user's sessions.` : 'Choose local for a password stored in XMLTV EPG, remote for RADIUS authentication.'}
        onClose={requestCloseForm}
        initialFocusRef={usernameRef}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={requestCloseForm} disabled={saving}>Cancel</button>
            <button type="submit" form="user-form" className="btn btn-primary" disabled={!formValid || saving || (editingId !== null && !formDirty)}>
              {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : editingId !== null ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add user'}
            </button>
          </>
        }
      >
        <form
          id="user-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setFormError(null)
            saveMutation.mutate()
          }}
        >
          {formDirty && (
            <div className="form-dirty-banner" role="status">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Unsaved changes — save them or cancel to discard.
            </div>
          )}
          <fieldset className="field m-0 border-0 p-0">
            <legend className="mb-2">User type</legend>
            <div className="radio-cards">
              {(['local', 'remote'] as const).map((type) => (
                <label key={type} className="radio-card">
                  <input type="radio" name="auth_type" value={type} checked={form.auth_type === type} disabled={isSelf} onChange={() => setField('auth_type', type)} />
                  <span>
                    <strong><span className={`type-dot is-${type}`} aria-hidden="true" />{type === 'local' ? 'Local' : 'Remote (RADIUS)'}</strong>
                    <small>{type === 'local' ? 'Password is hashed and stored in XMLTV EPG.' : 'Password is checked by the RADIUS servers on every sign-in.'}</small>
                  </span>
                </label>
              ))}
            </div>
            {isSelf && <span className="field-hint mt-1.5">You cannot change the type, role or status of your own account.</span>}
          </fieldset>
          {form.auth_type === 'remote' && can('radius') && radiusQuery.isSuccess && enabledRadius === 0 && (
            <p className="inline-alert is-warning" role="status">No RADIUS server is enabled, so remote users cannot sign in yet. Add one under System → RADIUS servers.</p>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <label className="field">
              User name
              <input ref={usernameRef} className="input font-mono" required maxLength={100} autoComplete="off" spellCheck={false} value={form.username} onChange={(event) => setField('username', event.target.value)} aria-describedby="username-hint" />
              <span id="username-hint" className="field-hint">{form.auth_type === 'remote' ? 'Must match the user name on the RADIUS server.' : 'Letters, digits, . _ @ -'}</span>
            </label>
            <label className="field">
              Display name
              <input className="input" maxLength={200} value={form.display_name} onChange={(event) => setField('display_name', event.target.value)} placeholder="Optional" />
            </label>
            <label className="field">
              E-mail
              <input type="email" className="input" maxLength={254} value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="Optional" />
            </label>
            <label className="field">
              Role
              <select className="input" value={form.role_id} disabled={isSelf} onChange={(event) => setField('role_id', Number(event.target.value))} required>
                {form.role_id === 0 && <option value={0}>Choose a role</option>}
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.builtin ? ' (built-in)' : ''}</option>)}
              </select>
            </label>
            {form.auth_type === 'local' && (
              <>
                <label className="field">
                  {editingId !== null && !passwordNeeded ? 'New password' : 'Password'}
                  <input type="password" className="input" autoComplete="new-password" required={passwordNeeded} value={form.password} aria-invalid={passwordTooShort || undefined} aria-describedby="user-password-hint" onChange={(event) => setField('password', event.target.value)} />
                  <span id="user-password-hint" className={passwordTooShort ? 'field-error' : 'field-hint'}>
                    {editingId !== null && !passwordNeeded ? `Leave empty to keep the current password; at least ${MIN_PASSWORD} characters` : `At least ${MIN_PASSWORD} characters`}
                  </span>
                </label>
                <label className="field">
                  Confirm password
                  <input type="password" className="input" autoComplete="new-password" required={passwordNeeded || form.password.length > 0} value={form.confirm} aria-invalid={(form.confirm.length > 0 && passwordMismatch) || undefined} aria-describedby="user-confirm-hint" onChange={(event) => setField('confirm', event.target.value)} />
                  {form.confirm.length > 0 && passwordMismatch && <span id="user-confirm-hint" className="field-error">Passwords do not match</span>}
                </label>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span className="switch-control">
              <button type="button" role="switch" className="switch" aria-checked={form.enabled} aria-label="Account enabled" disabled={isSelf} onClick={() => setField('enabled', !form.enabled)} />
              <span className="table-text">{form.enabled ? 'Enabled — can sign in' : 'Disabled — cannot sign in'}</span>
            </span>
            <label className="check-label">
              <input type="checkbox" className="checkbox" checked={form.totp_required} onChange={(event) => setField('totp_required', event.target.checked)} />
              Require two-factor authentication (TOTP)
            </label>
          </div>
          {formError && (
            <p className="inline-alert is-error" role="alert">
              {editingId !== null ? 'Changes were not saved: ' : 'User was not added: '}{formError}
            </p>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description={editingId !== null ? `Your edits to ${editingUser?.username ?? 'this user'} have not been saved and will be lost.` : 'The new user has not been saved; what you entered will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={resetForm}
      />

      <section className="data-panel" aria-labelledby="users-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="users-table-title">User accounts</h2>
            <p className="font-mono">{filtered.length} of {users.length} shown · {localCount} local · {users.length - localCount} remote</p>
          </div>
          {users.length > 0 && (
            <TableSearch controls={table} label="Search users by name, e-mail or role" placeholder="Search name, e-mail or role" />
          )}
        </div>
        {users.length > 0 && <TableFilterSummary controls={table} />}

        {usersQuery.isLoading ? (
          <LoadingState title="Loading users" compact />
        ) : usersQuery.isError ? (
          <ResourceError title="Users could not be loaded" message={errorMessage(usersQuery.error)} onRetry={() => usersQuery.refetch()} />
        ) : users.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No user accounts" message="Add a local or remote user to give someone access." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No users match the current filters" message="Change the search or column filters, or clear them to list all user accounts.">
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <TableHeaderCells controls={table} />
                  <th scope="col" className="text-right" data-column-fixed="actions">Actions</th>
                  <ColumnVisibilityHeader controls={table} />
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => {
                  const locked = isLocked(user)
                  const self = user.id === session.user.id
                  return (
                    <tr key={user.id}>
                      <TableCells controls={table} row={user} />
                      <td data-column-fixed="actions">
                        <div className="cell-actions">
                          {canEdit && locked && (
                            <button type="button" className="icon-button" onClick={() => unlockMutation.mutate(user)} disabled={unlockMutation.isPending} aria-label={`Unlock ${user.username}`} title="Unlock the account after failed sign-ins">
                              <LockOpen className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {canEdit && user.totp_enabled && (
                            <button type="button" className="icon-button" onClick={() => setResetTarget(user)} aria-label={`Reset two-factor authentication of ${user.username}`} title="Reset two-factor authentication (lost authenticator)">
                              <KeyRound className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {canEdit && (
                            <button type="button" className="icon-button" onClick={() => openEdit(user)} aria-label={`Edit ${user.username}`} title="Edit user">
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="icon-button is-danger" onClick={() => setDeleteTarget(user)} disabled={self || deleteMutation.isPending} aria-label={`Delete ${user.username}`} title={self ? 'You cannot delete your own account' : 'Delete user'}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <ColumnVisibilityCell />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!usersQuery.isLoading && !usersQuery.isError && filtered.length > 0 && <Pagination {...paginationProps} itemLabel="users" />}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete user?"
        description={`${deleteTarget?.username ?? 'This user'} is signed out everywhere and can no longer sign in. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete user'}
        destructive
        busy={deleteMutation.isPending}
        onCancel={() => { if (!deleteMutation.isPending) setDeleteTarget(null) }}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget, { onSettled: () => setDeleteTarget(null) }) }}
      />

      <ConfirmDialog
        open={resetTarget !== null}
        title="Reset two-factor authentication?"
        description={`The authenticator of ${resetTarget?.username ?? 'this user'} stops working and their sessions end. ${resetTarget?.totp_required ? 'They set up a new one at the next sign-in.' : 'They can set it up again under My account.'}`}
        confirmLabel={resetTotpMutation.isPending ? 'Resetting…' : 'Reset 2FA'}
        destructive
        busy={resetTotpMutation.isPending}
        onCancel={() => { if (!resetTotpMutation.isPending) setResetTarget(null) }}
        onConfirm={() => { if (resetTarget) resetTotpMutation.mutate(resetTarget, { onSettled: () => setResetTarget(null) }) }}
      />
    </>
  )
}
