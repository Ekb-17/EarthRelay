import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { displayCaseId, useEarthRelay } from './context.jsx'
import { formatCapabilities } from './Community.jsx'
import {
  fetchOrg,
  fetchVolunteers,
  inviteVolunteer,
  updateOrg,
  updateVolunteer,
} from './api.js'

const PARTNERS = [
  { name: 'Green Valley Volunteers', detail: 'Cleanup and field assessment' },
  { name: 'Community Cleanup Team', detail: 'Debris removal' },
  { name: 'Local Relief Group', detail: 'Supplies and community support' },
]

export function ActiveResponses() {
  const er = useEarthRelay()
  const assigned = er.cases.filter((item) => item.assignment && item.status !== 'resolved')

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Active Responses</h1>
        <Link className="ghost-btn" to="/app/assign">
          Assign
        </Link>
      </header>
      <div className="org-page-body">
        {assigned.length === 0 ? (
          <p className="pin-note">
            No field tasks assigned yet.{' '}
            <Link to="/app/assign">Assign volunteers</Link> from the open-case list.
          </p>
        ) : (
          assigned.map((item) => (
            <Link key={item.id} className="org-row" to={`/case/${item.id}`}>
              <strong>
                {displayCaseId(item)} · {item.assignment.need_label || item.assignment.need}
              </strong>
              <span>
                {item.assignment.responder_name} · {item.assignment.status} ·{' '}
                {item.report?.priority || item.priority}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

export function VolunteersPage() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      setPayload(await fetchVolunteers())
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function setStatus(id, status) {
    try {
      await updateVolunteer(id, { status })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const rows = payload?.volunteers || []

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Volunteers</h1>
        <Link className="ghost-btn" to="/app/volunteers/invite">
          Invite
        </Link>
      </header>
      <div className="org-page-body">
        {error ? <p className="error-banner">{error}</p> : null}
        {rows.map((row) => {
          const areas = formatCapabilities(row.capabilities)
          return (
          <div key={row.id} className="org-row">
            <strong>{row.name}</strong>
            <span>
              {row.email} · {row.status}
              {areas ? ` · ${areas}` : ''}
              {row.organization ? ` · ${row.organization}` : ''}
            </span>
            {row.status === 'pending' ? (
              <div className="org-row-actions">
                <button type="button" className="ghost-btn" onClick={() => setStatus(row.id, 'active')}>
                  Approve
                </button>
                <button type="button" className="ghost-btn" onClick={() => setStatus(row.id, 'declined')}>
                  Decline
                </button>
              </div>
            ) : null}
          </div>
          )
        })}
      </div>
    </div>
  )
}

export function InvitePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [photos, setPhotos] = useState(true)
  const [location, setLocation] = useState(true)
  const [contact, setContact] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const row = await inviteVolunteer({
        email,
        access: { assigned_only: true, photos, location, contact_citizen: contact },
      })
      setMessage(
        row.email_sent
          ? `Invitation emailed to ${row.email}.`
          : `Invitation saved for ${row.email}. ${row.email_detail || 'Email was not sent (SMTP not configured).'}`,
      )
      window.setTimeout(() => navigate('/app/volunteers'), 1400)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Invite community responder</h1>
        <Link className="ghost-btn" to="/app/volunteers">
          Volunteers
        </Link>
      </header>
      <form className="org-page-body org-form" onSubmit={submit}>
        <label>
          Email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Role
          <select defaultValue="field_volunteer">
            <option value="field_volunteer">Field Volunteer</option>
          </select>
        </label>
        <p className="org-access-label">Access</p>
        <label className="org-check">
          <input type="checkbox" checked disabled readOnly />
          Assigned cases only
        </label>
        <label className="org-check">
          <input type="checkbox" checked={photos} onChange={(event) => setPhotos(event.target.checked)} />
          Case photos
        </label>
        <label className="org-check">
          <input type="checkbox" checked={location} onChange={(event) => setLocation(event.target.checked)} />
          Location
        </label>
        <label className="org-check">
          <input type="checkbox" checked={contact} onChange={(event) => setContact(event.target.checked)} />
          Contact citizen
        </label>
        {message ? <p className="pin-note">{message}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </form>
    </div>
  )
}

export function PartnersPage() {
  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Partners</h1>
      </header>
      <div className="org-page-body">
        {PARTNERS.map((item) => (
          <div key={item.name} className="org-row">
            <strong>{item.name}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OrgReportsPage() {
  const er = useEarthRelay()
  const open = er.cases.filter((item) => item.status !== 'resolved')
  const high = open.filter((item) => (item.report?.priority || item.priority) === 'HIGH')
  const assigned = open.filter((item) => item.assignment)

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Reports</h1>
      </header>
      <div className="org-page-body">
        <p>
          <strong>{open.length}</strong> open cases
        </p>
        <p>
          <strong>{high.length}</strong> high priority
        </p>
        <p>
          <strong>{assigned.length}</strong> with a field assignment
        </p>
        <p>
          <strong>{er.cases.filter((item) => item.status === 'resolved').length}</strong> closed
        </p>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const [name, setName] = useState('')
  const [photos, setPhotos] = useState(true)
  const [location, setLocation] = useState(true)
  const [contact, setContact] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchOrg()
      .then((org) => {
        setName(org.name || '')
        setPhotos(Boolean(org.access_defaults?.photos))
        setLocation(Boolean(org.access_defaults?.location))
        setContact(Boolean(org.access_defaults?.contact_citizen))
      })
      .catch((err) => setMessage(err.message))
  }, [])

  async function save(event) {
    event.preventDefault()
    try {
      await updateOrg({
        name,
        access_defaults: { assigned_only: true, photos, location, contact_citizen: contact },
      })
      setMessage('Saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Settings</h1>
      </header>
      <form className="org-page-body org-form" onSubmit={save}>
        <label>
          Organization name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="org-access-label">Default volunteer access</p>
        <label className="org-check">
          <input type="checkbox" checked={photos} onChange={(event) => setPhotos(event.target.checked)} />
          Case photos
        </label>
        <label className="org-check">
          <input type="checkbox" checked={location} onChange={(event) => setLocation(event.target.checked)} />
          Location
        </label>
        <label className="org-check">
          <input type="checkbox" checked={contact} onChange={(event) => setContact(event.target.checked)} />
          Contact citizen
        </label>
        {message ? <p className="pin-note">{message}</p> : null}
        <button className="ghost-btn page-cta" type="submit">
          Save
        </button>
      </form>
    </div>
  )
}
