import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { displayCaseId, incidentTypeLabel, useEarthRelay } from './context.jsx'
import { assignResponse, fetchVolunteers } from './api.js'
import { formatCapabilities } from './Community.jsx'
import { STATUS_LABELS, responseTeam, staffDeskLabel } from './routing.js'

const NEED_CAPS = {
  cleanup: 'cleanup',
  field_assessment: 'field_assessment',
  supplies: 'supplies',
  community: 'community',
}

const NEED_ALIASES = {
  site_assessment: 'field_assessment',
  debris_cleanup: 'cleanup',
  wildlife_assistance: 'field_assessment',
  community_support: 'community',
  emergency_response: 'cleanup',
}

function normalizeNeed(need) {
  if (!need) return 'cleanup'
  if (NEED_CAPS[need]) return need
  return NEED_ALIASES[need] || 'cleanup'
}

function matchesNeed(row, need) {
  const cap = NEED_CAPS[need]
  if (!cap) return false
  return (row.capabilities || []).includes(cap)
}

function sortPeopleForNeed(people, need) {
  const matching = []
  const rest = []
  for (const row of people) {
    if (matchesNeed(row, need)) matching.push(row)
    else rest.push(row)
  }
  return [...matching, ...rest]
}

function personLabel(row) {
  const caps = formatCapabilities(row.capabilities)
  return caps ? `${row.name} — ${caps}` : row.name
}

export default function AssignResponse() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)
  const [needs, setNeeds] = useState({})
  const [people, setPeople] = useState([])
  const [need, setNeed] = useState(() => normalizeNeed(caseFile?.assignment?.need))
  const [responderId, setResponderId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
  }, [caseId])

  useEffect(() => {
    fetchVolunteers()
      .then((data) => {
        setNeeds(data.needs || {})
        const rows = data.assignable || []
        setPeople(rows)
        setResponderId((current) => current || rows[0]?.id || '')
      })
      .catch((err) => setError(err.message))
  }, [])

  const ranked = sortPeopleForNeed(people, need)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await assignResponse(caseId, {
        need,
        responder_id: responderId,
        assigned_by: er.reporterName || 'EarthRelay Response Team',
      })
      await er.load()
      navigate(`/case/${caseId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading…</p>
        <Link to="/app">Cases</Link>
      </div>
    )
  }

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <div>
          <p className="kicker">CASE #{displayCaseId(caseFile)}</p>
          <h1>Assign Response</h1>
        </div>
      </header>
      <form className="org-page-body org-form" onSubmit={submit}>
        <p>
          {incidentTypeLabel(caseFile.incident_type)} · {caseFile.report?.priority || caseFile.priority}
        </p>
        <p className="org-access-label">What is needed?</p>
        {Object.entries(needs).map(([id, label]) => (
          <label key={id} className="org-check">
            <input type="radio" name="need" checked={need === id} onChange={() => setNeed(id)} />
            {label}
          </label>
        ))}
        <p className="org-access-label">Available responders</p>
        {ranked.map((row) => (
          <label key={row.id} className="org-check">
            <input
              type="radio"
              name="responder"
              checked={responderId === row.id}
              onChange={() => setResponderId(row.id)}
            />
            {personLabel(row)}
          </label>
        ))}
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-btn page-cta" type="submit" disabled={busy || !responderId}>
          {busy ? 'Assigning…' : 'Assign'}
        </button>
        <Link className="pin-note" to={`/case/${caseId}`}>
          Cancel
        </Link>
      </form>
    </div>
  )
}

export function AssignBoard() {
  const er = useEarthRelay()
  const [needs, setNeeds] = useState({})
  const [people, setPeople] = useState([])
  const [choices, setChoices] = useState({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetchVolunteers()
      .then((data) => {
        setNeeds(data.needs || {})
        setPeople(data.assignable || [])
      })
      .catch((err) => setError(err.message))
  }, [])

  const openCases = [...er.cases.filter((item) => item.status !== 'resolved')].sort((a, b) => {
    const aAssigned = a.assignment?.responder_id ? 1 : 0
    const bAssigned = b.assignment?.responder_id ? 1 : 0
    return aAssigned - bAssigned
  })

  function choiceFor(item) {
    const saved = choices[item.id] || {}
    const need = normalizeNeed(saved.need || item.assignment?.need)
    const ranked = sortPeopleForNeed(people, need)
    const responderId = saved.responderId || item.assignment?.responder_id || ranked[0]?.id || ''
    return { need, responderId, ranked }
  }

  function patchChoice(id, patch) {
    setChoices((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), ...patch },
    }))
  }

  async function assign(item) {
    const { need, responderId } = choiceFor(item)
    if (!responderId) return
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      await assignResponse(item.id, {
        need,
        responder_id: responderId,
        assigned_by: er.reporterName || 'EarthRelay Response Team',
      })
      await er.load()
      const person = people.find((row) => row.id === responderId)
      setNotice(`Assigned ${displayCaseId(item)} to ${person?.name || 'a volunteer'}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page-scroll org-page">
      <header className="topbar">
        <h1>Assign</h1>
      </header>
      <div className="org-page-body is-wide">
        <p className="pin-note">
          Pick the work needed and the volunteer for each open case. These options match what
          volunteers pick when they join: Cleanup, Field assessment, Supplies, Community outreach.
          EarthRelay does not send emergency services. A staff desk name on a case is not a volunteer.
        </p>
        {error ? <p className="error-banner">{error}</p> : null}
        {notice ? <p className="pin-note">{notice}</p> : null}
        {openCases.length === 0 ? <p>No open cases to assign.</p> : null}
        {openCases.map((item) => {
          const { need, responderId, ranked } = choiceFor(item)
          const assignment = item.assignment
          return (
            <article key={item.id} className="assign-row">
              <div className="assign-row-meta">
                <Link to={`/case/${item.id}`}>
                  {displayCaseId(item)} · {item.title}
                </Link>
                <span>
                  {incidentTypeLabel(item.incident_type)} · {item.report?.priority || item.priority} ·{' '}
                  {STATUS_LABELS[item.status] || item.status}
                </span>
                <span>
                  {item.routed_label || responseTeam(item.incident_type)} · {staffDeskLabel(item.claimed_by)}
                </span>
                <span>
                  {assignment?.responder_name
                    ? `Assigned to ${assignment.responder_name} · ${assignment.need_label || assignment.need}`
                    : 'No volunteer yet'}
                </span>
              </div>
              <div className="assign-row-controls">
                <label>
                  Need
                  <select value={need} onChange={(event) => patchChoice(item.id, { need: event.target.value })}>
                    {Object.entries(needs).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Volunteer
                  <select
                    value={responderId}
                    onChange={(event) => patchChoice(item.id, { responderId: event.target.value })}
                  >
                    {ranked.length === 0 ? <option value="">No volunteers</option> : null}
                    {ranked.map((row) => (
                      <option key={row.id} value={row.id}>
                        {personLabel(row)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busyId === item.id || !responderId}
                  onClick={() => assign(item)}
                >
                  {busyId === item.id ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
