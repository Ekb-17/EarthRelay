import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Ellipsis, CircleHelp, Info, Users } from 'lucide-react'
import CaseReport, { HelpDispatch } from './CaseReport.jsx'
import HazardMap from './HazardMap.jsx'
import LocationPrompt, { useGpsGate } from './LocationPrompt.jsx'
import { WhatHappensNext } from './FlowPages.jsx'
import { displayCaseId, useEarthRelay } from './context.jsx'
import { deleteCase } from './api.js'
import { STATUS_LABELS, staffDeskName } from './routing.js'
import { UndoToast, useTimedDelete } from './UndoBar.jsx'

function InfoPage({ title, children }) {
  return (
    <div className="page-scroll info-page">
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">EarthRelay</p>
          <h1>{title}</h1>
        </div>
        <Link className="ghost-btn" to="/">
          Back
        </Link>
      </header>
      <article className="info-article">{children}</article>
    </div>
  )
}

export function HelpPage() {
  return (
    <InfoPage title="Help">
      <section>
        <h2>Stay at a safe distance</h2>
        <p>
          EarthRelay is for documenting an environmental incident from a place that is already
          safe. Take the photograph without walking closer. Do not enter floodwater, smoke, fire,
          oil, chemical runoff, collapsed ground, or any area that looks unstable.
        </p>
        <p>
          If people are trapped, injured, or in immediate danger, contact local emergency services
          first. This application files an environmental case for the organization to review. It
          does not replace 112 or other emergency response.
        </p>
      </section>
      <section>
        <h2>How to file a report</h2>
        <p>
          On the landing page, tap Get started. You will add a photograph, a location pin, and a
          first name. Last name, phone, incident type, and notes are optional. A first name is
          required so the organization knows who filed the report.
        </p>
        <p>
          You do not create an account to report. When the case is sent, you receive a short
          confirmation. You do not manage the case after that.
        </p>
      </section>
      <section>
        <h2>Allow location</h2>
        <p>
          When the browser asks for location, allow it. The pin is how the case is placed on the
          map so the organization can find the site. Without a location, the report cannot be
          investigated as a field case.
        </p>
        <p>
          After you send the report, the street address is not shown back to you. Location detail
          is kept with the case file for follow-up, not displayed on the citizen receipt.
        </p>
      </section>
      <section>
        <h2>Photo, type, and notes</h2>
        <p>
          Open the camera or choose a photograph from your gallery. A clear, recent image of the
          scene is the main evidence. Photograph the incident itself, not a screenshot or an
          unrelated indoor picture.
        </p>
        <p>
          Choose a type if you know it — waste, sewage, wildlife, erosion, flood, fire, collapse,
          or similar. If you are unsure, send the photograph anyway; the type can be resolved from
          the image. Notes are optional. Anything you write is attached to the case and passed to
          the organization.
        </p>
      </section>
      <section>
        <h2>After you send the report</h2>
        <p>
          You receive a short confirmation that the report was filed. You do not see the
          investigation file, nearby cases, or dispatch. Those remain with the organization.
        </p>
        <p>
          The organization reviews the case, may take it onto a desk, and may assign a field
          volunteer a task. When the work is finished, they close the case. You can file another
          report from the same device if you observe a separate incident. For serious incidents,
          keep your phone available if you left a number.
        </p>
      </section>
      <section>
        <h2>Community volunteers</h2>
        <p>
          People who help in the field join through Community Response from the landing menu. Join
          with a name, email, phone, and password, or sign in with those details if you already
          belong to an organization.
        </p>
        <p>
          Volunteers only see tasks assigned to them. Each task includes a map pin, an area name,
          and the street address for the site. Volunteers do not receive the reporter’s name or
          phone. Field work may include cleanup, field assessment, supplies, or community
          outreach, depending on what the organization asked for.
        </p>
      </section>
      <section>
        <h2>What you will not see</h2>
        <p>
          The public site does not show other people’s reports, investigation notes, or how a
          case is scored. It also does not show organization desks, internal phone lists, or
          employment records. Those stay with the organization.
        </p>
      </section>
      <h2 className="info-faq-title">FAQ</h2>
      <div className="info-faq">
        <section>
          <h2>Do I need an account?</h2>
          <p>
            No. Reports are filed from the public site. You do not sign in, and you do not manage
            the case after it is sent. Volunteers who help in the field do sign in through
            Community Response.
          </p>
        </section>
        <section>
          <h2>How do I start a report?</h2>
          <p>
            On the landing page, tap Get started. That opens the incident photo, type, and your
            details. A first name is required to continue.
          </p>
        </section>
        <section>
          <h2>What if I deny location or GPS fails?</h2>
          <p>
            Allow location when the browser asks, or tap try again if the pin does not appear. The
            case needs a pin on the map. Without it, the organization cannot treat the report as a
            field case.
          </p>
        </section>
        <section>
          <h2>Is a phone number required?</h2>
          <p>
            No. Last name and phone are optional. If the organization needs to follow up, they may
            use the phone you entered.
          </p>
        </section>
        <section>
          <h2>Who can see my report?</h2>
          <p>
            The organization. Other citizens do not see your case file, your address, or your
            photo. Volunteers assigned to the site see a map pin, area, and street address, not your
            name or phone.
            You only see the short confirmation after you send it.
          </p>
        </section>
        <section>
          <h2>Can I join as a volunteer?</h2>
          <p>
            Yes. Open Community from the menu. Request access with an email, phone, and password,
            or sign in with those details. Volunteers only see field tasks assigned to them.
          </p>
        </section>
        <section>
          <h2>Does EarthRelay send emergency services?</h2>
          <p>
            No. If someone is in immediate danger, call local emergency numbers first. EarthRelay
            files an environmental case. It does not dispatch police, fire, or ambulance.
          </p>
        </section>
        <section>
          <h2>Can I file more than one report?</h2>
          <p>
            Yes. File a new report for a separate incident, or if conditions at the same place
            have changed and it is still safe to photograph from a distance.
          </p>
        </section>
      </div>
    </InfoPage>
  )
}

