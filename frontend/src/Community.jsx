import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { acceptFieldTask, fetchFieldTask, fetchFieldTasks, joinVolunteer, volunteerSession } from './api.js'
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

function signOutVolunteer(er, navigate) {
  er.setVolunteer(null)
  er.chooseRole('citizen')
  navigate('/community/signin', { replace: true })
}

export function CommunityLanding() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  if (er.role === 'ngo') {
    return <Navigate to="/app" replace />
  }
  if (er.role === 'volunteer' && er.volunteer) {
    return (
      <div className="page-screen who-followup">
        <p className="kicker">Community Response</p>
        <h1>Signed in as {er.volunteer.name}.</h1>
        <p className="page-lead">
          You only see field tasks assigned to you — not the citizen’s name, phone, or full case file.
        </p>
        <Link className="ghost-btn page-cta" to="/community/tasks">
          Open field tasks
        </Link>
        <button type="button" className="ghost-btn" onClick={() => signOutVolunteer(er, navigate)}>
          Sign out
        </button>
      </div>
    )
  }
  return (
    <div className="page-screen who-followup">
      <p className="kicker">Community Response</p>
      <h1>Help organizations respond to environmental incidents in your area.</h1>
      <p className="page-lead">
        Volunteers receive a field task only — not the citizen’s name, phone, or full case file.
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
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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
    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await joinVolunteer({ name, email, organization, capabilities: caps, password })
      setMessage('Request sent. The organization will approve you from Volunteers.')
      window.setTimeout(() => navigate('/community'), 1600)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-scroll org-page">
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">Community Response</p>
          <h1>Join</h1>
        </div>
      </header>
      <form className="org-page-body org-form" onSubmit={submit}>
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Organization <em className="who-optional">optional</em>
          <input value={organization} onChange={(event) => setOrganization(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <p className="org-access-label">Areas you can help with</p>
        {VOLUNTEER_CAPS.map((item) => (
          <label key={item.id} className="org-check">
            <input type="checkbox" checked={caps.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.label}
          </label>
        ))}
        {message ? <p className="pin-note">{message}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Request access'}
        </button>
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const row = await volunteerSession(email, password)
      er.setVolunteer(row)
      navigate('/community/tasks')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (er.role === 'volunteer' && er.volunteer) {
    return (
      <div className="page-scroll org-page">
        <header className="info-bar">
          <div className="info-bar-title">
            <p className="kicker">Community Response</p>
            <h1>Sign in</h1>
          </div>
        </header>
        <div className="org-page-body org-form">
          <p>You are already signed in as {er.volunteer.name}.</p>
          <Link className="ghost-btn page-cta" to="/community/tasks">
            Continue to field tasks
          </Link>
          <button type="button" className="ghost-btn" onClick={() => signOutVolunteer(er, navigate)}>
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
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">Community Response</p>
          <h1>Sign in</h1>
        </div>
      </header>
      <form className="org-page-body org-form" onSubmit={submit}>
        <p className="pin-note">
          Use the email the organization invited or approved, plus your password. If you have not set a
          password yet, this sign-in creates one (at least 8 characters).
        </p>
        <label>
          Email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Sign in'}
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
      <div className="org-page-body">
        <Link className="pin-note" to="/community">
          Back
        </Link>
        <p className="pin-note">Signed in as {er.volunteer.name}. You only see tasks assigned to you.</p>
        {error ? <p className="error-banner">{error}</p> : null}
        {tasks.length === 0 ? <p>No assigned tasks yet.</p> : null}
        {tasks.map((task) => (
          <Link key={task.id} className="org-row" to={`/community/task/${task.id}`}>
            <strong>
              {task.display_id} · {task.title}
            </strong>
            <span>
              {task.priority} · {task.assignment?.status}
            </span>
          </Link>
        ))}
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
  const hasMap = task.lat != null && task.lng != null
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
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">Field task</p>
          <h1>{task.title}</h1>
        </div>
      </header>
      <div className="org-page-body field-task">
        <p>
          {incidentTypeLabel(task.incident_type)} · Priority: {task.priority}
        </p>
        {hasMap ? (
          <div className="field-map">
            <HazardMap
              geojson={geojson}
              layers={{ case: true }}
              selectedId={task.id}
              onSelect={() => {}}
              onInspect={() => {}}
              autoLocate={false}
            />
          </div>
        ) : (
          <p className="pin-note">Location is not included in your access.</p>
        )}
        <h2>Task</h2>
        <p>{assignment.task}</p>
        {task.image_url ? (
          <>
            <h2>Evidence</h2>
            <img src={task.image_url} alt="" className="field-photo" />
          </>
        ) : null}
        <h2>Safety</h2>
        <p>{assignment.safety}</p>
        <p className="pin-note">Assigned by: {assignment.assigned_by}</p>
        <p>Status: {assignment.status}</p>
        {task.contact?.phone ? <p>Contact on file: {task.contact.phone}</p> : null}
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
  )
}
