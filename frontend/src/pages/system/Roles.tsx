import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Pencil, Plus, Save, Search, ShieldCheck, ShieldPlus, Trash2 } from 'lucide-react'
import { systemApi, type Permission, type PermissionAction, type Permissions, type Role, type RoleInput, type Section } from '../../api/client'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useFeedback } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../../components/ui/ResourceState'
import { ColumnHeader, TableFilterSummary, TableSearch, useTableControls, type TableColumn } from '../../components/ui/TableControls'
import { PERMISSION_ACTIONS, SECTIONS, useAuth } from '../../lib/auth'

const NONE: Permission = { full: false, read: false, edit: false, delete: false, import: false, export: false }
const ALL: Permission = { full: true, read: true, edit: true, delete: true, import: true, export: true }
const SPECIFIC: Array<Exclude<PermissionAction, 'full'>> = ['read', 'edit', 'delete', 'import', 'export']

/** Same rules as the backend: Full implies everything, any action implies Read, all actions make Full. */
function normalize(p: Permission): Permission {
  if (p.full) return { ...ALL }
  const next = { ...p }
  if (next.edit || next.delete || next.import || next.export) next.read = true
  if (SPECIFIC.every((action) => next[action])) next.full = true
  return next
}

/** Applies a checkbox change; unchecking Read clears everything, unchecking Full keeps the specific actions off. */
function toggle(p: Permission, action: PermissionAction, checked: boolean): Permission {
  if (action === 'full') return checked ? { ...ALL } : { ...NONE }
  if (action === 'read' && !checked) return { ...NONE }
  return normalize({ ...p, full: false, [action]: checked })
}

function completePermissions(permissions: Permissions | undefined): Record<Section, Permission> {
  return Object.fromEntries(SECTIONS.map((section) => [section.id, normalize(permissions?.[section.id] ?? NONE)])) as Record<Section, Permission>
}

interface RoleForm {
  name: string
  description: string
  permissions: Record<Section, Permission>
}

const emptyForm = (): RoleForm => ({ name: '', description: '', permissions: completePermissions(undefined) })

function sameForm(a: RoleForm, b: RoleForm) {
  return a.name === b.name && a.description === b.description && JSON.stringify(a.permissions) === JSON.stringify(b.permissions)
}

function summary(permissions: Permissions) {
  const complete = completePermissions(permissions)
  const full = SECTIONS.filter((section) => complete[section.id].full).length
  const partial = SECTIONS.filter((section) => complete[section.id].read && !complete[section.id].full).length
  return { full, partial, none: SECTIONS.length - full - partial }
}

const ROLE_COLUMNS: TableColumn<Role>[] = [
  { id: 'name', label: 'Role', kind: 'text', value: (role) => role.name },
  { id: 'access', label: 'Access', kind: 'number', filterHint: 'sections with full access', value: (role) => summary(role.permissions).full },
  { id: 'users', label: 'Users', kind: 'number', align: 'right', value: (role) => role.user_count },
]

const roleSearchText = (role: Role) => [role.name, role.description ?? '', role.builtin ? 'Built-in' : ''].join(' ')