export function AboutPage() {
  return (
    <InfoPage title="About">
      <section>
        <h2>What EarthRelay is</h2>
        <p>
          EarthRelay is an environmental case intelligence platform. It turns a citizen photograph
          and a GPS pin into a structured case that an organization can detect, investigate, and
          respond to.
        </p>
        <p>
          The public site is for reporting. A case is created from evidence you submit, not from
          an account or a login. The aim is a clear path from what was observed in the field to a
          file the organization can act on.
        </p>
      </section>
      <section>
        <h2>Who uses it</h2>
        <p>
          Citizens file reports from the public site. They send a photograph, a location, and
          optional notes. They receive a short confirmation, not the investigation file.
        </p>
        <p>
          The organization receives those reports as cases. From there they review the site,
          decide what is needed, and follow up. When the work is finished they close the case.
        </p>
        <p>
          Volunteers join through Community Response. They help on assigned field tasks — cleanup,
          field assessment, supplies, or community outreach — using a map pin and street address
          for the site. They do not receive the reporter’s name or phone.
        </p>
      </section>
      <section>
        <h2>How a case is built</h2>
        <p>
          You send a photograph, a location, and optionally an incident type and notes. Those
          become a case file: the image, the pin, and the details you provided.
        </p>
        <p>
          The photograph is used to understand what is in the scene — flood, sewage, fire, waste,
          erosion, wildlife, collapse, or another environmental harm. The organization sees that
          assessment with the case. Citizens see only the confirmation that the report was
          received. The investigation is not a public feed and is not returned as a download
          after filing.
        </p>
      </section>
      <section>
        <h2>What the organization does with a case</h2>
        <p>
          Filed cases land in an inbox. A desk can take a case, look at the pin on the map, and
          assign a volunteer if field work is needed. Status moves from new, to investigating, to
          cleanup when that is the next step, and to closed when the case is finished.
        </p>
        <p>
          Closed cases remain on file. They are marked Closed and sit after open cases so the
          inbox stays focused on work that is still active.
        </p>
      </section>
      <section>
        <h2>Map and hazards</h2>
        <p>
          The case pin is the site of the report. The organization can also view hazard layers on
          the map — earthquakes, floods, weather, wildlife records, and protected areas — to
          understand what else is around that location.
        </p>
        <p>
          Those layers support investigation. They do not replace the photograph or the pin you
          submitted.
        </p>
      </section>
      <section>
        <h2>What happens next</h2>
        <p>
          Filed cases stay with the organization. You do not need an account to report, and you
          do not manage the case after it is sent.
        </p>
        <p>
          If the organization needs more information, they may contact the reporter using the
          details provided with the case. Keep those details accurate so follow-up is possible.
        </p>
      </section>
      <section>
        <h2>Privacy</h2>
        <p>
          Other citizens do not see your photograph, name, phone, or address. Volunteers assigned
          to a site see a map pin, an area name, and the street address, not your name or phone. The
          organization keeps the full case file for investigation and response.
        </p>
      </section>
      <section>
        <h2>Not emergency services</h2>
        <p>
          EarthRelay documents environmental harm and routes it for organizational follow-up. It
          is not a substitute for police, fire, ambulance, or civil protection.
        </p>
        <p>
          If someone is trapped, injured, or in immediate danger, call local emergency numbers
          first — including 112 where that number is used — then file a case only if it is safe
          to do so.
        </p>
      </section>
    </InfoPage>
  )
}

