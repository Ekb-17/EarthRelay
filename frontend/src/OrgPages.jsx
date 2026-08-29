import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { displayCaseId, hasIncidentPhoto, useEarthRelay } from './context.jsx'
import { formatCapabilities } from './Community.jsx'
import { copyText, StaffRecordCards } from './Staff.jsx'
import {
  fetchHelpline,
  fetchOrg,
  fetchStaff,
  allotStaff,
  setStaffPassword,
  fetchVolunteers,
  inviteVolunteer,
  updateOrg,
  setOrgRecovery,
  changeOrgPassword,
  updateVolunteer,
  setVolunteerPassword,
  deleteVolunteer,
  deleteStaff,
} from './api.js'
import { UndoToast, useTimedDelete } from './UndoBar.jsx'
import { PasswordField } from './OrgAuth.jsx'

const PARTNERS = [
  {
    name: 'Green Valley Volunteers',
    detail: 'Cleanup, dump pickup, and field assessment',
  },
  {
    name: 'Community Cleanup Team',
    detail: 'Debris removal, cleanup, and dump pickup',
  },
  {
    name: 'Local Relief Group',
    detail: 'Supplies delivery and community outreach',
  },
]

export function ActiveResponses() {
  const er = useEarthRelay()
  const assigned = er.cases.filter(
    (item) => item.assignment && item.status !== 'resolved' && hasIncidentPhoto(item),
  )

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
  const [message, setMessage] = useState('')
  const [passwordFor, setPasswordFor] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const trash = useTimedDelete(async (item) => {
    await deleteVolunteer(item.id)
    await load()
  })

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

  async function savePassword(event) {
    event.preventDefault()
    if (!passwordFor) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await setVolunteerPassword(passwordFor.id, newPassword)
      setMessage(`Password set for ${passwordFor.name}. Tell them this temporary password. After they sign in, they choose their own.`)
      setPasswordFor(null)
      setNewPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rows = (payload?.volunteers || []).filter((row) => !trash.isPending(row.id))
  const pendingRows = rows.filter((row) => row.status === 'pending' || row.status === 'invited')
  const rosterRows = rows.filter((row) => row.status !== 'pending' && row.status !== 'invited')

  function VolunteerCard({ row, pending }) {
    const areas = formatCapabilities(row.capabilities)
    const canSetPassword = row.status === 'active' || row.status === 'invited'
    return (
      <div className="org-row">
        <strong>{row.name}</strong>
        <span>
          {row.phone ? `${row.phone} · ` : ''}
          {row.email} · {row.status}
          {areas ? ` · ${areas}` : ''}
          {row.organization ? ` · ${row.organization}` : ''}
        </span>
        <div className="org-row-actions">
          {pending ? (
            <>
              <button type="button" className="ghost-btn page-cta" onClick={() => setStatus(row.id, 'active')}>
                Approve
              </button>
              <button type="button" className="ghost-btn" onClick={() => setStatus(row.id, 'declined')}>
                Decline
              </button>
            </>
          ) : null}
          {row.status === 'declined' ? (
            <button type="button" className="ghost-btn page-cta" onClick={() => setStatus(row.id, 'pending')}>
              Move to waiting
            </button>
          ) : null}
          {canSetPassword ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setPasswordFor(row)
                setNewPassword('')
                setMessage('')
                setError('')
              }}
            >
              Set password
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => trash.requestDelete(row, row.name)}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

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
        {message ? <p className="pin-note">{message}</p> : null}
        <p className="pin-note">
          People who join from Community land here. Approve them onto the roster, or decline.
          If someone forgets their password, use Set password and tell them that temporary
          password. They sign in with it, then choose their own. Same idea as Staff IDs. Same list
          on phone and laptop.
        </p>
        {passwordFor ? (
          <form className="org-form" onSubmit={savePassword}>
            <p className="org-access-label">Temporary password for {passwordFor.name}</p>
            <p className="pin-note">{passwordFor.email}. They must replace this after they sign in.</p>
            <label>
              New password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <div className="org-row-actions">
              <button className="ghost-btn page-cta" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save password'}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setPasswordFor(null)
                  setNewPassword('')
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {pendingRows.length ? (
          <>
            <p className="org-access-label">Waiting for approval</p>
            {pendingRows.map((row) => (
              <VolunteerCard key={row.id} row={row} pending />
            ))}
          </>
        ) : (
          <p className="org-access-label">Waiting for approval</p>
        )}
        {!pendingRows.length ? <p className="pin-note">No join requests waiting.</p> : null}
        <p className="org-access-label">Roster</p>
        {rosterRows.length === 0 ? <p className="pin-note">No approved volunteers yet.</p> : null}
        {rosterRows.map((row) => (
          <VolunteerCard key={row.id} row={row} pending={false} />
        ))}
        <UndoToast pending={trash.pending} onUndo={trash.undo} />
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
        <h1>Invite</h1>
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
        <p className="pin-note">
          Approve or decline people who already joined on the{' '}
          <Link to="/app/volunteers">Volunteers</Link> page.
        </p>
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
        <p className="pin-note">Partner groups that support EarthRelay field work.</p>
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

export function HelplinePage() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchHelpline()
      .then(setPayload)
      .catch((err) => setError(err.message))
  }, [])

  const lines = payload?.lines || []

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Helpline</h1>
      </header>
      <div className="org-page-body">
        <p className="pin-note">
          {payload?.lead ||
            'Call the desk that matches the incident. These numbers reach EarthRelay response teams for that hazard.'}
        </p>
        {error ? <p className="error-banner">{error}</p> : null}
        {lines.map((line) => (
          <div key={line.id} className="org-row">
            <strong>{line.name}</strong>
            <span>{line.phone}</span>
            <span className="pin-note">{(line.categories || []).join(' · ')}</span>
            <span className="pin-note">{line.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StaffPage() {
  const er = useEarthRelay()
  const navigate = useNavigate()
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('case_officer')
  const [desk, setDesk] = useState('general')
  const [salary, setSalary] = useState('285')
  const [password, setPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const trash = useTimedDelete(async (item) => {
    await deleteStaff(item.cms_id)
    if (selectedId === item.cms_id) setSelectedId('')
    await load()
  })

  async function load() {
    try {
      const data = await fetchStaff()
      setPayload(data)
      setError('')
      return data
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function allot(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const row = await allotStaff({
        name,
        phone,
        email,
        role,
        desk,
        salary_usd: Number(salary) || 0,
        password,
      })
      setMessage(
        `Allotted ${row.cms_id} to ${row.name}. Give that Staff ID and this temporary password to the employee. They sign in on the staff screen, then choose their own password — they cannot open this organization desk.`,
      )
      setName('')
      setPhone('')
      setEmail('')
      setPassword('')
      setSelectedId(row.cms_id)
      await load()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function copyId(value) {
    const ok = await copyText(value)
    if (!ok) return
    setCopied(value)
    window.setTimeout(() => setCopied(''), 1600)
  }

  async function savePassword(event) {
    event.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setMessage('')
    try {
      await setStaffPassword(selectedId, resetPassword)
      setMessage(`Temporary password set for ${selectedId}. The employee signs in with it, then chooses their own.`)
      setResetPassword('')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rows = (payload?.staff || []).filter((row) => !trash.isPending(row.cms_id))
  const roles = payload?.roles || {}
  const desks = payload?.desks || {}
  const selected = rows.find((row) => row.cms_id === selectedId) || null

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Staff IDs</h1>
        <Link className="ghost-btn" to="/staff/signin">
          Staff sign-in screen
        </Link>
      </header>
      <div className="org-page-body">
        <p className="pin-note">
          Allot Staff IDs here. Sign-in uses an allotted ID from the list below — not the next ID
          waiting to be saved. The organization can open that employee’s staff screen from this
          page. Employees cannot open this organization desk.
        </p>

        <form className="org-form cms-allot" onSubmit={allot}>
          <p className="org-access-label">Next ID to allot</p>
          <p className="cms-next">{payload?.next_cms_id || '—'}</p>
          <p className="pin-note">This ID cannot be used for sign-in until you allot it below.</p>
          <label>
            Name
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Phone
            <input
              type="tel"
              required
              inputMode="tel"
              placeholder="+92… or 03… or any country"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label>
            Email <em className="who-optional">optional</em>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {Object.entries(roles).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desk
            <select value={desk} onChange={(event) => setDesk(event.target.value)}>
              {Object.entries(desks).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monthly salary (USD)
            <input
              type="number"
              min="0"
              required
              value={salary}
              onChange={(event) => setSalary(event.target.value)}
            />
          </label>
          <label>
            Temporary password for this Staff ID
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <p className="pin-note">The employee signs in with this once, then chooses their own password.</p>
          {message ? <p className="pin-note">{message}</p> : null}
          <button className="ghost-btn page-cta" type="submit" disabled={busy}>
            {busy ? 'Saving…' : `Allot ${payload?.next_cms_id || 'Staff ID'}`}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}

        <p className="org-access-label">Allotted Staff IDs</p>
        {rows.length === 0 ? <p className="pin-note">No Staff IDs allotted yet.</p> : null}
        {rows.map((row) => (
          <div
            key={row.id}
            className={`org-row cms-row${selectedId === row.cms_id ? ' is-selected' : ''}`}
          >
            <button type="button" className="cms-row-main" onClick={() => setSelectedId(row.cms_id)}>
              <strong>
                {row.cms_id} · {row.name}
              </strong>
              <span>
                {row.role_label} · {row.desk_label} · {row.status}
              </span>
            </button>
            <div className="org-row-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => copyId(row.cms_id)}
              >
                {copied === row.cms_id ? 'Copied' : 'Copy ID'}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => trash.requestDelete(row, row.cms_id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {selected ? (
          <div className="cms-file">
            <p className="org-access-label">Employee file · {selected.cms_id}</p>
            <p className="pin-note">
              Set a temporary password here. The employee signs in with {selected.cms_id}, then
              chooses their own. Or open their staff screen from this desk.
            </p>
            <div className="org-row-actions">
              <button
                type="button"
                className="ghost-btn page-cta"
                onClick={() => {
                  sessionStorage.setItem('er-staff-from-org', '1')
                  er.setStaff(selected)
                  navigate('/staff')
                }}
              >
                Open staff screen
              </button>
            </div>
            <form className="org-form" onSubmit={savePassword}>
              <label>
                Set temporary password for {selected.cms_id}
                <input
                  type="text"
                  required
                  minLength={8}
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                />
              </label>
              <button className="ghost-btn" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save password'}
              </button>
            </form>
            <StaffRecordCards person={selected} heading="" />
          </div>
        ) : (
          <p className="pin-note">Select a Staff ID to open that employee file.</p>
        )}
        <UndoToast pending={trash.pending} onUndo={trash.undo} />
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
  const er = useEarthRelay()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [photos, setPhotos] = useState(true)
  const [location, setLocation] = useState(true)
  const [contact, setContact] = useState(false)
  const [emailHint, setEmailHint] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [orgReady, setOrgReady] = useState(false)

  function applyOrg(org) {
    setName(org.name || '')
    setUsername(org.username || '')
    setPhotos(Boolean(org.access_defaults?.photos))
    setLocation(Boolean(org.access_defaults?.location))
    setContact(Boolean(org.access_defaults?.contact_citizen))
    setEmailHint(org.recovery_email_hint || '')
  }

  function syncRecoveryFlag(org) {
    if (!org?.has_recovery_email) return
    er.setOrgAuth({ ...(er.orgAuth || {}), ...org, has_recovery_email: true })
  }

  useEffect(() => {
    fetchOrg()
      .then((org) => {
        applyOrg(org)
        syncRecoveryFlag(org)
        setOrgReady(true)
      })
      .catch((err) => {
        setMessage(err.message)
        setOrgReady(true)
      })
  }, [])

  async function save(event) {
    event.preventDefault()
    setMessage('')
    try {
      const org = await updateOrg({
        name,
        access_defaults: { assigned_only: true, photos, location, contact_citizen: contact },
      })
      applyOrg(org)
      setMessage('Saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function saveRecovery(event) {
    event.preventDefault()
    setMessage('')
    try {
      const org = await setOrgRecovery({
        username,
        password: recoveryPassword,
        email: recoveryEmail,
      })
      applyOrg(org)
      er.setOrgAuth({ ...(er.orgAuth || {}), ...org, has_recovery_email: true })
      setRecoveryEmail('')
      setRecoveryPassword('')
      setMessage('Recovery email saved.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setMessage('')
    if (newPassword !== confirmPassword) {
      setMessage('New password and confirmation do not match.')
      return
    }
    try {
      await changeOrgPassword({
        username,
        password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Settings</h1>
      </header>
      {message ? <p className="org-page-body pin-note">{message}</p> : null}
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
        <button className="ghost-btn page-cta" type="submit">
          Save
        </button>
      </form>
      <form className="org-page-body org-form" onSubmit={saveRecovery}>
        <p className="org-access-label">Recovery email</p>
        <p className="pin-note">
          {emailHint
            ? `On file: ${emailHint}. Used to send a verification code if the password is forgotten.`
            : 'None on file yet. Add one so the desk can be recovered without the current password.'}
        </p>
        <label>
          New recovery email
          <input
            type="email"
            required
            autoComplete="email"
            value={recoveryEmail}
            onChange={(event) => setRecoveryEmail(event.target.value)}
          />
        </label>
        <PasswordField
          label="Current password"
          value={recoveryPassword}
          onChange={setRecoveryPassword}
          autoComplete="current-password"
        />
        <button className="ghost-btn page-cta" type="submit" disabled={!orgReady || !username}>
          Save recovery email
        </button>
      </form>
      <form className="org-page-body org-form" onSubmit={savePassword}>
        <p className="org-access-label">Change password</p>
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />
        <button className="ghost-btn page-cta" type="submit" disabled={!orgReady || !username}>
          Update password
        </button>
      </form>
    </div>
  )
}
