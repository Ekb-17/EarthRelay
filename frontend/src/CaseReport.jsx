import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GpsStatus, NearbyPlaces } from './LocationPrompt.jsx'
import { incidentTypeLabel, KIND_LABELS, photoKindOf, primaryConfidence, reporterDisplayName } from './context.jsx'
import { STATUS_LABELS, TEAMS, forwardSentence, noticeCopy, staffDeskName } from './routing.js'

function staffCaveats(items) {
  const out = []
  const seen = new Set()
  for (const item of items || []) {
    let text = typeof item === 'string' ? item : item?.label
    if (!text) continue
    if (/\byolo\b/i.test(text)) {
      const low = text.toLowerCase()
      text =
        /structur|trapped|collaps|victim|casualt/.test(low)
          ? 'The photo cannot confirm whether a structure is stable or whether anyone is trapped.'
          : 'The photo cannot prove every detail of what is happening on the ground.'
    }
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

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
          ? caseFile.address
            ? `${caseFile.address}${
                caseFile.location_accuracy_m != null
                  ? ` (±${Math.round(caseFile.location_accuracy_m)} m)`
                  : ''
              }`
            : caseFile.location_source === 'gps'
              ? `GPS on file: ${Number(caseFile.lat).toFixed(5)}, ${Number(caseFile.lng).toFixed(5)}.`
              : `A map pin is on this case (${Number(caseFile.lat).toFixed(4)}, ${Number(caseFile.lng).toFixed(4)}).`
          : 'No live GPS yet. Turn Location on in your phone settings. This page reads GPS by itself.'}
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
        <button type="submit" className="ghost-btn" disabled={saving || gpsBusy || !phone.trim()}>
          {saving ? 'Saving…' : 'Send phone number'}
        </button>
        <label>
          Current location
          {gps && <GpsStatus gps={gps} />}
          {gps && gpsKind !== 'on' && (
            <button
              type="button"
              className="ghost-btn gps-btn"
              onClick={() => gps?.request()}
              disabled={saving || gpsBusy}
            >
              {gpsBusy ? 'Reading GPS…' : 'Try GPS again'}
            </button>
          )}
        </label>
        <p className="pin-note">GPS is read automatically. This turns green when Location is on.</p>
      </form>
      {caseFile.phone && <p className="pin-note">Phone on file: {caseFile.phone}</p>}
      {message && <p className="pin-note">{message}</p>}
    </div>
  )
}