function LandingOverflow() {
  const er = useEarthRelay()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    function onDoc(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [menuOpen])

  function openCommunity() {
    setMenuOpen(false)
    if (er.role === 'staff' || er.role === 'ngo') er.chooseRole('citizen')
  }

  return (
    <div className="landing-menu" ref={menuRef}>
      <button
        type="button"
        className="landing-menu-btn"
        aria-label="More"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Ellipsis size={16} strokeWidth={2} />
      </button>
      {menuOpen ? (
        <div className="landing-menu-panel" role="menu">
          <Link role="menuitem" to="/community" onClick={openCommunity}>
            <Users size={16} strokeWidth={2} />
            Community
          </Link>
          <Link role="menuitem" to="/about" onClick={() => setMenuOpen(false)}>
            <Info size={16} strokeWidth={2} />
            About
          </Link>
          <Link role="menuitem" to="/help" onClick={() => setMenuOpen(false)}>
            <CircleHelp size={16} strokeWidth={2} />
            Help
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function useDesktopLanding() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 901px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 901px)')
    const sync = () => setDesktop(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return desktop
}

export function Landing() {
  const er = useEarthRelay()
  const desktop = useDesktopLanding()

  return (
    <div className="landing-hero">
      {desktop ? (
        <div className="landing-map">
          <HazardMap
            geojson={er.payload?.geojson}
            satellite={er.payload?.satellite}
            layers={er.layers}
            selectedId={null}
            onSelect={() => {}}
            onInspect={() => {}}
            autoLocate
          />
        </div>
      ) : null}
      <div className="landing-overlay">
        <div className="landing-bar">
          <p className="kicker">EarthRelay</p>
          <LandingOverflow />
        </div>
        <div className="landing-mid">
          <h1>EarthRelay</h1>
          <p className="landing-tag">Environmental case intelligence</p>
          <p className="landing-lead">Detect, investigate, and dispatch help from a field photo.</p>
        </div>
        <div className="landing-actions">
          <Link
            className="ghost-btn page-cta landing-start"
            to="/who"
            onClick={() => er.chooseRole('citizen')}
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  )
}

export function CaseDetails() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)
  const trash = useTimedDelete(async (item) => {
    await deleteCase(item.id)
    er.forgetCase(item.id)
    navigate('/app')
  })

  useEffect(() => {
    if (caseId) er.setSelectedId(caseId)
  }, [caseId])

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading case…</p>
        <Link to={er.role === 'ngo' ? '/app' : '/who'}>Back</Link>
      </div>
    )
  }

  if (er.role !== 'ngo') {
    return <Navigate to={`/case/${caseId}/alert`} replace />
  }

  return (
    <div className="page-scroll">
      <header className="topbar">
        <div>
          <h1>Case workspace</h1>
          <p className="kicker">CASE #{displayCaseId(caseFile)}</p>
        </div>
        <div className="topbar-meta">
          {trash.pending ? (
            <div className="topbar-undo">
              <p>Undo in {trash.pending.left} sec, or data will be deleted</p>
              <button type="button" className="ghost-btn" onClick={trash.undo}>
                Undo
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="ghost-btn event-delete"
                onClick={() => trash.requestDelete(caseFile, displayCaseId(caseFile))}
              >
                Delete
              </button>
              <Link className="ghost-btn" to="/app">
                Back
              </Link>
            </>
          )}
        </div>
      </header>
      <div className="page-body">
        <CaseReport
          caseFile={caseFile}
          role={er.role}
          onStatus={er.handleStatus}
          onAssign={er.handleAssign}
          onClaim={er.handleClaim}
          onEscalate={er.handleEscalate}
          deskName={er.reporterName}
        />
      </div>
      <UndoToast pending={trash.pending} onUndo={trash.undo} />
    </div>
  )
}

