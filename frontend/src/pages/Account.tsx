import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, KeyRound, Minus, ShieldCheck, ShieldOff, UserCog } from 'lucide-react'
import { authApi, type TOTPEnrollment } from '../api/client'
import { TotpQrCode, formatSecret } from '../components/auth/TotpQrCode'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { PERMISSION_ACTIONS, SECTIONS, useAuth } from '../lib/auth'
import { formatTimestamp } from '../lib/sourceStatus'
import { UserTypeIndicator } from '../components/auth/UserTypeIndicator'

const MIN_PASSWORD = 10

function PasswordPanel() {
  const { notify } = useFeedback()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      notify({ tone: 'success', title: 'Password changed', message: 'Your other sessions were signed out.' })
    },
    onError: (err: Error) => setError(err.message),
  })
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== next

  return (
    <form
      className="data-panel-body grid items-start gap-3 sm:grid-cols-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        setError(null)
        mutation.mutate()
      }}
    >
      <label className="field">
        Current password
        <input type="password" className="input" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
      </label>
      <label className="field">
        New password
        <input type="password" className="input" autoComplete="new-password" required value={next} aria-invalid={tooShort || undefined} aria-describedby="new-password-hint" onChange={(event) => setNext(event.target.value)} />
        <span id="new-password-hint" className={tooShort ? 'field-error' : 'field-hint'}>At least {MIN_PASSWORD} characters</span>
      </label>
      <label className="field">
        Confirm new password
        <input type="password" className="input" autoComplete="new-password" required value={confirm} aria-invalid={mismatch || undefined} aria-describedby="confirm-password-hint" onChange={(event) => setConfirm(event.target.value)} />
        {mismatch && <span id="confirm-password-hint" className="field-error">Passwords do not match</span>}
      </label>
      {error && <p className="inline-alert is-error sm:col-span-3" role="alert">Password was not changed: {error}</p>}
      <div className="sm:col-span-3">
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending || !current || next.length < MIN_PASSWORD || next !== confirm}>
          {mutation.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
          {mutation.isPending ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}

function TwoFactorPanel() {
  const { session, refresh } = useAuth()
  const { notify } = useFeedback()
  const { user } = session
  const [enrollment, setEnrollment] = useState<TOTPEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [disableOpen, setDisableOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (enrollment || disableOpen) codeRef.current?.focus()
  }, [enrollment, disableOpen])

  const begin = useMutation({
    mutationFn: authApi.beginTotp,
    onSuccess: (data) => {
      setEnrollment(data)
      setCode('')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })
  const enable = useMutation({
    mutationFn: () => authApi.enableTotp(code),
    onSuccess: async () => {
      setEnrollment(null)
      setCode('')
      notify({ tone: 'success', title: 'Two-factor authentication enabled', message: 'Sign-in now asks for a code from your authenticator app.' })
      await refresh()
    },
    onError: (err: Error) => {
      setError(err.message)
      setCode('')
    },
  })
  const disable = useMutation({
    mutationFn: () => authApi.disableTotp(code),
    onSuccess: async () => {
      setDisableOpen(false)
      setCode('')
      notify({ tone: 'success', title: 'Two-factor authentication disabled', message: 'Sign-in only asks for your password again.' })
      await refresh()
    },
    onError: (err: Error) => {
      setError(err.message)
      setCode('')
    },
  })

  const codeField = (
    <label className="field max-w-[240px]">
      Verification code
      <input
        ref={codeRef}
        className="input code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </label>
  )

  return (
    <div className="data-panel-body flex flex-col gap-3">
      <p className="m-0 flex flex-wrap items-center gap-2 text-[12px]">
        Status:
        {user.totp_enabled
          ? <span className="badge badge-success"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Enabled</span>
          : <span className="badge badge-warning"><ShieldOff className="h-3 w-3" aria-hidden="true" /> Not enabled</span>}
        {user.totp_required && <span className="badge badge-accent">Required by administrator</span>}
      </p>

      {!user.totp_enabled && !enrollment && (
        <>
          <p className="m-0 text-[12px] text-secondary">Protect your account with a time-based one-time code (TOTP) from an authenticator app. Sign-in then asks for the code after the password{user.auth_type === 'remote' ? ' verified by RADIUS' : ''}.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => begin.mutate()} disabled={begin.isPending}>
              {begin.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              Set up two-factor authentication
            </button>
          </div>
        </>
      )}

      {enrollment && (
        <form
          className="grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            enable.mutate()
          }}
        >
          <TotpQrCode uri={enrollment.totp_uri} label="QR code for adding this account to an authenticator app" />
          <div className="flex min-w-0 flex-col gap-3">
            <p className="m-0 text-[12px] text-secondary">1. Scan the QR code with your authenticator app, or enter the key manually.</p>
            <code className="secret-text">{formatSecret(enrollment.totp_secret)}</code>
            <p className="m-0 text-[12px] text-secondary">2. Enter the 6-digit code the app shows to finish.</p>
            {codeField}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary" disabled={enable.isPending || code.length !== 6}>
                {enable.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {enable.isPending ? 'Verifying…' : 'Enable'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setEnrollment(null); setError(null) }} disabled={enable.isPending}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {user.totp_enabled && !disableOpen && (
        <div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => { setDisableOpen(true); setCode(''); setError(null) }}
            disabled={user.totp_required}
            title={user.totp_required ? 'An administrator requires two-factor authentication for your account' : 'Turn off two-factor authentication'}
          >
            <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" /> Disable two-factor authentication
          </button>
        </div>
      )}

      {disableOpen && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            disable.mutate()
          }}
        >
          <p className="m-0 text-[12px] text-secondary">Confirm with a current code from your authenticator app.</p>
          {codeField}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-danger" disabled={disable.isPending || code.length !== 6}>
              {disable.isPending && <span className="spinner spinner-sm" aria-hidden="true" />}
              {disable.isPending ? 'Disabling…' : 'Disable 2FA'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setDisableOpen(false); setError(null) }} disabled={disable.isPending}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="inline-alert is-error" role="alert">{error}</p>}
    </div>
  )
}