export default function CaseReport({ caseFile, role, onStatus, onAssign, onClaim, onEscalate, deskName }) {
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
  const notice = noticeCopy(caseFile.incident_type, report)
  const indoor = report.scene === 'indoor_household' || report.photo_kind === 'indoor'
  const showAnnotated =
    Boolean(caseFile.annotated_url) &&
    !indoor &&
    ((caseFile.detection?.count || 0) > 0 ||
      report.photo_kind === 'fire' ||
      report.photo_kind === 'flood' ||
      report.photo_kind === 'collapse')
  const kind = photoKindOf(caseFile)
  const kindLabel = indoor ? 'Other' : KIND_LABELS[kind] || incidentTypeLabel(caseFile.incident_type)
  const confidencePct = primaryConfidence(report)
  const showConfidence = confidencePct != null && confidencePct >= 60
  const related = Number(caseFile.report_count) || 1
  const extraFilings = (caseFile.reports || []).length
  const showDuplicate = Boolean(isNgo && report.duplicate_note && extraFilings > 1 && !caseFile.demo)
  const recommended =
    isNgo && related > 1
      ? `Review together with the other nearby reports of this same ${incidentTypeLabel(caseFile.incident_type)}.`
      : report.immediate_actions?.[0] || 'This case is now in the inbox.'
  const evidenceParts = [
    caseFile.image_url ? '1 photo' : null,
    coords
      ? `GPS${caseFile.location_accuracy_m != null ? ` ±${Math.round(caseFile.location_accuracy_m)} m` : ''}`
      : null,
    weather.condition ? 'weather' : null,
    (ecosystem.protected || []).length ? 'habitat context' : null,
  ].filter(Boolean)

  return (
    <section className={`full-report ${report.emergency ? 'is-emergency' : ''}`}>
      <div className="report-head">
        <p className="event-type">
          {caseFile.reporter_role || 'citizen'} · {STATUS_LABELS[caseFile.status] || caseFile.status}
        </p>
        <h3>{caseFile.title}</h3>
        <p className="report-filer">Filed by {reporterDisplayName(caseFile)}</p>
        <p className="forward-banner">
          {forwarded}
          {caseFile.claimed_by
            ? ` Staff desk ${staffDeskName(caseFile.claimed_by)} has this case (not a volunteer).`
            : ' Waiting in the inbox.'}
        </p>
        {showDuplicate && <p className="dup-banner">{report.duplicate_note}</p>}
        {report.type_note && !report.type_match && (
          <p className="dup-banner">{report.type_note}</p>
        )}
        {notice.title && (
          <p className={notice.kind === 'extreme' ? 'alert-banner' : 'dup-banner'}>
            <strong>{notice.title}.</strong> {notice.lead}
          </p>
        )}
        {report.emergency && <p className="alert-banner">HIGH priority — highlighted for response</p>}
        {report.people_at_risk && (
          <p className="alert-banner">People appear to be in this scene. Contact local emergency services first.</p>
        )}
      </div>

      <div className="intel-card">
        <h3>
          {kindLabel
            ? showConfidence
              ? `${kindLabel} detected — ${confidencePct}% confidence`
              : `${kindLabel} detected`
            : 'Photo under review'}
        </h3>
        {indoor && (
          <p className="intel-kind-note">
            This is not treated as a field hazard. The photo reads as a screen, indoor, or household
            scene — not flood, fire, or collapse.
            {showConfidence && indoor
              ? ` The model is ${confidencePct}% confident of that.`
              : ''}
          </p>
        )}
        <dl className="intel-grid">
          <div>
            <dt>Severity</dt>
            <dd>
              {report.severity != null ? `${report.severity}/10` : '—'} · {report.priority || caseFile.priority || 'LOW'}
            </dd>
          </div>
          <div>
            <dt>Environmental conditions</dt>
            <dd>
              {weather.condition
                ? `${weather.condition}, ${weather.temperature_c ?? '—'}°C, wind ${weather.wind_kmh ?? '—'} km/h. Rain next 24h: ${weather.rain_next_24h_mm ?? '—'} mm.`
                : caseFile.address || 'Location on file'}
            </dd>
          </div>
          <div>
            <dt>Related reports</dt>
            <dd>
              {showDuplicate
                ? `${related} reports of this same incident nearby.`
                : 'This is the only report of this incident on file.'}
            </dd>
          </div>
          <div>
            <dt>Recommended action</dt>
            <dd>{recommended}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{evidenceParts.length ? evidenceParts.join(' + ') : 'Case file opened'}</dd>
          </div>
        </dl>
      </div>

      <div className="photo-pair">
        {caseFile.image_url && (
          <figure>
            <img className="case-photo" src={caseFile.image_url} alt="Original site photo" />
            <figcaption>Original</figcaption>
          </figure>
        )}
        {showAnnotated && (
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
      <p className="pin-note">
        {report.flash_status === 'gemini'
          ? report.gemini_tier === 'pro'
            ? 'Severity is from the photograph (Gemini Pro — hard or unclear scene).'
            : 'Severity is from the photograph (Gemini Flash).'
          : report.flash_error
            ? 'Severity is from on-device review. Cloud photo scoring was unavailable for this file.'
            : 'Severity is from on-device review. Gemini Flash did not score this photo.'}
      </p>

      <div className="report-block">
        <h4>Filed by</h4>
        <p>{reporterDisplayName(caseFile)}</p>
        {caseFile.phone ? <p className="pin-note">{caseFile.phone}</p> : null}
      </div>

      <div className="report-block">
        <h4>Incident type</h4>
        <p>{incidentTypeLabel(caseFile.incident_type)}</p>
        {report.reporter_type && report.reporter_type !== caseFile.incident_type && (
          <p className="pin-note">You selected {incidentTypeLabel(report.reporter_type)}. The photo was used instead.</p>
        )}
      </div>

      {(caseFile.notes || report.reporter_notes) && (
        <div className="report-block">
          <h4>The reporter also mentioned</h4>
          <p>{caseFile.notes || report.reporter_notes}</p>
        </div>
      )}

      <div className="report-block">
        <h4>Location</h4>
        <p>{caseFile.address || (coords ? `GPS ${coords}` : 'No GPS yet')}</p>
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
        {coords && <p className="pin-note">Coordinates: {coords}</p>}
      </div>

      <div className="report-block">
        <h4>Phone</h4>
        <p>{caseFile.phone || 'Not provided yet'}</p>
      </div>

      <p className="narrative">{report.narrative || caseFile.detection?.summary}</p>

      <div className="report-block">
        <h4>Detected</h4>
        {detected.length === 0 && (
          <p>No environmental hazard confirmed in the photo. The selected incident type was not used as proof.</p>
        )}
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

      <List title="Limits of this assessment" items={staffCaveats(report.caveats)} />

      {isNgo ? (
        <>
          <h4>Response</h4>
          <p className="pin-note">Assign a volunteer, raise priority, or close the case. Call the reporter here. Continue opens the map brief — log the visit from there.</p>
          <div className="response-actions">
            <div className="status-row">
              <Link
                className={`ghost-btn${caseFile.assignment ? ' is-current' : ''}`}
                to={`/case/${caseFile.id}/assign`}
              >
                Assign Response
              </Link>
              <button
                type="button"
                className={`ghost-btn${(caseFile.report?.priority || caseFile.priority) === 'HIGH' ? ' is-current' : ''}`}
                onClick={() => onEscalate?.(caseFile.id)}
              >
                Escalate
              </button>
              <button
                type="button"
                className={`ghost-btn${caseFile.status === 'resolved' ? ' is-current' : ''}`}
                onClick={() => onStatus('resolved', caseFile.id)}
              >
                Close Case
              </button>
            </div>
            <div className={`status-row${caseFile.phone ? '' : ' is-two'}`}>
              <button
                type="button"
                className={`ghost-btn${caseFile.claimed_by ? ' is-current' : ''}`}
                onClick={() => onClaim?.(caseFile.id, deskName)}
              >
                {caseFile.claimed_by ? `Staff desk: ${staffDeskName(caseFile.claimed_by)}` : 'Take it'}
              </button>
              {caseFile.phone ? (
                <a className="ghost-btn" href={`tel:${caseFile.phone}`}>
                  Call {caseFile.phone}
                </a>
              ) : null}
              <Link className="ghost-btn" to={`/case/${caseFile.id}/brief`}>
                Continue
              </Link>
            </div>
            <div className="status-row">
              {['under_investigation', 'cleanup_scheduled'].map((status) => (
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
            <label className="response-desk">
              Inbox
              <select
                value={caseFile.assigned_team || caseFile.routed_to || 'earthrelay-org'}
                onChange={(event) => onAssign(event.target.value, caseFile.id)}
              >
                {TEAMS.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <p className="pin-note">{forwarded} Officers take it from the NGO inbox.</p>
      )}
    </section>
  )
}
