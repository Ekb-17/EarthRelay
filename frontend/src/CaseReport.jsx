import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GpsStatus, NearbyPlaces } from './LocationPrompt.jsx'
import { incidentTypeLabel, KIND_LABELS, photoKindOf, primaryConfidence, reporterDisplayName } from './context.jsx'
import { STATUS_LABELS, TEAMS, forwardSentence, noticeCopy, staffDeskName } from './routing.js'

const TYPE_DISMISS_RE =
  /was ignored|not used as proof|not used as the incident|not used as the filed|claim is not used as proof|reporter type was not treated|used only when it matches/i

function rewriteStaffText(text, { reporterType, incidentType } = {}) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (!TYPE_DISMISS_RE.test(raw) && !/Selected “/i.test(raw) && !/selected “/i.test(raw)) {
    return raw.replace(
      /Severity is based on what the photo actually shows\. The selected incident type is used only when it matches the photo\.?/i,
      'The photo and the selected incident type are both used. The photo has priority when it strongly shows a type.',
    )
  }
  if (reporterType && incidentType && reporterType !== incidentType) {
    return `The photo strongly shows ${incidentTypeLabel(incidentType)}, so that type was filed. The selected type (${incidentTypeLabel(reporterType)}) was also reviewed.`
  }
  return 'The photo and the selected type were both used.'
}

function displayTypeNote(note, typeMatch, reporterType, incidentType) {
  const text = rewriteStaffText(note, { reporterType, incidentType })
  if (!text) return ''
  if (typeMatch && /matches the selected|supports the selected/i.test(text)) return ''
  return text
}

function displayDetected(detected, incidentType, reporterType) {
  const items = []
  for (const item of detected || []) {
    if (item == null) continue
    if (typeof item === 'string') {
      const label = rewriteStaffText(item, { reporterType, incidentType })
      if (!label || /no environmental hazard/i.test(item)) continue
      items.push(label)
      continue
    }
    const label = String(item.label || '')
    if (/no environmental hazard/i.test(label)) continue
    const caveat = rewriteStaffText(item.caveat || '', { reporterType, incidentType })
    items.push({ ...item, label, caveat: caveat === 'The photo and the selected type were both used.' && !item.caveat ? '' : caveat })
  }
  return items
}

function staffCaveats(items, meta) {
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
    text = rewriteStaffText(text, meta)
    if (!text || seen.has(text)) continue
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
            placeholder="e.g. +1 555… or your local number"
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
        <p className="pin-note">GPS is read automatically. This turns green only after a real location fix.</p>
      </form>
      {caseFile.phone && <p className="pin-note">Phone on file: {caseFile.phone}</p>}
      {message && <p className="pin-note">{message}</p>}
    </div>
  )
}

