import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useEarthRelay } from './context.jsx'
import { changeStaffPassword, staffSession } from './api.js'

function PasswordField({ label, value, onChange, autoComplete, required = true, name }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="password-field">
      {label}
      <span className="password-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          name={name}
          required={required}
          minLength={8}
          autoComplete={autoComplete}
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

function ChooseOwnPassword({ person, onSaved, onSignOut }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const currentValue = String(data.get('current') || current || '')
    const nextValue = String(data.get('next') || next || '')
    const confirmValue = String(data.get('confirm') || confirm || '')
    setCurrent(currentValue)
    setNext(nextValue)
    setConfirm(confirmValue)
    setError('')
    if (nextValue !== confirmValue) {
      setError('New password and confirmation do not match.')
      return
    }
    if (nextValue.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      const row = await changeStaffPassword(person.cms_id, currentValue, nextValue)
      onSaved(row)
    } catch (err) {
      setError(err.message || 'Could not save password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-screen who-followup staff-login choose-own-password">
      <p className="staff-login-brand">EarthRelay</p>
      <h1>Choose your password</h1>
      <p className="page-lead">
        The organization gave you a temporary password. Enter that, then set one only you know.
        Same on phone and laptop.
      </p>
      <form className="staff-login-form" onSubmit={submit}>
        <PasswordField
          label="Temporary password"
          name="current"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          label="Your new password"
          name="next"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save my password'}
        </button>
      </form>
      <button type="button" className="ghost-btn" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  )
}

function signOutStaff(er, navigate) {
  const fromOrg = sessionStorage.getItem('er-staff-from-org')
  sessionStorage.removeItem('er-staff-from-org')
  er.setStaff(null)
  if (fromOrg) {
    er.chooseRole('ngo')
    navigate('/app/staff', { replace: true })
    return
  }
  er.chooseRole('citizen')
  navigate('/staff/signin', { replace: true })
}

export function formatPay(amount) {
  return `PKR ${Number(amount || 0).toLocaleString()}`
}

export function staffGross(person) {
  return (
    Number(person?.salary_pkr || 0) +
    Number(person?.transport_allowance_pkr || 0) +
    Number(person?.medical_allowance_pkr || 0)
  )
}

function employmentTypeLabel(value) {
  if (value === 'full_time') return 'Full time'
  if (value === 'part_time') return 'Part time'
  if (value === 'contract') return 'Contract'
  return value || '—'
}

function masked(last4) {
  if (!last4) return 'On file with payroll'
  return `•••• ${last4}`
}

function recentPayslips(person) {
  const gross = person?.gross_pkr || staffGross(person)
  const now = new Date()
  const rows = []
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    rows.push({
      period: date.toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
      amount: gross,
      status: 'Paid',
    })
  }
  return rows
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function Field({ label, children }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

const STAFF_PANELS = [
  { id: 'profile', label: 'Profile' },
  { id: 'pay', label: 'Pay' },
  { id: 'employment', label: 'Employment' },
  { id: 'leave', label: 'Leave' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'documents', label: 'Documents' },
  { id: 'password', label: 'Password' },
]

function PasswordPanel({ person }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (next !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await changeStaffPassword(person.cms_id, current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setNotice('Password updated. Use the new password the next time you sign in.')
    } catch (err) {
      setError(err.message || 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staff-card">
      <h2>Password</h2>
      <p className="pin-note">
        Change your password here if you still know the current one. At least 8 characters.
      </p>
      <form className="staff-password-form" onSubmit={submit}>
        <PasswordField
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? <p className="error-banner">{error}</p> : null}
        {notice ? <p className="join-success">{notice}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>

      <div className="staff-password-forgot">
        <h3>Forgot password</h3>
        <p className="pin-note">
        If you do not remember the current password, the organization desk sets a temporary one.
          Ask them to open <strong>Staff IDs</strong>, select your Staff ID ({person.cms_id}), and
          use <strong>Set password</strong>. Sign in with that temporary password, then you choose
          your own. No email link is required.
        </p>
        {person.email ? (
          <p className="pin-note">
            Your email on file is {person.email}. Tell the desk that address when you ask, so they
            can confirm it is you.
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function StaffRecordCards({ person, heading = '' }) {
  const [panel, setPanel] = useState('profile')
  const slips = recentPayslips(person)

  return (
    <div className="staff-cards">
      {heading ? <p className="pin-note">{heading}</p> : null}
      <div className="staff-tabs" role="tablist">
        {STAFF_PANELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={panel === item.id}
            className={`staff-tab${panel === item.id ? ' is-current' : ''}`}
            onClick={() => setPanel(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {panel === 'profile' ? (
        <section className="staff-card">
          <h2>Profile</h2>
          <dl className="staff-dl">
            <Field label="Staff ID">
              <span className="staff-id-chip">{person.cms_id}</span>
            </Field>
            <Field label="Name">{person.name}</Field>
            <Field label="Phone">{person.phone || '—'}</Field>
            <Field label="Email">{person.email || '—'}</Field>
            <Field label="CNIC">{masked(person.cnic_last4)}</Field>
            <Field label="Emergency contact">{person.emergency_phone || 'On file'}</Field>
          </dl>
        </section>
      ) : null}

      {panel === 'pay' ? (
        <section className="staff-card">
          <h2>Pay</h2>
          <dl className="staff-dl">
            <Field label="Basic salary">{formatPay(person.salary_pkr)} / month</Field>
            <Field label="Transport allowance">{formatPay(person.transport_allowance_pkr)}</Field>
            <Field label="Medical allowance">{formatPay(person.medical_allowance_pkr)}</Field>
            <Field label="Gross this month">{formatPay(person.gross_pkr || staffGross(person))}</Field>
            <Field label="Pay cycle">{person.pay_cycle || 'monthly'}</Field>
            <Field label="Bank account">{masked(person.bank_last4)}</Field>
          </dl>
          <p className="org-access-label">Recent payslips</p>
          {slips.map((slip) => (
            <div key={slip.period} className="staff-payslip">
              <strong>{slip.period}</strong>
              <span>
                {formatPay(slip.amount)} · {slip.status}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {panel === 'employment' ? (
        <section className="staff-card">
          <h2>Employment</h2>
          <dl className="staff-dl">
            <Field label="Designation">{person.grade || person.role_label}</Field>
            <Field label="Role">{person.role_label}</Field>
            <Field label="Desk">{person.desk_label}</Field>
            <Field label="Type">{employmentTypeLabel(person.employment_type)}</Field>
            <Field label="Office">{person.office || '—'}</Field>
            <Field label="Reports to">{person.reports_to || '—'}</Field>
            <Field label="Joined">{person.joined_on || '—'}</Field>
            <Field label="Status">{person.status}</Field>
          </dl>
        </section>
      ) : null}

      {panel === 'leave' ? (
        <section className="staff-card">
          <h2>Leave</h2>
          <dl className="staff-dl">
            <Field label="Annual leave remaining">{person.leave_balance_days ?? 0} days</Field>
            <Field label="Sick leave remaining">8 days</Field>
            <Field label="Casual leave remaining">4 days</Field>
          </dl>
        </section>
      ) : null}

      {panel === 'attendance' ? (
        <section className="staff-card">
          <h2>Attendance</h2>
          <dl className="staff-dl">
            <Field label="Shift">Day</Field>
            <Field label="Present this month">18 days</Field>
            <Field label="Last recorded">{person.joined_on || 'On file'}</Field>
            <Field label="Work location">{person.office || '—'}</Field>
          </dl>
        </section>
      ) : null}

      {panel === 'documents' ? (
        <section className="staff-card">
          <h2>Documents</h2>
          <dl className="staff-dl">
            <Field label="Appointment letter">On file</Field>
            <Field label="Contract">{employmentTypeLabel(person.employment_type)}</Field>
            <Field label="Tax certificate">On file with payroll</Field>
            <Field label="Staff ID card">{person.cms_id}</Field>
          </dl>
        </section>
      ) : null}

      {panel === 'password' ? <PasswordPanel person={person} /> : null}
    </div>
  )
}

export function StaffSignInPage() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const cmsId = String(data.get('cms_id') || staffId || '').trim()
    const secret = String(data.get('password') || password || '')
    setStaffId(cmsId)
    setPassword(secret)
    setBusy(true)
    setError('')
    if (cmsId.includes('@')) {
      setBusy(false)
      setError('Use the Staff ID allotted by the organization, not an email address.')
      return
    }
    try {
      const row = await staffSession(cmsId, secret)
      er.setStaff(row)
      navigate('/staff', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (er.role === 'staff' && er.staff) {
    return <Navigate to="/staff" replace />
  }

  return (
    <div className="page-screen who-followup staff-login">
      <p className="staff-login-brand">EarthRelay</p>
      <h1>Staff sign in</h1>
      <p className="page-lead">Use your Staff ID and password.</p>
      <form className="staff-login-form" onSubmit={submit}>
        <label>
          Staff ID
          <input
            required
            placeholder="ER-CMS-2401"
            name="cms_id"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            autoComplete="username"
            spellCheck={false}
          />
        </label>
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
      <button type="button" className="pin-note staff-forgot-link" onClick={() => setShowForgot((v) => !v)}>
        {showForgot ? 'Hide forgot password help' : 'Forgot password?'}
      </button>
      {showForgot ? (
        <p className="pin-note staff-forgot-help">
          Ask the organization desk to open Staff IDs, select your Staff ID, and set a temporary
          password. Sign in with that, then choose your own password.
        </p>
      ) : null}
      {er.role === 'ngo' ? (
        <Link className="pin-note" to="/app">
          Organization desk
        </Link>
      ) : null}
      <Link className="pin-note" to="/">
        Public site
      </Link>
    </div>
  )
}

export function StaffHome() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  if (er.role !== 'staff' || !er.staff) {
    return <Navigate to="/staff/signin" replace />
  }

  const person = er.staff
  const fromOrg = Boolean(sessionStorage.getItem('er-staff-from-org'))

  if (person.must_change_password && !fromOrg) {
    return (
      <ChooseOwnPassword
        person={person}
        onSaved={(row) => er.setStaff(row)}
        onSignOut={() => signOutStaff(er, navigate)}
      />
    )
  }

  async function copyId() {
    const ok = await copyText(person.cms_id)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="staff-shell">
      <header className="staff-shell-bar">
        <div>
          <p className="kicker">Staff portal</p>
          <h1>{person.name}</h1>
          <p className="staff-shell-id">
            <span className="staff-id-chip">{person.cms_id}</span>
            <button type="button" className="ghost-btn" onClick={copyId}>
              {copied ? 'Copied' : 'Copy ID'}
            </button>
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => signOutStaff(er, navigate)}>
          {sessionStorage.getItem('er-staff-from-org') ? 'Back to Staff IDs' : 'Sign out'}
        </button>
      </header>
      <StaffRecordCards person={person} />
    </div>
  )
}
