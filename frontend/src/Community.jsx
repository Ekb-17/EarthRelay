import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { acceptFieldTask, changeVolunteerPassword, fetchFieldTask, fetchFieldTasks, forgotVolunteerPassword, joinVolunteer, resetVolunteerPassword, volunteerSession } from './api.js'
import { incidentTypeLabel, useEarthRelay } from './context.jsx'
import HazardMap from './HazardMap.jsx'

export const VOLUNTEER_CAPS = [
  { id: 'cleanup', label: 'Cleanup' },
  { id: 'field_assessment', label: 'Field assessment' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'community', label: 'Community outreach' },
]

export const CAP_LABELS = {
  ...Object.fromEntries(VOLUNTEER_CAPS.map((item) => [item.id, item.label])),
  documentation: 'Documentation',
  wildlife: 'Wildlife',
  first_aid: 'First aid',
}

export function formatCapabilities(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return ''
  return ids.map((id) => CAP_LABELS[id] || String(id).replaceAll('_', ' ')).join(', ')
}


function passwordFromForm(data, ...keys) {
  for (const key of keys) {
    if (data.has(key)) return String(data.get(key) ?? '')
  }
  return ''
}

function PasswordField({ label, value, onChange, autoComplete, name }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="password-field">
      {label}
      <span className="password-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          name={name}
          required
          minLength={8}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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

function ChooseOwnPassword({ volunteer, onSaved, onSignOut }) {
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
      const row = await changeVolunteerPassword(volunteer.id, currentValue, nextValue)
      onSaved(row)
    } catch (err) {
      setError(err.message || 'Could not save password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-scroll org-page choose-own-password">
      <form className="org-page-body org-form" onSubmit={submit}>
        <p className="kicker">Community Response</p>
        <h1>Choose your password</h1>
        <p className="page-lead">
          The organization gave you a temporary password. Enter that, then set one only you know.
          Same on phone and laptop.
        </p>
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
        <button type="button" className="ghost-btn" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  )
}

function VolunteerPasswordPanel({ volunteer, onSaved }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
    setNotice('')
    if (nextValue !== confirmValue) {
      setError('New password and confirmation do not match.')
      return
    }
    setBusy(true)
    try {
      const row = await changeVolunteerPassword(volunteer.id, currentValue, nextValue)
      setCurrent('')
      setNext('')
      setConfirm('')
      setNotice('Password updated. Use the new password the next time you sign in.')
      onSaved(row)
    } catch (err) {
      setError(err.message || 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="org-form" onSubmit={submit}>
      <p className="org-access-label">Password</p>
      <p className="pin-note">
        Change it here if you still know the current one. If you forgot it, ask the organization
        desk to set a temporary password on Volunteers, then you choose your own after sign-in.
      </p>
      <PasswordField
        label="Current password"
        name="current"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        label="New password"
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
      {notice ? <p className="pin-note">{notice}</p> : null}
      <button className="ghost-btn page-cta" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Update password'}
      </button>
    </form>
  )
}

function signOutVolunteer(er, navigate) {
  er.setVolunteer(null)
  er.chooseRole('citizen')
  navigate('/community/signin', { replace: true })
}

export function VolunteerShell() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const location = useLocation()
  const signedIn = er.role === 'volunteer' && Boolean(er.volunteer)
  const onTasks = location.pathname.startsWith('/community/task')
  const publicEntry =
    !signedIn &&
    (location.pathname === '/community' ||
      location.pathname === '/community/join' ||
      location.pathname === '/community/signin')

  if (signedIn && er.volunteer?.must_change_password) {
    return (
      <div className="vol-shell">
        <div className="vol-body">
          <ChooseOwnPassword
            volunteer={er.volunteer}
            onSaved={(row) => er.setVolunteer(row)}
            onSignOut={() => signOutVolunteer(er, navigate)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`vol-shell${publicEntry ? ' is-public' : ''}`}>
      <div className="vol-body">
        <Outlet />
      </div>
      {publicEntry ? null : (
      <nav className="vol-nav-mobile" aria-label="Volunteer">
        {signedIn ? (
          <>
            <NavLink
              to="/community/tasks"
              className={({ isActive }) =>
                `vol-nav-mobile-link${isActive || onTasks ? ' is-current' : ''}`
              }
            >
              Tasks
            </NavLink>
            <NavLink
              to="/community"
              end
              className={({ isActive }) => `vol-nav-mobile-link${isActive ? ' is-current' : ''}`}
            >
              Account
            </NavLink>
          </>
        ) : (
          <>
            <NavLink
              to="/community"
              end
              className={({ isActive }) => `vol-nav-mobile-link${isActive ? ' is-current' : ''}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/community/join"
              className={({ isActive }) => `vol-nav-mobile-link${isActive ? ' is-current' : ''}`}
            >
              Join
            </NavLink>
            <NavLink
              to="/community/signin"
              className={({ isActive }) => `vol-nav-mobile-link${isActive ? ' is-current' : ''}`}
            >
              Sign in
            </NavLink>
          </>
        )}
      </nav>
      )}
    </div>
  )
}

export function CommunityLanding() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  if (er.role === 'volunteer' && er.volunteer) {
    return (
      <div className="page-scroll org-page">
        <div className="org-page-body org-form">
          <p className="kicker">Community Response</p>
          <h1>Account</h1>
          <p className="page-lead">
            Signed in as {er.volunteer.name}. Assigned tasks include a map pin and the street
            address for the site — not the citizen’s name or phone.
          </p>
          <Link className="ghost-btn page-cta" to="/community/tasks">
            Open field tasks
          </Link>
          <VolunteerPasswordPanel volunteer={er.volunteer} onSaved={(row) => er.setVolunteer(row)} />
          <button type="button" className="ghost-btn" onClick={() => signOutVolunteer(er, navigate)}>
            Sign out
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="page-screen who-followup community-landing">
      <p className="kicker">Community Response</p>
      <h1>Help organizations respond to environmental incidents in your area.</h1>
      <p className="page-lead">
        Volunteers receive a field task with a map pin for the site — not the citizen’s name or
        phone.
      </p>
      <Link className="ghost-btn" to="/community/join">
        Join as a Volunteer
      </Link>
      <Link className="ghost-btn" to="/community/signin">
        Already part of an organization? Sign in
      </Link>
      <Link className="pin-note" to="/">
        Home
      </Link>
    </div>
  )
}

export function CommunityJoin() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [organization, setOrganization] = useState('')
  const [caps, setCaps] = useState(['cleanup'])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id) {
    setCaps((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const nextName = String(data.get('name') || '').trim()
    const nextEmail = String(data.get('email') || '').trim().toLowerCase()
    const nextPhone = String(data.get('phone') || '').trim()
    const nextOrg = String(data.get('organization') || '').trim()
    const nextPassword = passwordFromForm(data, 'volunteer_join_password', 'password')
    const nextConfirm = passwordFromForm(data, 'volunteer_join_confirm', 'confirm')
    setName(nextName)
    setEmail(nextEmail)
    setPhone(nextPhone)
    setOrganization(nextOrg)
    setPassword(nextPassword)
    setConfirm(nextConfirm)
    if (nextPassword.length < 8) {
      setMessage('Password must be at least 8 characters.')
      return
    }
    if (nextPassword !== nextConfirm) {
      setMessage('Passwords do not match.')
      return
    }
    if (!nextEmail || !nextEmail.includes('@')) {
      setMessage('Enter a valid email address.')
      return
    }
    if (caps.length === 0) {
      setMessage('Pick at least one area you can help with.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const row = await joinVolunteer({
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        organization: nextOrg,
        capabilities: caps,
        password: nextPassword,
      })
      if (row.status === 'active' || row.status === 'invited') {
        setMessage(`Password saved for ${nextEmail}. Sign in with this email, phone, and password.`)
      } else {
        setMessage(
          `Request sent for ${nextEmail}. The organization will approve you from Volunteers. You cannot sign in until they approve you.`,
        )
      }
    } catch (err) {
      setMessage(err.message || 'Could not submit request.')
    } finally {
      setBusy(false)
    }
  }

  if (er.role === 'volunteer' && er.volunteer) {
    return (
      <div className="page-scroll org-page">
        <div className="org-page-body org-form">
          <p className="kicker">Community Response</p>
          <h1>Join</h1>
          <p className="pin-note">
            You are signed in as {er.volunteer.email}. Sign out first if you want to join with a
            different email.
          </p>
          <button type="button" className="ghost-btn page-cta" onClick={() => signOutVolunteer(er, navigate)}>
            Sign out
          </button>
          <Link className="pin-note" to="/community">
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-scroll org-page">
      <form className="org-page-body org-form" autoComplete="off" onSubmit={submit}>
        <p className="kicker">Community Response</p>
        <h1>Join</h1>
        <label>
          Name
          <input name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+92… or 03… or any country"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <p className="pin-note">The organization may call this number for important field information.</p>
        <label>
          Organization <em className="who-optional">optional</em>
          <input
            name="organization"
            autoComplete="organization"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
          />
        </label>
        <p className="pin-note">
          Choose an EarthRelay password (not your Gmail password). Any phone number can be shared by
          several emails — yours, a sibling’s, or anyone else’s.
        </p>
        <PasswordField
          label="Password"
          name="volunteer_join_password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm password"
          name="volunteer_join_confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        <p className="org-access-label">Areas you can help with</p>
        {VOLUNTEER_CAPS.map((item) => (
          <label key={item.id} className="org-check">
            <input type="checkbox" checked={caps.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.label}
          </label>
        ))}
        {message ? (
          <p
            className={`pin-note${
              message.startsWith('Request sent') || message.startsWith('Password saved')
                ? ' join-success'
                : ' error-banner'
            }`}
          >
            {message}
          </p>
        ) : null}
        <button className="ghost-btn page-cta community-submit" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Request access'}
        </button>
        <Link className="ghost-btn" to="/community/signin">
          Already have an account? Sign in
        </Link>
        <Link className="pin-note" to="/community">
          Back
        </Link>
      </form>
    </div>
  )
}

export function CommunitySignIn() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('signin')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Never skip the password form because of a leftover sessionStorage login —
  // that looked like “wrong email/password still worked” in demos.
  useEffect(() => {
    if (er.volunteer || er.role === 'volunteer') {
      er.setVolunteer(null)
      er.chooseRole('citizen')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on entering sign-in
  }, [])

  function readForm(event) {
    const data = new FormData(event.currentTarget)
    const nextEmail = String(data.has('email') ? data.get('email') : email || '')
      .trim()
      .toLowerCase()
    const nextPhone = String(data.has('phone') ? data.get('phone') : phone || '').trim()
    const nextPassword = passwordFromForm(data, 'volunteer_password', 'password') || password
    const nextConfirm = passwordFromForm(data, 'volunteer_password_confirm', 'confirm') || confirm
    const nextCode = String(data.has('code') ? data.get('code') : code || '').trim()
    setEmail(nextEmail)
    setPhone(nextPhone)
    setPassword(nextPassword)
    if (mode === 'code') setConfirm(nextConfirm)
    if (mode === 'code') setCode(nextCode)
    return { nextEmail, nextPhone, nextPassword, nextConfirm, nextCode }
  }

  async function submit(event) {
    event.preventDefault()
    const { nextEmail, nextPhone, nextPassword, nextConfirm, nextCode } = readForm(event)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'forgot') {
        const result = await forgotVolunteerPassword(nextEmail, nextPhone)
        setNotice(result.detail || 'A verification code was sent.')
        setMode('code')
        return
      }
      if (mode === 'code') {
        if (nextPassword !== nextConfirm) {
          setError('Passwords do not match.')
          setBusy(false)
          return
        }
        await resetVolunteerPassword(nextEmail, nextPhone, nextCode, nextPassword)
        setMode('signin')
        setConfirm('')
        setCode('')
        setPassword('')
        setNotice('Password updated. Sign in with the new password.')
        return
      }
      if (!nextEmail || !nextPhone || nextPassword.length < 8) {
        setError('Email or password is incorrect.')
        setBusy(false)
        return
      }
      // Drop any cached volunteer before the API check so a failed attempt cannot keep access.
      er.setVolunteer(null)
      const row = await volunteerSession(nextEmail, nextPassword, nextPhone)
      if (!row?.id || !row?.email) {
        throw new Error('Email or password is incorrect.')
      }
      // Signed-in email must match what they typed (defense in depth).
      if (String(row.email).trim().toLowerCase() !== nextEmail) {
        throw new Error('Email or password is incorrect.')
      }
      er.setVolunteer(row)
      setPassword('')
      navigate('/community/tasks')
    } catch (err) {
      er.setVolunteer(null)
      setError(err.message || 'Email or password is incorrect.')
    } finally {
      setBusy(false)
    }
  }

  const forgetting = mode === 'forgot'
  const coding = mode === 'code'
  const title = coding ? 'Enter code' : forgetting ? 'Reset password' : 'Sign in'
  const copy = coding
    ? 'Enter the 6-digit code from your email, then choose a new password.'
    : forgetting
      ? 'Confirm the email and phone on your account. If email delivery is set up, we send a code so you can choose a new password. Otherwise ask the organization desk to set a temporary password on Volunteers — you sign in with that, then choose your own.'
      : 'Use your EarthRelay email, phone, and password — not the password for your email inbox. Wrong details are rejected.'

  return (
    <div className="page-scroll org-page">
      <form className="org-page-body org-form" autoComplete="off" onSubmit={submit}>
        <p className="kicker">Community Response</p>
        <h1>{title}</h1>
        <p className="pin-note">{copy}</p>
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            name="phone"
            required
            inputMode="tel"
            autoComplete="off"
            placeholder="+92… or 03… or any country"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        {coding ? (
          <label>
            Verification code
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength={6}
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        ) : null}
        {!forgetting ? (
          <PasswordField
            label={coding ? 'New password' : 'Password'}
            name="volunteer_password"
            value={password}
            onChange={setPassword}
            autoComplete={coding ? 'new-password' : 'current-password'}
          />
        ) : null}
        {coding ? (
          <PasswordField
            label="Confirm password"
            name="volunteer_password_confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
        ) : null}
        {notice ? <p className="pin-note">{notice}</p> : null}
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy
            ? 'Checking…'
            : coding
              ? 'Save password'
              : forgetting
                ? 'Send code'
                : 'Sign in'}
        </button>
        {coding ? (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              setNotice('')
              try {
                const result = await forgotVolunteerPassword(email, phone)
                setNotice(result.detail || 'Code sent again. Check your email.')
              } catch (err) {
                setError(err.message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Resend code
          </button>
        ) : null}
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setMode(forgetting || coding ? 'signin' : 'forgot')
            setError('')
            setNotice('')
            setConfirm('')
            setCode('')
          }}
        >
          {forgetting || coding ? 'Back to sign in' : 'Forgot password?'}
        </button>
        <Link className="pin-note" to="/community">
          Back
        </Link>
      </form>
    </div>
  )
}

export function VolunteerTasks() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!er.volunteer?.id) return
    fetchFieldTasks(er.volunteer.id)
      .then((data) => setTasks(data.tasks || []))
      .catch((err) => setError(err.message))
  }, [er.volunteer?.id])

  if (er.role !== 'volunteer' || !er.volunteer) {
    return <Navigate to="/community/signin" replace />
  }

  return (
    <div className="page-scroll org-page">
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">Community Response</p>
          <h1>Field tasks</h1>
        </div>
        <button type="button" className="ghost-btn" onClick={() => signOutVolunteer(er, navigate)}>
          Sign out
        </button>
      </header>
      <div className="org-page-body org-form">
        <Link className="pin-note" to="/community">
          Back
        </Link>
        <p className="pin-note">Signed in as {er.volunteer.name}. You only see tasks assigned to you.</p>
        {error ? <p className="error-banner">{error}</p> : null}
        {tasks.length === 0 ? <p>No assigned tasks yet.</p> : null}
        {tasks.map((task) => {
          const hasPin = task.lat != null && task.lng != null
          const hazard = incidentTypeLabel(task.incident_type)
          const meta = [
            task.priority,
            task.assignment?.status,
            task.area_label,
            task.street,
            hasPin ? 'Map pin' : null,
            task.has_photo || task.image_url ? 'Photo' : null,
          ].filter(Boolean)
          return (
            <Link key={task.id} className="org-row field-task-row" to={`/community/task/${task.id}`}>
              <strong>
                {task.display_id} · {hazard} · {task.title}
              </strong>
              <span>{meta.join(' · ')}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function FieldTask() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const [task, setTask] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!er.volunteer?.id || !caseId) return
    fetchFieldTask(caseId, er.volunteer.id)
      .then(setTask)
      .catch((err) => setError(err.message))
  }, [caseId, er.volunteer?.id])

  if (er.role !== 'volunteer' || !er.volunteer) {
    return <Navigate to="/community/signin" replace />
  }

  async function accept() {
    setBusy(true)
    try {
      setTask(await acceptFieldTask(caseId, er.volunteer.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !task) {
    return (
      <div className="page-screen">
        <p>{error}</p>
        <Link to="/community/tasks">Tasks</Link>
      </div>
    )
  }
  if (!task) {
    return (
      <div className="page-screen">
        <p>Loading…</p>
      </div>
    )
  }

  const assignment = task.assignment || {}
  const hazard = incidentTypeLabel(task.incident_type)
  const hasMap = task.lat != null && task.lng != null
  const mapsUrl = hasMap
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${task.lat},${task.lng}`)}`
    : null
  const placeTarget = hasMap
    ? {
        lat: task.lat,
        lng: task.lng,
        zoom: 16,
        name: task.area_label || 'Incident site',
        label: task.area_label || 'Incident site',
        pickedAt: Date.now(),
      }
    : null
  const geojson = hasMap
    ? {
        case: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [task.lng, task.lat] },
              properties: { id: task.id, hazard: 'case', title: task.title },
            },
          ],
        },
      }
    : null

  return (
    <div className="page-scroll org-page">
      <div className="org-page-body field-task">
        <p className="kicker">Field task</p>
        <h1>
          {hazard} · {task.title}
        </h1>
        <p className="field-task-meta">
          {task.display_id} · Priority: {task.priority} · Status: {assignment.status}
        </p>
        <p className="pin-note">
          Exact site is the map pin and street address below. Citizen name and phone stay with the
          organization.
        </p>
        {hasMap ? (
          <>
            <h2>Exact site</h2>
            {task.area_label ? <p className="field-area">{task.area_label}</p> : null}
            {task.street ? <p className="field-area">{task.street}</p> : null}
            <div className="field-map field-map-lg">
              <HazardMap
                geojson={geojson}
                layers={{ case: true }}
                selectedId={task.id}
                onSelect={() => {}}
                onInspect={() => {}}
                placeTarget={placeTarget}
                autoLocate={false}
              />
            </div>
            <a className="ghost-btn page-cta field-maps-link" href={mapsUrl} target="_blank" rel="noreferrer">
              Open in Maps
            </a>
            <p className="pin-note">Pink pin is the incident GPS. Use Open in Maps for turn-by-turn on your phone.</p>
          </>
        ) : (
          <p className="pin-note">Location is not included in your access. Ask the organization for the pin.</p>
        )}
        <h2>What to do</h2>
        <p>{assignment.task}</p>
        {task.image_url ? (
          <>
            <h2>Evidence</h2>
            <img src={task.image_url} alt={`${hazard} evidence`} className="field-photo" />
          </>
        ) : null}
        <h2>Safety</h2>
        <p>{assignment.safety}</p>
        <p className="pin-note field-assigned">Assigned by: {assignment.assigned_by}</p>
        {task.contact?.phone ? <p>Contact on file: {task.contact.phone}</p> : null}
        <div className="field-task-actions">
          {assignment.status === 'pending' ? (
            <button className="ghost-btn page-cta" type="button" onClick={accept} disabled={busy}>
              {busy ? 'Saving…' : 'Accept task'}
            </button>
          ) : (
            <p className="pin-note">Task accepted.</p>
          )}
          <Link className="pin-note" to="/community/tasks">
            All tasks
          </Link>
        </div>
      </div>
    </div>
  )
}