export default function CaseReport({ caseFile, role, onStatus, onAssign, onClaim, onEscalate, deskName }) {
  const report = caseFile.report || {}
  const typeMeta = { reporterType: report.reporter_type, incidentType: caseFile.incident_type }
  const detected = displayDetected(report.detected || [], caseFile.incident_type, report.reporter_type)
  const weather = report.weather || {}
  const ecosystem = report.ecosystem || {}
  const confidence = Object.fromEntries(
    Object.entries(report.confidence || {}).filter(([label]) => !/no environmental hazard/i.test(label)),
  )
  const typeNote = displayTypeNote(report.type_note, report.type_match, report.reporter_type, caseFile.incident_type)
  const narrative = String(report.narrative || caseFile.detection?.summary || '')
    .replace(/Selected “[^”]+” was ignored\.?/gi, 'The selected type was also reviewed.')
    .replace(/Selected “[^”]+” was not used as the incident type\.?/gi, 'The selected type was also reviewed.')
    .replace(/Selected “[^”]+” was not used as the filed incident\.?/gi, 'The selected type was also reviewed.')
    .replace(/The selected incident type was not used as proof\.?/gi, 'The photo and the selected type were both used.')
    .replace(/That claim is not used as proof\.?/gi, 'The selected type was also reviewed.')
  const isNgo = role === 'ngo'
  const isDemo = Boolean(caseFile.demo) || /^s\d+$/i.test(String(caseFile.id || ''))
  const forwarded = forwardSentence(caseFile.incident_type)
  const coords =
    caseFile.lat != null && caseFile.lng != null
      ? `${Number(caseFile.lat).toFixed(5)}, ${Number(caseFile.lng).toFixed(5)}`
      : ''
  const placeBits = [caseFile.location_parts?.area, caseFile.location_parts?.city].filter(Boolean)
  const siteLabel =
    placeBits.length > 0
      ? [...new Set(placeBits.map((item) => String(item).trim()))].slice(0, 2).join(', ')
      : caseFile.address || (coords ? `GPS ${coords}` : 'No GPS yet')
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
        {typeNote ? <p className="pin-note">{typeNote}</p> : null}
        {notice.title && (
          <p className={notice.kind === 'extreme' ? 'alert-banner' : 'dup-banner'}>
            <strong>{notice.title}.</strong>{' '}
            {rewriteStaffText(notice.lead, typeMeta).replace(
              /The photo did not clearly match the selected category\.?/i,
              'The photo and the selected category were both used.',
            )}
          </p>
        )}
        {report.emergency && <p className="alert-banner">HIGH priority — highlighted for response</p>}
        {report.people_at_risk && (
          <p className="alert-banner">People appear to be in this scene. Contact local emergency services first.</p>
        )}
        {isDemo && (
          <p className="dup-banner">
            Demo sample case — place name is from the seed file (e.g. Muzaffarabad), not from your live GPS. File a new
            report from /who with Location on to use your real pin.
          </p>
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
            <dt>Site (GPS pin)</dt>
            <dd>
              {coords ? (
                <>
                  {siteLabel}
                  <br />
                  <span className="pin-note">
                    GPS {coords}
                    {caseFile.location_accuracy_m != null
                      ? ` ±${Math.round(caseFile.location_accuracy_m)} m`
                      : ''}
                    {caseFile.location_source ? ` · ${caseFile.location_source}` : ''}
                  </span>
                </>
              ) : (
                'No GPS pin on this case'
              )}
            </dd>
          </div>
          <div>
            <dt>Weather at pin</dt>
            <dd>
              {weather.condition
                ? `${weather.condition}, ${weather.temperature_c ?? '—'}°C, wind ${weather.wind_kmh ?? '—'} km/h. Rain next 24h: ${weather.rain_next_24h_mm ?? '—'} mm.`
                : 'Weather not loaded for this pin'}
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
            : report.eval_reference
              ? 'Severity is from the photograph (Gemini Flash), checked against the labeled photo library.'
              : 'Severity is from the photograph (Gemini Flash).'
          : report.flash_status === 'eval_reference'
            ? 'Severity / type used the labeled photo library when the cloud model was weak or unclear.'
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
          <p className="pin-note">
            You selected {incidentTypeLabel(report.reporter_type)}. The photo strongly shows{' '}
            {incidentTypeLabel(caseFile.incident_type)}, so that type was filed. The selected type was
            also reviewed.
          </p>
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
        <p>{siteLabel}</p>
        {coords ? (
          <p className="pin-note">
            Exact GPS {coords}
            {caseFile.location_accuracy_m != null ? ` ±${Math.round(caseFile.location_accuracy_m)} m` : ''}
            {caseFile.location_source ? ` · ${caseFile.location_source}` : ''}
          </p>
        ) : (
          <p className="pin-note">No GPS yet</p>
        )}
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
        <h4>Phone</h4>
        <p>{caseFile.phone || 'Not provided yet'}</p>
      </div>

      {narrative ? <p className="narrative">{narrative}</p> : null}

      <div className="report-block">
        <h4>Detected</h4>
        {detected.length === 0 && (
          <p>
            The photo and the selected type were both used. Filed as{' '}
            {incidentTypeLabel(caseFile.incident_type)}.
          </p>
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

      <List title="Limits of this assessment" items={staffCaveats(report.caveats, typeMeta)} />

      {isNgo ? (
        <>
          <h4>Response</h4>
          <p className="pin-note">
            Assign a volunteer, raise priority, or close the case from here. Closed cases stay in
            the inbox at the bottom, marked Closed. Call the reporter here. Continue opens the map
            brief — log the visit from there.
          </p>
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
                Close case
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
