import { Link, Navigate, useParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Ellipsis, CircleHelp, Share2, Info } from 'lucide-react'
import CaseReport, { HelpDispatch } from './CaseReport.jsx'
import HazardMap from './HazardMap.jsx'
import LocationPrompt, { useGpsGate } from './LocationPrompt.jsx'
import { WhatHappensNext } from './FlowPages.jsx'
import { KIND_LABELS, caseStats, displayCaseId, useEarthRelay } from './context.jsx'
import { STATUS_LABELS, staffDeskName } from './routing.js'

const LANDING_KINDS = ['waste', 'sewage', 'wildlife', 'erosion', 'flood', 'fire']

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

function InfoPage({ title, children }) {
  return (
    <div className="page-scroll info-page">
      <header className="info-bar">
        <div className="info-bar-title">
          <p className="kicker">EarthRelay</p>
          <h1>{title}</h1>
        </div>
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
          Choose a type if you know it — waste, sewage, wildlife, erosion, flood, fire, or
          similar. If you are unsure, send the photograph anyway; the type can be resolved from
          the image. Notes are optional. Anything you write is attached to the case and passed to
          the organization.
        </p>
      </section>
      <section>
        <h2>After you send the report</h2>
        <p>
          You receive a short confirmation that the report was filed. You do not see the
          investigation file, scoring, nearby cases, or dispatch. Those remain with the
          organization.
        </p>
        <p>
          The organization follows up from the inbox. They may assign a field volunteer a task.
          Volunteers do not receive your name, phone, or the full investigation. For serious
          incidents, keep your phone available. You can file another report from the same device
          if you observe a separate incident.
        </p>
      </section>
      <h2 className="info-faq-title">FAQ</h2>
      <div className="info-faq">
        <section>
          <h2>Do I need an account?</h2>
          <p>
            No. Reports are filed from the public site. You do not sign in, and you do not manage
            the case after it is sent.
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
            photo. You only see the short confirmation after you send it.
          </p>
        </section>
        <section>
          <h2>Can I join as a volunteer?</h2>
          <p>
            Yes. Open Community from the menu, or go to Community Response. Request access with an
            email and password, or sign in with those details. Volunteers only see field tasks
            assigned to them.
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
          EarthRelay is an environmental case intelligence project. It turns a citizen photograph
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
        <h2>How a case is built</h2>
        <p>
          You send a photograph, a location, and optionally an incident type and notes. Those
          become a case file: the image, the pin, and the details you provided.
        </p>
        <p>
          Scoring and the full investigation stay with the organization. Citizens see only the
          confirmation that the report was received. The investigation is not a public feed and is
          not returned as a download after filing.
        </p>
      </section>
      <section>
        <h2>What happens next</h2>
        <p>
          Filed cases stay with the organization. Staff review the file and follow up from there.
          You do not need an account to report, and you do not manage the case after it is sent.
        </p>
        <p>
          If the organization needs more information, they may contact the reporter using the
          details provided with the case. Keep those details accurate so follow-up is possible.
        </p>
      </section>
      <section>
        <h2>Volunteers</h2>
        <p>
          People who help in the field join through Community Response. They receive a task for
          that incident — not the reporter’s name, phone, or the full investigation.
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    function onDoc(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [menuOpen])

  async function shareLink() {
    const url = window.location.origin + '/'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'EarthRelay', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      } catch {
        setCopied(false)
      }
    }
    setMenuOpen(false)
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
          <Link role="menuitem" to="/help" onClick={() => setMenuOpen(false)}>
            <CircleHelp size={16} strokeWidth={2} />
            Help
          </Link>
            <button type="button" role="menuitem" onClick={shareLink}>
              <Share2 size={16} strokeWidth={2} />
              {copied ? 'Link copied' : 'Share'}
            </button>
            <Link role="menuitem" to="/community" onClick={() => setMenuOpen(false)}>
              Community
            </Link>
          <Link role="menuitem" to="/about" onClick={() => setMenuOpen(false)}>
            <Info size={16} strokeWidth={2} />
            About
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export function Landing() {
  const er = useEarthRelay()
  const stats = caseStats(er.cases)
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
            autoLocate={false}
          />
        </div>
      ) : null}
      <div className="landing-overlay">
        <div className="landing-bar">
          <p className="kicker">EarthRelay</p>
          <LandingOverflow />
        </div>
        <div className="landing-mid">
          <div className="landing-top">
            <p className="kicker landing-kicker-desktop">EarthRelay</p>
            <h1>Environmental case intelligence</h1>
          </div>
          <div className="landing-intel">
            <p className="landing-lead">Citizen report → case file → AI investigation → dispatch</p>
            <div className="landing-pills">
              <span>
                <strong>{stats.active}</strong> active
              </span>
              <span>
                <strong>{stats.high}</strong> high priority
              </span>
              <span>
                <strong>{stats.pending}</strong> awaiting
              </span>
            </div>
            <div className="landing-chips">
              {LANDING_KINDS.map((kind) => (
                <span key={kind} className="landing-chip">
                  {KIND_LABELS[kind]} <strong>{stats.categories[kind] || 0}</strong>
                </span>
              ))}
            </div>
          </div>
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
  const er = useEarthRelay()
  const caseFile = er.cases.find((item) => item.id === caseId)

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
          <p className="kicker">CASE #{displayCaseId(caseFile)}</p>
          <h1>Case workspace</h1>
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
          onEscalate={er.handleEscalate}
          deskName={er.reporterName}
        />
      </div>
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
          Take the case, set Investigating or Cleanup, call the phone on file, or continue to the map.
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
