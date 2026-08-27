import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import HazardMap from './HazardMap.jsx'
import { fetchNearby } from './api.js'
import { displayCaseId, incidentTypeLabel, reporterDisplayName, reporterMention, useEarthRelay } from './context.jsx'
import { NearbyPlaces } from './LocationPrompt.jsx'
import {
  CALL_LOG,
  STATUS_LABELS,
  VISIT_LOG,
  forwardSentence,
  needsSafety,
  noticeCopy,
} from './routing.js'

function incidentLabel(id) {
  return incidentTypeLabel(id)
}

function formatWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function callLabel(result) {
  return CALL_LOG.find(([id]) => id === result)?.[1] || result
}

export function SafetyPage() {
  const navigate = useNavigate()
  const er = useEarthRelay()
  const notice = noticeCopy(er.incidentType)

  useEffect(() => {
    if (!er.incidentType) navigate('/confirm', { replace: true })
  }, [er.incidentType, navigate])

  if (er.role === 'ngo') return <Navigate to="/app" replace />
  if (!er.incidentType) return null

  return (
    <div className="page-screen who-followup">
      <p className="kicker">{notice.kicker}</p>
      <h1>{notice.title}</h1>
      <p className="page-lead">{notice.lead}</p>
      <p className="pin-note">
        {notice.kind === 'review'
          ? 'The filed type and safety instructions are taken from the photo after you submit.'
          : 'If people are in immediate danger, contact local emergency services first. The case is not filed until you confirm.'}
      </p>
      <Link className="ghost-btn page-cta" to="/confirm">
        {notice.kind === 'extreme' ? 'I understand — continue' : 'Continue'}
      </Link>
      <Link className="pin-note" to="/who">
        Back
      </Link>
    </div>
  )
}

