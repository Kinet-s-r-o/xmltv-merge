import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { authApi, type LoginResponse, type Session } from '../../api/client'
import { errorMessage } from '../ui/ResourceState'
import { TotpQrCode, formatSecret } from './TotpQrCode'

type Step =
  | { kind: 'credentials' }
  | { kind: 'totp'; challenge: string }
  | { kind: 'totp_setup'; challenge: string; secret: string; uri: string }

const MIN_PASSWORD = 10

function AuthPanel({ title, subtitle, wide, children }: { title: string; subtitle: string; wide?: boolean; children: ReactNode }) {
  return (
    <main className="auth-screen">
      <section className={`auth-panel${wide ? ' is-wide' : ''}`} aria-labelledby="auth-title">
        <header className="auth-panel-header">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <div className="min-w-0">
            <h1 id="auth-title">{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>
        {children}
        <footer className="auth-panel-footer font-mono">XMLTV EPG · guide aggregation console</footer>
      </section>
    </main>
  )
}

function CodeField({ value, onChange, inputRef }: { value: string; onChange: (value: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <label className="field">
      Verification code
      <input
        ref={inputRef}
        className="input code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-describedby="code-hint"
      />
      <span id="code-hint" className="field-hint">6-digit code from your authenticator app; it changes every 30 seconds.</span>
    </label>
  )
}

/** Sign-in page: first-administrator setup, credentials, TOTP code or TOTP enrollment. */
export function LoginPage({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: (session: Session) => void }) {
  const [step, setStep] = useState<Step>({ kind: 'credentials' })
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step.kind === 'credentials') firstFieldRef.current?.focus()
    else codeRef.current?.focus()
  }, [step.kind])

  const handleResponse = (response: LoginResponse) => {
    setCode('')
    if (response.status === 'ok') {
      setPassword('')
      onAuthenticated(response)
    } else if (response.status === 'totp_required') {
      setStep({ kind: 'totp', challenge: response.challenge })
    } else {
      setStep({ kind: 'totp_setup', challenge: response.challenge, secret: response.totp_secret, uri: response.totp_uri })
    }
  }

  const run = async (action: () => Promise<LoginResponse>, onFail?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      handleResponse(await action())
    } catch (err) {
      setError(errorMessage(err))
      onFail?.()
    } finally {
      setBusy(false)
    }
  }

  const restart = (message?: string) => {
    setStep({ kind: 'credentials' })
    setPassword('')
    setCode('')
    setError(message ?? null)
  }

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault()
    void run(() => authApi.login(username.trim(), password), () => setPassword(''))
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault()
    if (step.kind === 'credentials') return
    void run(() => authApi.verify(step.challenge, code), () => {
      setCode('')
      codeRef.current?.focus()
    })
  }

  if (setupRequired && step.kind === 'credentials') {
    const tooShort = password.length > 0 && password.length < MIN_PASSWORD
    const mismatch = confirm.length > 0 && confirm !== password
    return (
      <AuthPanel title="Create the first administrator" subtitle="No user accounts exist yet">
        <form className="auth-panel-body" onSubmit={(event) => {
          event.preventDefault()
          void run(() => authApi.setup({ username: username.trim(), display_name: displayName.trim(), password }))
        }}>
          <p>This account gets the built-in Administrator role with full access. Add further users and roles under System after signing in.</p>
          <label className="field">
            User name
            <input ref={firstFieldRef} className="input" autoComplete="username" required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="field">
            Display name
            <input className="input" autoComplete="name" maxLength={200} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional" />
          </label>
          <label className="field">
            Password
            <input type="password" className="input" autoComplete="new-password" required value={password} aria-invalid={tooShort || undefined} aria-describedby="setup-password-hint" onChange={(event) => setPassword(event.target.value)} />
            <span id="setup-password-hint" className={tooShort ? 'field-error' : 'field-hint'}>At least {MIN_PASSWORD} characters</span>
          </label>
          <label className="field">
            Confirm password
            <input type="password" className="input" autoComplete="new-password" required value={confirm} aria-invalid={mismatch || undefined} aria-describedby="setup-confirm-hint" onChange={(event) => setConfirm(event.target.value)} />
            {mismatch && <span id="setup-confirm-hint" className="field-error">Passwords do not match</span>}
          </label>
          {error && <p className="inline-alert is-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !username.trim() || password.length < MIN_PASSWORD || confirm !== password}>
            {busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy ? 'Creating…' : 'Create administrator and sign in'}
          </button>
        </form>
      </AuthPanel>
    )
  }

  if (step.kind === 'totp') {
    return (
      <AuthPanel title="Two-factor authentication" subtitle={`Signing in as ${username.trim()}`}>
        <form className="auth-panel-body" onSubmit={submitCode}>
          <p>Open your authenticator app and enter the current code for XMLTV EPG.</p>
          <CodeField value={code} onChange={setCode} inputRef={codeRef} />
          {error && <p className="inline-alert is-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy ? 'Verifying…' : 'Verify and sign in'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => restart()} disabled={busy}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Use another account
          </button>
        </form>
      </AuthPanel>
    )
  }

  if (step.kind === 'totp_setup') {
    return (
      <AuthPanel title="Set up two-factor authentication" subtitle={`Required for ${username.trim()}`} wide>
        <form className="auth-panel-body" onSubmit={submitCode}>
          <p>An administrator requires a second factor for this account. Scan the code with an authenticator app (e.g. Microsoft Authenticator, Google Authenticator, Aegis), then enter the code it shows.</p>
          <TotpQrCode uri={step.uri} label={`QR code for adding ${username.trim()} to an authenticator app`} />
          <div className="field">
            Or enter this key manually
            <code className="secret-text">{formatSecret(step.secret)}</code>
          </div>
          <CodeField value={code} onChange={setCode} inputRef={codeRef} />
          {error && <p className="inline-alert is-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            {busy ? 'Verifying…' : 'Enable 2FA and sign in'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => restart()} disabled={busy}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
          </button>
        </form>
      </AuthPanel>
    )
  }

  return (
    <AuthPanel title="Sign in" subtitle="XMLTV EPG operations console">
      <form className="auth-panel-body" onSubmit={submitCredentials}>
        <label className="field">
          User name
          <input ref={firstFieldRef} className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={100} value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" className="input" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="inline-alert is-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || !username.trim() || !password}>
          {busy ? <span className="spinner spinner-sm" aria-hidden="true" /> : <LogIn className="h-3.5 w-3.5" aria-hidden="true" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="field-hint inline-flex items-center gap-1.5"><KeyRound className="h-3 w-3" aria-hidden="true" /> Local and RADIUS (remote) accounts sign in here.</p>
      </form>
    </AuthPanel>
  )
}