/** The signed-in user's profile, password, two-factor authentication and effective permissions. */
export function Account() {
  const { session } = useAuth()
  const { user, permissions } = session

  useEffect(() => {
    if (window.location.hash === '#two-factor') document.getElementById('two-factor')?.scrollIntoView()
  }, [])

  return (
    <>
      <PageHeader title="My account" description="Your profile, password, two-factor authentication and what your role allows." />

      <section className="data-panel" aria-labelledby="profile-title">
        <header className="data-panel-header">
          <div>
            <h2 id="profile-title"><UserCog className="h-4 w-4" aria-hidden="true" /> Profile</h2>
            <p>Profile fields are managed by an administrator under System → Users.</p>
          </div>
        </header>
        <dl className="data-panel-body grid gap-3 text-[12px] sm:grid-cols-4">
          <div><dt className="text-muted">User name</dt><dd className="m-0 font-mono">{user.username}</dd></div>
          <div><dt className="text-muted">Display name</dt><dd className="m-0">{user.display_name || '—'}</dd></div>
          <div><dt className="text-muted">Type</dt><dd className="m-0"><UserTypeIndicator type={user.auth_type} detail /></dd></div>
          <div><dt className="text-muted">Role</dt><dd className="m-0">{user.role_name}</dd></div>
          <div><dt className="text-muted">E-mail</dt><dd className="m-0">{user.email || '—'}</dd></div>
          <div><dt className="text-muted">Last sign-in</dt><dd className="m-0 font-mono">{formatTimestamp(user.last_login_at) ?? 'Never'}</dd></div>
        </dl>
      </section>

      <section className="data-panel" aria-labelledby="password-title">
        <header className="data-panel-header">
          <div>
            <h2 id="password-title"><KeyRound className="h-4 w-4" aria-hidden="true" /> Password</h2>
            <p>{user.auth_type === 'local' ? 'Changing the password signs out your other sessions.' : 'Remote users sign in with the password of the RADIUS server.'}</p>
          </div>
        </header>
        {user.auth_type === 'local'
          ? <PasswordPanel />
          : <p className="data-panel-body m-0 text-[12px] text-secondary">Your password is verified by the configured RADIUS servers. Change it in your organization's directory.</p>}
      </section>

      <section id="two-factor" className="data-panel" aria-labelledby="totp-title">
        <header className="data-panel-header">
          <div>
            <h2 id="totp-title"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Two-factor authentication</h2>
            <p>TOTP codes (RFC 6238), compatible with common authenticator apps.</p>
          </div>
        </header>
        <TwoFactorPanel />
      </section>

      <section className="data-panel" aria-labelledby="permissions-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="permissions-title">My permissions</h2>
            <p>Granted by the role {user.role_name}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table permission-matrix">
            <thead>
              <tr>
                <th scope="col">Section</th>
                {PERMISSION_ACTIONS.map((action) => <th key={action.id} scope="col">{action.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <tr key={section.id}>
                  <td><span className="table-text">{section.label}</span><span className="cell-sub">{section.group}</span></td>
                  {PERMISSION_ACTIONS.map((action) => {
                    const granted = permissions[section.id]?.[action.id] === true
                    return (
                      <td key={action.id}>
                        {granted
                          ? <Check className="mx-auto h-4 w-4 text-success-text" aria-label="Granted" />
                          : <Minus className="mx-auto h-4 w-4 text-muted" aria-label="Not granted" />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
