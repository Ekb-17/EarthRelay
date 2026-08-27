import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  fetchOrg,
  forgotOrgPassword,
  orgSession,
  resetOrgPassword,
  setupOrg,
} from './api.js'
import { useEarthRelay } from './context.jsx'

export function PasswordField({ label, value, onChange, autoComplete, minLength = 8 }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="password-field">
      {label}
      <span className="password-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          enterKeyHint="done"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  )
}

const BRAND = {
  setup: {
    title: 'Create the organization login',
    copy: 'First visit only. Choose a username, password, and recovery email for this desk. Judges and operators set their own — there is no shared password baked into the app.',
  },
  login: {
    title: 'Organization desk',
    copy: 'This sign-in is for the organization that runs cases, staff IDs, and volunteer dispatch. Staff use a Staff ID. Volunteers use email and phone.',
  },
  forgot: {
    title: 'Forgot password',
    copy: 'Enter the organization username and the recovery email on file. We will send a 6-digit verification code.',
  },
  code: {
    title: 'Enter verification code',
    copy: 'Enter the 6-digit code, then choose a new password. The code expires in 10 minutes.',
  },
  done: {
    title: 'Password updated',
    copy: 'Sign in with your username and new password.',
  },
}

export default function OrgSignIn() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [hasRecovery, setHasRecovery] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState('login')
  const [orgName, setOrgName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (er.orgAuth) er.setOrgAuth(null)
    if (er.role === 'ngo') er.chooseRole('citizen')
  }, [])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setLoadError('')
    fetchOrg()
      .then((org) => {
        if (cancelled) return
        const setup = Boolean(org.setup)
        setNeedsSetup(setup)
        setHasRecovery(Boolean(org.has_recovery_email))
        setOrgName(org.name || '')
        // Only prefill username once the desk already exists (sign-in). Setup starts blank.
        setUsername(setup ? '' : org.username || '')
        setReady(true)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err.message || 'Could not reach the organization desk.')
        setNeedsSetup(false)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const user = username.trim()
    const secret = password
    try {
      if (needsSetup) {
        if (secret !== confirm) {
          setError('Password and confirmation do not match.')
          setBusy(false)
          return
        }
        if (secret.trim().length < 8) {
          setError('Password must be at least 8 characters.')
          setBusy(false)
          return
        }
        const row = await setupOrg({
          username: user,
          password: secret,
          name: orgName.trim(),
          email: email.trim(),
        })
        er.setOrgAuth(row)
      } else {
        const row = await orgSession({ username: user, password: secret })
        er.setOrgAuth(row)
      }
      navigate('/app')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitForgot(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await forgotOrgPassword({ username: username.trim(), email: email.trim() })
      setNotice(result.detail || 'A verification code was sent.')
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitReset(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (password !== confirm) {
        setError('Password and confirmation do not match.')
        setBusy(false)
        return
      }
      await resetOrgPassword({
        username: username.trim(),
        email: email.trim(),
        code,
        password,
      })
      setPassword('')
      setConfirm('')
      setCode('')
      setNotice('Password updated. Sign in with your new password.')
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (er.role === 'staff') {
    return <Navigate to="/staff" replace />
  }

  if (er.role === 'volunteer') {
    return <Navigate to="/community/tasks" replace />
  }

  const mode = needsSetup ? 'setup' : step
  const brand = BRAND[mode] || BRAND.login
  const showForm = ready && !loadError && (needsSetup || step === 'login')

  return (
    <div className="org-login">
      <aside className="org-login-brand">
        <p className="org-login-brand-name">EarthRelay</p>
        <h1>{brand.title}</h1>
        <p>{brand.copy}</p>
      </aside>
      <div className="org-login-panel">
        <div className="org-login-card">
          {!ready ? <p className="pin-note">Loading…</p> : null}
          {ready && loadError ? (
            <div className="org-login-form">
              <p className="error-banner">{loadError}</p>
              <button
                type="button"
                className="ghost-btn page-cta"
                onClick={() => setReloadToken((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          ) : null}
          {showForm ? (
            <form className="org-login-form" onSubmit={submitLogin}>
              {needsSetup ? (
                <label>
                  Organization name
                  <input
                    required
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    autoComplete="organization"
                    enterKeyHint="next"
                  />
                </label>
              ) : null}
              <label>
                Username
                <input
                  required
                  minLength={3}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  enterKeyHint="next"
                  inputMode="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              {needsSetup ? (
                <label>
                  Recovery email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="next"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              ) : null}
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
              />
              {needsSetup ? (
                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
              ) : null}
              {error ? <p className="error-banner">{error}</p> : null}
              {notice ? <p className="pin-note">{notice}</p> : null}
              <button className="ghost-btn page-cta" type="submit" disabled={busy || !ready}>
                {busy ? 'Checking…' : needsSetup ? 'Create organization login' : 'Sign in'}
              </button>
              {!needsSetup ? (
                <button
                  type="button"
                  className="org-login-text-btn"
                  onClick={() => {
                    setError('')
                    setNotice('')
                    setStep('forgot')
                  }}
                >
                  Forgot password?
                </button>
              ) : (
                <p className="pin-note">
                  After you create this login, later visits use Sign in with the same username and
                  password.
                </p>
              )}
            </form>
          ) : null}
          {ready && !loadError && !needsSetup && step === 'forgot' ? (
            <form className="org-login-form" onSubmit={submitForgot}>
              {!hasRecovery ? (
                <p className="pin-note">
                  This desk has no recovery email yet. Sign in with the current password, then add
                  one in Settings.
                </p>
              ) : null}
              <label>
                Username
                <input
                  required
                  minLength={3}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label>
                Recovery email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!hasRecovery}
                />
              </label>
              {error ? <p className="error-banner">{error}</p> : null}
              <button className="ghost-btn page-cta" type="submit" disabled={busy || !hasRecovery}>
                {busy ? 'Sending…' : 'Send verification code'}
              </button>
              <button
                type="button"
                className="org-login-text-btn"
                onClick={() => {
                  setError('')
                  setStep('login')
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : null}
          {ready && !loadError && !needsSetup && step === 'code' ? (
            <form className="org-login-form" onSubmit={submitReset}>
              {notice ? <p className="pin-note">{notice}</p> : null}
              <label>
                Verification code
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  enterKeyHint="next"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              {error ? <p className="error-banner">{error}</p> : null}
              <button className="ghost-btn page-cta" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Set new password'}
              </button>
              <button
                type="button"
                className="org-login-text-btn"
                disabled={busy}
                onClick={() => submitForgot({ preventDefault() {} })}
              >
                Resend code
              </button>
              <button
                type="button"
                className="org-login-text-btn"
                onClick={() => {
                  setError('')
                  setNotice('')
                  setStep('forgot')
                }}
              >
                Use a different email
              </button>
            </form>
          ) : null}
          {ready && !loadError && !needsSetup && step === 'done' ? (
            <div className="org-login-form">
              {notice ? <p className="pin-note">{notice}</p> : null}
              <button
                type="button"
                className="ghost-btn page-cta"
                onClick={() => {
                  setNotice('')
                  setError('')
                  setStep('login')
                }}
              >
                Sign in
              </button>
            </div>
          ) : null}
          <Link className="pin-note" to="/">
            Public site
          </Link>
        </div>
      </div>
    </div>
  )
}