export function SeverityAlert() {
  const { caseId } = useParams()
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)

  if (!caseFile) {
    return (
      <div className="page-screen">
        <p>Loading…</p>
        <Link to={er.role === 'ngo' ? '/app' : '/who'}>Back</Link>
      </div>
    )
  }

  if (er.role === 'ngo') {
    return (
      <div className="page-screen who-followup">
        <p className="kicker">Open this case</p>
        <h1>Take it + call / dispatch</h1>
        <p className="page-lead">
          Take the case, set Investigating or Cleanup, close it when the work is done, call the
          phone on file, or continue to the map.
        </p>
        <button
          type="button"
          className={`ghost-btn${caseFile.claimed_by ? ' is-current' : ''}`}
          onClick={() => er.handleClaim(caseId, er.reporterName)}
        >
          {caseFile.claimed_by ? `Staff desk: ${staffDeskName(caseFile.claimed_by)}` : 'Take it'}
        </button>
        <div className="status-row followup-status">
          {['under_investigation', 'cleanup_scheduled'].map((status) => (
            <button
              key={status}
              type="button"
              className={`ghost-btn ${caseFile.status === status ? 'is-current' : ''}`}
              onClick={() => er.handleStatus(status, caseId)}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
          <button
            type="button"
            className={`ghost-btn${caseFile.status === 'resolved' ? ' is-current' : ''}`}
            onClick={() => er.handleStatus('resolved', caseId)}
          >
            Close case
          </button>
        </div>
        {caseFile.phone && (
          <a className="ghost-btn" href={`tel:${caseFile.phone}`}>
            Call {caseFile.phone}
          </a>
        )}
        <Link className="ghost-btn page-cta" to={`/case/${caseId}/brief`}>
          Continue
        </Link>
        <Link className="pin-note" to={`/case/${caseId}`}>
          Back to case
        </Link>
      </div>
    )
  }

  return <WhatHappensNext caseFile={caseFile} />
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
        <Link className="ghost-btn" to={`/case/${caseId}/brief`}>
          Brief
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
        <Link className="ghost-btn nearby-fab" to={`/case/${caseId}/nearby`}>
          Nearby cases
        </Link>
      </main>
    </div>
  )
}
