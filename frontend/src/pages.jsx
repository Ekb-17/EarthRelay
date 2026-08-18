import { Link, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import CaseReport, { HelpDispatch } from './CaseReport.jsx'
import HazardMap from './HazardMap.jsx'
import LocationPrompt, { useGpsGate } from './LocationPrompt.jsx'
import { isElevated, useEarthRelay } from './context.jsx'

export function Landing() {
  const er = useEarthRelay()
  return (
    <div className="landing-hero">
      <div className="landing-map">
        <HazardMap
          geojson={er.payload?.geojson}
          satellite={er.payload?.satellite}
          layers={er.layers}
          selectedId={null}
          onSelect={() => {}}
          onInspect={() => {}}
        />
      </div>
      <div className="landing-card">
        <p className="kicker">EarthRelay</p>
        <h1>Environmental case intelligence</h1>
        <p className="page-lead">
          Detect, investigate, and dispatch help from a field photo — for citizens and response teams.
        </p>
        <Link className="ghost-btn page-cta" to="/who">
          Get started
        </Link>
      </div>
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
        <Link className="ghost-btn" to={er.role === 'ngo' ? '/app' : '/who'}>
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
            Continue
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
  const isNgo = er.role === 'ngo'

  return (
    <div className="page-screen who-followup">
      <p className="kicker">{isNgo ? 'Inbox' : 'Help is on the way'}</p>
      <h1>{isNgo ? 'Take this case' : 'We will call you'}</h1>
      <p className="page-lead">
        Priority {priority}
        {severity != null ? ` · ${severity}/10` : ''}.
        {isNgo
          ? ' A citizen filed this report. Take it, then call or open the dispatch map.'
          : ' A response team is investigating. The organization may call you on the number you entered.'}
      </p>
      {isNgo ? (
        <>
          <button
            type="button"
            className="ghost-btn page-cta"
            onClick={() => er.handleClaim(caseId, er.reporterName)}
          >
            Take it
          </button>
          {caseFile?.phone && (
            <a className="ghost-btn page-cta" href={`tel:${caseFile.phone}`}>
              Call {caseFile.phone}
            </a>
          )}
          <Link className="ghost-btn" to={`/case/${caseId}/contact`}>
            Dispatch map
          </Link>
        </>
      ) : (
        <p className="pin-note">Keep your phone on. You can go back to the report any time.</p>
      )}
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