export function Roles() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const { can } = useAuth()
  const canEdit = can('roles', 'edit')
  const canDelete = can('roles', 'delete')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [initialForm, setInitialForm] = useState<RoleForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: systemApi.roles })
  const roles = rolesQuery.data ?? []
  const editingRole = roles.find((role) => role.id === editingId)
  const readOnlyMatrix = editingRole?.builtin === true || !canEdit
  const formDirty = formOpen && !sameForm(form, initialForm)
  const table = useTableControls(roles, ROLE_COLUMNS, { searchText: roleSearchText })
  const { visible, paginationProps } = usePagedRows(table.rows, 'xmltv-roles-page-size', table.resetKey)

  const resetForm = () => {
    setFormOpen(false)
    setDiscardOpen(false)
    setEditingId(null)
    setForm(emptyForm())
    setInitialForm(emptyForm())
    setFormError(null)
  }

  const openForm = (values: RoleForm, id: number | null) => {
    setEditingId(id)
    setForm(values)
    setInitialForm(values)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (role: Role) => openForm({ name: role.name, description: role.description, permissions: completePermissions(role.permissions) }, role.id)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input: RoleInput = { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions }
      if (editingId !== null) await systemApi.updateRole(editingId, input)
      else await systemApi.addRole(input)
      return input
    },
    onSuccess: (input) => {
      notify({ tone: 'success', title: editingId !== null ? 'Role updated' : 'Role added', message: `${input.name} applies to its users from their next request.` })
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (role: Role) => systemApi.deleteRole(role.id),
    onSuccess: (_, role) => {
      notify({ tone: 'success', title: 'Role deleted', message: `${role.name} was removed.` })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (err: Error, role) => notify({ tone: 'error', title: `Could not delete ${role.name}`, message: err.message }),
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

  const setPermission = (section: Section, action: PermissionAction, checked: boolean) =>
    setForm((current) => ({ ...current, permissions: { ...current.permissions, [section]: toggle(current.permissions[section], action, checked) } }))

  const setColumn = (action: PermissionAction, checked: boolean) =>
    setForm((current) => ({
      ...current,
      permissions: Object.fromEntries(SECTIONS.map((section) => [section.id, toggle(current.permissions[section.id], action, checked)])) as Record<Section, Permission>,
    }))

  return (
    <>
      <PageHeader title="Roles" description="A role sets for every section of the application which actions its users may perform: Full, Read, Edit, Delete, Import and Export.">
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(emptyForm(), null)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add role
          </button>
        )}
      </PageHeader>

      <Dialog
        open={formOpen}
        size="large"
        busy={saving}
        title={<span className="inline-flex items-center gap-2">{editingId !== null ? <><Pencil className="h-4 w-4" aria-hidden="true" /> {canEdit ? 'Edit role' : 'Role permissions'}</> : <><ShieldPlus className="h-4 w-4" aria-hidden="true" /> Add role</>}</span>}
        description={editingRole?.builtin ? 'The built-in Administrator role always has full access; only its name and description can change.' : 'Edit, Delete, Import and Export include Read. Full grants every action.'}
        onClose={requestCloseForm}
        initialFocusRef={nameRef}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={requestCloseForm} disabled={saving}>{canEdit ? 'Cancel' : 'Close'}</button>
            {canEdit && (
              <button type="submit" form="role-form" className="btn btn-primary" disabled={!form.name.trim() || saving || (editingId !== null && !formDirty)}>
                {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : editingId !== null ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add role'}
              </button>
            )}
          </>
        }
      >
        <form
          id="role-form"
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
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="field">
              Role name
              <input ref={nameRef} className="input" required maxLength={100} readOnly={!canEdit} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. EPG operator" />
            </label>
            <label className="field">
              Description
              <input className="input" maxLength={1000} readOnly={!canEdit} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What this role is for" />
            </label>
          </div>
          <div className="data-panel">
            <div className="table-scroll">
              <table className="data-table permission-matrix" aria-label="Permissions per section">
                <thead>
                  <tr>
                    <th scope="col">Section</th>
                    {PERMISSION_ACTIONS.map((action) => {
                      const all = SECTIONS.every((section) => form.permissions[section.id][action.id])
                      return (
                        <th key={action.id} scope="col" title={action.hint}>
                          <label className="inline-flex flex-col items-center gap-1.5">
                            {action.label}
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={all}
                              disabled={readOnlyMatrix}
                              onChange={(event) => setColumn(action.id, event.target.checked)}
                              aria-label={`${action.label} on every section`}
                            />
                          </label>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((section) => (
                    <tr key={section.id}>
                      <td>
                        <span className="table-text font-semibold">{section.label}</span>
                        <span className="cell-sub">{section.group} · {section.hint}</span>
                      </td>
                      {PERMISSION_ACTIONS.map((action) => (
                        <td key={action.id}>
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={form.permissions[section.id][action.id]}
                            disabled={readOnlyMatrix}
                            onChange={(event) => setPermission(section.id, action.id, event.target.checked)}
                            aria-label={`${action.label} on ${section.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {formError && <p className="inline-alert is-error" role="alert">{editingId !== null ? 'Changes were not saved: ' : 'Role was not added: '}{formError}</p>}
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description={editingId !== null ? `Your edits to ${editingRole?.name ?? 'this role'} have not been saved and will be lost.` : 'The new role has not been saved; what you entered will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={resetForm}
      />

      <section className="data-panel" aria-labelledby="roles-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="roles-table-title">Roles</h2>
            <p className="font-mono">{table.isFiltered ? `${table.rows.length} of ${roles.length}` : roles.length} roles · {SECTIONS.length} sections</p>
          </div>
          {roles.length > 0 && <TableSearch controls={table} label="Search roles by name or description" placeholder="Search name or description" />}
        </div>
        {roles.length > 0 && <TableFilterSummary controls={table} />}
        {rolesQuery.isLoading ? (
          <LoadingState title="Loading roles" compact />
        ) : rolesQuery.isError ? (
          <ResourceError title="Roles could not be loaded" message={errorMessage(rolesQuery.error)} onRetry={() => rolesQuery.refetch()} />
        ) : roles.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No roles defined" message="Add a role and choose its permissions per section." />
        ) : table.rows.length === 0 ? (
          <EmptyState icon={Search} title="No roles match the current filters" message="Change the search or column filters, or clear them to list all roles.">
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {ROLE_COLUMNS.map((column) => <ColumnHeader key={column.id} column={column} controls={table} />)}
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((role) => {
                  const s = summary(role.permissions)
                  return (
                    <tr key={role.id}>
                      <td className="min-w-[240px]">
                        <span className="table-text font-semibold">{role.name}</span>
                        {role.builtin && <span className="badge badge-accent ml-2"><Lock className="h-3 w-3" aria-hidden="true" /> Built-in</span>}
                        {role.description && <span className="cell-sub">{role.description}</span>}
                      </td>
                      <td>
                        <span className="flex flex-wrap gap-1.5">
                          {s.full > 0 && <span className="badge badge-success">Full: {s.full}</span>}
                          {s.partial > 0 && <span className="badge badge-warning">Partial: {s.partial}</span>}
                          {s.none > 0 && <span className="badge">No access: {s.none}</span>}
                        </span>
                      </td>
                      <td className="text-right"><span className="table-text font-mono">{role.user_count}</span></td>
                      <td>
                        <div className="cell-actions">
                          <button type="button" className="icon-button" onClick={() => openEdit(role)} aria-label={`${canEdit ? 'Edit' : 'View'} ${role.name}`} title={canEdit ? 'Edit role and permissions' : 'View permissions'}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="icon-button is-danger"
                              onClick={() => setDeleteTarget(role)}
                              disabled={role.builtin || role.user_count > 0 || deleteMutation.isPending}
                              aria-label={`Delete ${role.name}`}
                              title={role.builtin ? 'The built-in role cannot be deleted' : role.user_count > 0 ? 'Assign its users another role first' : 'Delete role'}
                            >
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
        {!rolesQuery.isLoading && !rolesQuery.isError && table.rows.length > 0 && <Pagination {...paginationProps} itemLabel="roles" />}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete role?"
        description={`${deleteTarget?.name ?? 'This role'} has no users and will be removed. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete role'}
        destructive
        busy={deleteMutation.isPending}
        onCancel={() => { if (!deleteMutation.isPending) setDeleteTarget(null) }}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget, { onSettled: () => setDeleteTarget(null) }) }}
      />
    </>
  )
}
