import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GpsStatus } from './LocationPrompt.jsx'
import { PHONE_NOTICE, STATUS_LABELS, TEAMS, forwardSentence } from './routing.js'

function List({ title, items }) {
  if (!items || !items.length) return null
  return (
    <div className="report-block">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={typeof item === 'string' ? item : item.label}>
            {typeof item === 'string' ? item : `${item.label}${item.caveat ? ` — ${item.caveat}` : ''}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

function hasCoords(caseFile) {
  return caseFile?.lat != null && caseFile?.lng != null && caseFile.lat !== '' && caseFile.lng !== ''
}

export function HelpDispatch({ caseFile, onContact, gps }) {
  const located = hasCoords(caseFile)
  const [phone, setPhone] = useState(caseFile.phone || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const gpsBusy = Boolean(gps?.busy)
  const gpsKind = gps?.status?.kind

  async function save() {
    if (!onContact) return
    setSaving(true)
    setMessage('')
    try {
      await onContact({ phone })
      setMessage('Saved. Responders can use this to reach you.')
    } catch (err) {
      setMessage(err.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="help-dispatch">
      <p className="help-sent">Help is being sent.</p>
      <p>
        {located
          ? caseFile.location_source === 'gps'
            ? `GPS on file: ${Number(caseFile.lat).toFixed(5)}, ${Number(caseFile.lng).toFixed(5)}${
                caseFile.location_accuracy_m != null
                  ? ` (±${Math.round(caseFile.location_accuracy_m)} m)`
                  : ''
              }. Confirm that pin is you.`
            : `A map pin is on this case (${Number(caseFile.lat).toFixed(4)}, ${Number(caseFile.lng).toFixed(4)}). That is where the map was clicked or searched — not GPS until you press Use GPS.`
          : 'No live GPS yet. Sending a phone number does not send location. Press Use GPS, or click the map.'}
      </p>
      <form
        className="help-form"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label>
          Phone number
          <input
            type="tel"
            required
            placeholder="e.g. +92 300 1234567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <p className="pin-note">({PHONE_NOTICE})</p>
        <button type="submit" className="ghost-btn" disabled={saving || gpsBusy || !phone.trim()}>
          {saving ? 'Saving…' : 'Send phone number'}
        </button>
        <label>
          Current location
          {gps && <GpsStatus gps={gps} />}
          <button
            type="button"
            className="ghost-btn gps-btn"
            onClick={() => gps?.request()}
            disabled={saving || gpsBusy}
          >
            {gpsBusy ? 'Trying GPS…' : gpsKind === 'off' || gpsKind === 'blocked' ? 'Turn on GPS' : gpsKind === 'broken' ? 'Try GPS again' : 'Use GPS'}
          </button>
        </label>
        <p className="pin-note">Or click the big map to drop a pin.</p>
      </form>
      {caseFile.phone && <p className="pin-note">Phone on file: {caseFile.phone}</p>}
      {message && <p className="pin-note">{message}</p>}
    </div>
  )
}

export default function CaseReport({ caseFile, role, onStatus, onAssign, onClaim, deskName }) {
  const report = caseFile.report || {}
  const detected = report.detected || []
  const weather = report.weather || {}
  const ecosystem = report.ecosystem || {}
  const confidence = report.confidence || {}
  const isNgo = role === 'ngo'
  const forwarded = forwardSentence(caseFile.incident_type)
  const coords =
    caseFile.lat != null && caseFile.lng != null
      ? `${Number(caseFile.lat).toFixed(5)}, ${Number(caseFile.lng).toFixed(5)}`
      : ''
  const phoneNotice = caseFile.phone_notice || PHONE_NOTICE

  return (
    <section className={`full-report ${report.emergency ? 'is-emergency' : ''}`}>
      <div className="report-head">
        <p className="event-type">
          {caseFile.reporter_role || 'citizen'} · {STATUS_LABELS[caseFile.status] || caseFile.status}
        </p>
        <h3>{caseFile.title}</h3>
        <p className="forward-banner">
          {forwarded}
          {caseFile.claimed_by ? ` Taken by ${caseFile.claimed_by}.` : ' Waiting in the inbox.'}
        </p>
        {report.duplicate_note && <p className="dup-banner">{report.duplicate_note}</p>}
        {report.emergency && <p className="alert-banner">HIGH priority — highlighted for response</p>}
      </div>

      <div className="photo-pair">
        {caseFile.image_url && (
          <figure>
            <img className="case-photo" src={caseFile.image_url} alt="Original site photo" />
            <figcaption>Original</figcaption>
          </figure>
        )}
        {caseFile.annotated_url && (
          <figure>
            <img className="case-photo" src={caseFile.annotated_url} alt="Annotated detection" />
            <figcaption>Annotated</figcaption>
          </figure>
        )}
      </div>

      <div className="score-row">
        <div>
          <span>Severity</span>
          <strong>{report.severity ?? '—'}/10</strong>
        </div>
        <div>
          <span>Priority</span>
          <strong>{report.priority || 'LOW'}</strong>
        </div>
        <div>
          <span>Reports</span>
          <strong>{caseFile.report_count || 1}</strong>
        </div>
      </div>

      <div className="report-block">
        <h4>Incident type</h4>
        <p>{(caseFile.incident_type || 'other').replaceAll('_', ' ')}</p>
      </div>

      {caseFile.notes && (
        <div className="report-block">
          <h4>Reporter notes</h4>
          <p>{caseFile.notes}</p>
        </div>
      )}

      <div className="report-block">
        <h4>Location</h4>
        <p>{caseFile.address || (coords ? `GPS ${coords}` : 'No GPS yet')}</p>
        {coords && <p className="pin-note">Map pin: {coords}</p>}
      </div>

      <div className="report-block">
        <h4>Phone</h4>
        <p>{caseFile.phone || 'Not provided yet'}</p>
        <p className="pin-note">({phoneNotice})</p>
      </div>

      <p className="narrative">{report.narrative || caseFile.detection?.summary}</p>

      <div className="report-block">
        <h4>Detected</h4>
        {detected.length === 0 && <p>No strong visual objects. Scene and reporter type were used.</p>}
        <ul>
          {detected.map((item) => (
            <li key={item.label || item}>
              {item.label || item}
              {item.source && <em> · {item.source}</em>}
              {item.confidence != null && ` (${Math.round((item.confidence > 1 ? item.confidence : item.confidence * 100))}%)`}
              {item.caveat && <em> {item.caveat}</em>}
            </li>
          ))}
        </ul>
      </div>

      {Object.keys(confidence).length > 0 && (
        <div className="report-block">
          <h4>Confidence</h4>
          <ul>
            {Object.entries(confidence).map(([label, value]) => (
              <li key={label}>
                {label}: {value}%
              </li>
            ))}
          </ul>
        </div>
      )}

      <List title="Why this priority" items={report.priority_reasons} />
      <List title="Possible causes" items={report.possible_causes} />
      <List title="Environmental risks" items={report.environmental_risks} />
      <List title="Immediate actions" items={report.immediate_actions} />
      <List title="Long-term actions" items={report.long_term_actions} />

      <div className="report-block">
        <h4>Weather and wash-downstream risk</h4>
        <p>
          {weather.condition || 'n/a'}, {weather.temperature_c ?? '—'}°C, wind {weather.wind_kmh ?? '—'} km/h.
          Rain next 24h: {weather.rain_next_24h_mm ?? '—'} mm
          {weather.rain_chance_pct != null ? ` (${weather.rain_chance_pct}% chance)` : ''}.
        </p>
        <p>{weather.river_note}</p>
      </div>

      <div className="report-block">
        <h4>Wildlife / habitat</h4>
        <p>{report.wildlife_impact || ecosystem.note}</p>
        {(ecosystem.protected || []).slice(0, 3).map((item) => (
          <small key={item.title}>
            Protected: {item.title} ({Math.round(item.distance_m / 1000)} km)
          </small>
        ))}
      </div>

      <List title="Limits of this assessment" items={report.caveats} />

      {isNgo ? (
        <>
          <h4>Take this case</h4>
          <p className="pin-note">Claim it, then set status and call or dispatch with the phone and GPS on file.</p>
          <div className="status-row">
            <button
              type="button"
              className="ghost-btn page-cta"
              onClick={() => onClaim?.(caseFile.id, deskName)}
            >
              {caseFile.claimed_by ? `Taken by ${caseFile.claimed_by}` : 'Take it'}
            </button>
            {caseFile.phone && (
              <a className="ghost-btn page-cta" href={`tel:${caseFile.phone}`}>
                Call {caseFile.phone}
              </a>
            )}
            <Link className="ghost-btn" to={`/case/${caseFile.id}/contact`}>
              Dispatch map
            </Link>
          </div>
          <div className="status-row">
            {['pending', 'under_investigation', 'cleanup_scheduled', 'resolved'].map((status) => (
              <button
                key={status}
                type="button"
                className={`ghost-btn ${caseFile.status === status ? 'is-current' : ''}`}
                onClick={() => onStatus(status, caseFile.id)}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <select
            value={caseFile.assigned_team || caseFile.routed_to || 'earthrelay-org'}
            onChange={(event) => onAssign(event.target.value, caseFile.id)}
          >
            {TEAMS.map((team) => (
              <option key={team.id} value={team.id}>
                Desk: {team.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="pin-note">
          {forwarded} Officers take it from the NGO inbox. ({phoneNotice})
        </p>
      )}
    </section>
  )
}