export function ConfirmPage() {
  const navigate = useNavigate()
  const er = useEarthRelay()
  const [preview, setPreview] = useState('')
  const [localError, setLocalError] = useState('')
  const typeLabel = incidentLabel(er.incidentType)
  const pin = er.pin

  useEffect(() => {
    if (!er.file) {
      setPreview('')
      return undefined
    }
    const url = URL.createObjectURL(er.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [er.file])

  async function submit() {
    setLocalError('')
    if (!er.file) {
      setLocalError('Add a site photo first.')
      return
    }
    const created = await er.handleUpload({
      firstName: er.firstName,
      lastName: er.lastName,
      phone: er.phone,
      role: 'citizen',
      locationSource: pin?.accuracy != null ? 'gps' : pin ? 'map_pin' : '',
    })
    if (!created?.id) {
      setLocalError(er.error || 'Could not submit.')
      return
    }
    navigate(`/case/${created.id}/alert`)
  }

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <p className="kicker">EarthRelay</p>
          <h1>Confirm report</h1>
        </div>
        <Link className="ghost-btn" to={needsSafety(er.incidentType) ? '/safety' : '/who'}>
          Back
        </Link>
      </header>
      {pin && (
        <div className="confirm-map">
          <HazardMap
            geojson={er.payload?.geojson}
            satellite={er.payload?.satellite}
            layers={er.layers}
            selectedId={null}
            onSelect={() => {}}
            onInspect={() => {}}
            placeTarget={er.placeTarget}
            autoLocate={false}
          />
        </div>
      )}
      <div className="page-body">
        <p className="pin-note">Check these details, then submit. The case is not filed until you confirm.</p>
        {preview && <img className="who-preview" src={preview} alt="Site photo to submit" />}
        {er.file && (
          <p className="pin-note">
            Submitting {er.file.name} ({Math.max(1, Math.round(er.file.size / 1024))} KB)
          </p>
        )}
        <div className="report-block">
          <h4>Name</h4>
          <p>
            {`${er.firstName} ${er.lastName}`.trim() || '—'}
          </p>
        </div>
        <div className="report-block">
          <h4>Phone</h4>
          <p>{er.phone ? er.phone : 'Not provided'}</p>
          {!er.phone && (
            <p className="pin-note">Optional. Responders can still follow up from the NGO inbox.</p>
          )}
        </div>
        <div className="report-block">
          <h4>Incident type</h4>
          <p>{er.incidentType ? typeLabel : 'Not selected'}</p>
          <p className="pin-note">
            This is what you selected. It is not the filed type yet. After submit, the photograph decides the
            category staff see in the inbox.
          </p>
        </div>
        <div className="report-block">
          <h4>GPS</h4>
          <p>
            {pin
              ? `${Number(pin.lat).toFixed(5)}, ${Number(pin.lng).toFixed(5)}${
                  pin.accuracy != null ? ` (±${Math.round(pin.accuracy)} m)` : ''
                }`
              : 'No pin yet. Go back and allow GPS or tap the map.'}
          </p>
        </div>
        {er.notes?.trim() && (
          <div className="report-block">
            <h4>Notes</h4>
            <p>{er.notes.trim()}</p>
          </div>
        )}
        {(localError || er.error) && <p className="banner">{localError || er.error}</p>}
        {er.uploading && (
          <p className="pin-note">Reading the photo for type and severity. This can take about 30 seconds to a minute.</p>
        )}
        <button type="button" className="ghost-btn page-cta" onClick={submit} disabled={er.uploading}>
          {er.uploading ? 'Reading the photograph…' : 'Submit report'}
        </button>
      </div>
    </div>
  )
}

export function ReportsPage() {
  const er = useEarthRelay()
  return <Navigate to={er.role === 'ngo' ? '/app' : '/who'} replace />
}

export function DispatchBrief() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
  }, [caseId])

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading…</p>
        <Link to="/app">Back</Link>
      </div>
    )
  }

  const acc = caseFile.location_accuracy_m
  const lastCall = caseFile.last_call_result
    ? `${callLabel(caseFile.last_call_result)}${caseFile.last_call_at ? ` · ${formatWhen(caseFile.last_call_at)}` : ''}`
    : 'No call logged yet'

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <p className="kicker">Dispatch brief</p>
          <h1>Before the map</h1>
        </div>
        <Link className="ghost-btn" to={`/case/${caseId}`}>
          Case
        </Link>
      </header>
      <div className="page-body">
        <div className="report-block">
          <h4>Who filed it</h4>
          <p>{reporterDisplayName(caseFile)}</p>
          <p className="pin-note">{caseFile.phone || 'No phone on file'}</p>
        </div>
        {reporterMention(caseFile.notes) && (
          <div className="report-block">
            <h4>The reporter also mentioned</h4>
            <p>{caseFile.notes}</p>
          </div>
        )}
        <div className="report-block">
          <h4>Address</h4>
          <p>{caseFile.address || 'No street address yet'}</p>
          {(caseFile.location_parts?.road || caseFile.location_parts?.area || caseFile.location_parts?.city) && (
            <p className="pin-note">
              {[
                caseFile.location_parts.road,
                caseFile.location_parts.area,
                caseFile.location_parts.city,
                caseFile.location_parts.state,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <NearbyPlaces places={caseFile.nearby} />
        </div>
        <div className="report-block">
          <h4>GPS</h4>
          <p>
            {caseFile.lat != null
              ? `${Number(caseFile.lat).toFixed(5)}, ${Number(caseFile.lng).toFixed(5)}${
                  acc != null ? ` (±${Math.round(acc)} m)` : ''
                }`
              : 'No GPS yet'}
          </p>
          <p className="pin-note">{caseFile.location_source === 'gps' ? 'Source: GPS' : caseFile.lat != null ? 'Source: map pin' : ''}</p>
        </div>
        <div className="report-block">
          <h4>Last call</h4>
          <p>{lastCall}</p>
        </div>
        <p className="forward-note">{forwardSentence(caseFile.incident_type)}</p>
        <Link className="ghost-btn page-cta" to={`/case/${caseId}/contact`}>
          Open map
        </Link>
        <Link className="ghost-btn" to={`/case/${caseId}/log`}>
          Log a call or visit
        </Link>
      </div>
    </div>
  )
}

export function ActivityLog() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
  }, [caseId])

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading…</p>
        <Link to="/app">Back</Link>
      </div>
    )
  }

  async function log(kind, result) {
    setMessage('')
    await er.handleActivity(caseId, { kind, result })
    setMessage('Saved.')
  }

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <h1>After call / visit</h1>
          <p className="kicker">CASE #{displayCaseId(caseFile)}</p>
        </div>
        <Link className="ghost-btn" to={`/case/${caseId}`}>
          Case
        </Link>
      </header>
      <div className="page-body">
        <p className="page-lead">Record the call or visit. Investigating and Cleanup are set on the case.</p>
        <h4>Call</h4>
        <div className="status-row">
          {CALL_LOG.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ghost-btn${caseFile.last_call_result === id ? ' is-current' : ''}`}
              onClick={() => log('call', id)}
            >
              {label}
            </button>
          ))}
        </div>
        {caseFile.phone && (
          <a className="ghost-btn" href={`tel:${caseFile.phone}`}>
            Call {caseFile.phone}
          </a>
        )}
        <h4>Visit</h4>
        <div className="status-row">
          {VISIT_LOG.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ghost-btn${(caseFile.activity || []).some((item) => item.result === id) ? ' is-current' : ''}`}
              onClick={() => log('visit', id)}
            >
              {label}
            </button>
          ))}
        </div>
        {message && <p className="pin-note">{message}</p>}
        <h4>Log</h4>
        {(caseFile.activity || []).length === 0 && <p className="empty">Nothing logged yet.</p>}
        <ul className="flow-log">
          {[...(caseFile.activity || [])].reverse().map((item, index) => (
            <li key={`${item.at}-${index}`}>
              <strong>{item.label || item.result}</strong>
              <span>
                {item.by ? `${item.by} · ` : ''}
                {formatWhen(item.at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function NearbyCases() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const er = useEarthRelay()
  const [nearby, setNearby] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
    let cancelled = false
    fetchNearby(caseId, 1000)
      .then((payload) => {
        if (!cancelled) setNearby(payload.cases || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load nearby cases.')
      })
    return () => {
      cancelled = true
    }
  }, [caseId])

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <p className="kicker">Duplicates</p>
          <h1>Nearby cases</h1>
        </div>
        <Link className="ghost-btn" to={`/case/${caseId}/contact`}>
          Map
        </Link>
      </header>
      <div className="page-body">
        <p className="pin-note">
          Other reports of this same incident type within about 1 km. A flood is not grouped with a
          fire nearby.
        </p>
        {error && <p className="banner">{error}</p>}
        {nearby.length === 0 && !error && <p className="empty">No other cases within 1 km.</p>}
        <div className="event-list">
          {nearby.map((item) => (
            <button
              key={item.id}
              type="button"
              className="event-card case"
              onClick={() => navigate(`/case/${item.id}`)}
            >
              <span className="event-type">
                {item.distance_m} m · {STATUS_LABELS[item.status] || item.status}
              </span>
              <strong>{item.title}</strong>
              <small>{incidentLabel(item.incident_type)}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function WhatHappensNext({ caseFile }) {
  const notice = noticeCopy(caseFile?.incident_type, caseFile?.report)
  const stayBack = notice.kind === 'extreme'

  return (
    <div className="page-screen who-followup">
      <p className="kicker">EarthRelay</p>
      <h1>We have your report</h1>
      <p className="page-lead">
        {stayBack ? `${notice.lead} ` : ''}
        This case is now in the inbox. The organization will follow up from there.
        {stayBack ? ' Keep your phone on.' : ''}
      </p>
      <Link className="ghost-btn page-cta" to="/who">
        File another report
      </Link>
      <Link className="pin-note" to="/">
        Home
      </Link>
    </div>
  )
}
