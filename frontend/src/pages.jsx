import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { Shield, User } from 'lucide-react'
import CaseReport, { HelpDispatch } from './CaseReport.jsx'
import HazardMap from './HazardMap.jsx'
import LocationPrompt, { useGpsGate } from './LocationPrompt.jsx'
import { isElevated, useEarthRelay } from './context.jsx'

export function Landing() {
  return (
    <div className="page-screen">
      <p className="kicker">EarthRelay</p>
      <h1>Environmental case intelligence</h1>
      <p className="page-lead">
        Detect, investigate, and dispatch help from a field photo — for citizens and response teams.
      </p>
      <Link className="ghost-btn page-cta" to="/role">
        Get started
      </Link>
    </div>
  )
}

export function RolePick() {
  const { chooseRole } = useEarthRelay()
  const navigate = useNavigate()

  function pick(role) {
    chooseRole(role)
    navigate('/app')
  }

  return (
    <div className="page-screen">
      <p className="kicker">Choose how you enter</p>
      <h1>Who are you?</h1>
      <p className="page-lead">Tap one. You can switch later from the report screen.</p>
      <div className="role-grid">
        <button type="button" className="role-card" onClick={() => pick('citizen')}>
          <User size={28} />
          <strong>Citizen</strong>
          <small>File a photo. EarthRelay forwards the whole case to the right desk.</small>
        </button>
        <button type="button" className="role-card" onClick={() => pick('ngo')}>
          <Shield size={28} />
          <strong>NGO / admin</strong>
          <small>Open the inbox, take a case, call or dispatch</small>
        </button>
      </div>
      <Link className="pin-note" to="/">
        Back
      </Link>
    </div>
  )
}

export function CaseDetails() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
  }, [caseId])

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading case…</p>
        <Link to="/app">Back to reports</Link>
      </div>
    )
  }

  const elevated = isElevated(caseFile)

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <p className="kicker">Case {caseFile.id}</p>
          <h1>Report details</h1>
        </div>
        <Link className="ghost-btn" to="/app">
          Back
        </Link>
      </header>
      <div className="page-body">
        <CaseReport
          caseFile={caseFile}
          role={er.role}
          onStatus={er.handleStatus}
          onAssign={er.handleAssign}
          onClaim={er.handleClaim}
          deskName={er.reporterName}
        />
        {elevated && (
          <Link className="ghost-btn page-cta" to={`/case/${caseId}/alert`}>
            Continue — severity is above expected
          </Link>
        )}
      </div>
    </div>
  )
}

export function SeverityAlert() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)
  const priority = caseFile?.report?.priority || caseFile?.priority || 'MEDIUM'
  const severity = caseFile?.report?.severity

  return (
    <div className="page-screen">
      <p className="kicker">Dispatch</p>
      <h1>Your severity is above expected</h1>
      <p className="page-lead">
        Priority {priority}
        {severity != null ? ` · ${severity}/10` : ''}. Help is being prepared. Next, send a phone number and live GPS
        so responders can reach you.
      </p>
      <Link className="ghost-btn page-cta" to={`/case/${caseId}/contact`}>
        Enter phone number and GPS
      </Link>
      <Link className="pin-note" to={`/case/${caseId}`}>
        Back to report
      </Link>
    </div>
  )
}

export function ContactPage() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)
  const gps = useGpsGate({
    onFix: ({ lat, lng, accuracy }) => {
      if (!caseId) return
      er.setSelectedId(caseId)
      er.handleContact(
        {
          lat,
          lng,
          location_source: 'gps',
          location_accuracy_m: accuracy,
        },
        caseId,
      )
    },
  })

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

  return (
    <div className="app-shell contact-shell">
      <LocationPrompt gps={gps} />
      <header className="topbar">
        <div>
          <p className="kicker">Help is being sent</p>
          <h1>Phone and GPS</h1>
        </div>
        <Link className="ghost-btn" to={`/case/${caseId}`}>
          Report
        </Link>
      </header>
      <aside className="sidebar">
        <HelpDispatch
          caseFile={caseFile}
          gps={gps}
          onContact={(fields) => {
            er.setSelectedId(caseId)
            return er.handleContact(fields, caseId)
          }}
        />
      </aside>
      <main className="map-stage">
        <HazardMap
          geojson={er.payload?.geojson}
          satellite={er.payload?.satellite}
          layers={er.layers}
          selectedId={caseId}
          onSelect={() => {}}
          onInspect={er.handleInspect}
          placeTarget={er.placeTarget}
        />
      </main>
    </div>
  )
}
