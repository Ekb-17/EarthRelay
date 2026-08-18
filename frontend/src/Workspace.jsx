import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CloudSun,
  Droplets,
  FolderOpen,
  ImagePlus,
  PawPrint,
  RefreshCw,
  Satellite,
  Trees,
  Waves,
  Wind,
} from 'lucide-react'
import HazardMap from './HazardMap.jsx'
import LocationPrompt from './LocationPrompt.jsx'
import PlaceSearch from './PlaceSearch.jsx'
import { INCIDENT_TYPES, useEarthRelay } from './context.jsx'
import { PHONE_NOTICE, STATUS_LABELS, TEAMS, forwardSentence, routeFor } from './routing.js'

const LAYER_ICONS = {
  satellite: Satellite,
  earthquake: Activity,
  tsunami: Waves,
  flood: Droplets,
  weather: CloudSun,
  air: Wind,
  wildlife: PawPrint,
  protected: Trees,
  case: FolderOpen,
}

const LAYER_META = [
  { id: 'satellite', label: 'Satellite', detail: 'Photo overlay · zoom in' },
  { id: 'earthquake', label: 'Earthquakes', detail: 'USGS M4.5+ last 7 days' },
  { id: 'tsunami', label: 'Tsunamis', detail: 'NOAA NCEI historical' },
  { id: 'flood', label: 'Floods', detail: 'NASA EONET + GDACS' },
  { id: 'weather', label: 'Weather', detail: 'Click a pin for wind and rain' },
  { id: 'air', label: 'Air quality', detail: 'Click a pin for AQI' },
  { id: 'wildlife', label: 'Wildlife', detail: 'GBIF threatened species' },
  { id: 'protected', label: 'Protected areas', detail: 'Natural Earth + UNESCO' },
  { id: 'case', label: 'EarthRelay cases', detail: 'Uploaded files' },
]

function formatTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function Workspace() {
  const navigate = useNavigate()
  const er = useEarthRelay()
  const isNgo = er.role === 'ngo'
  const [inboxTeam, setInboxTeam] = useState('all')
  const inboxCases = er.cases.filter((item) => {
    if (inboxTeam === 'all') return true
    if (inboxTeam === 'unclaimed') return !item.claimed_by
    return (item.routed_to || item.assigned_team) === inboxTeam
  })

  async function onSubmit(event) {
    event.preventDefault()
    const created = await er.handleUpload()
    if (!created?.id) return
    navigate(`/case/${created.id}`)
  }

  return (
    <div className="app-shell">
      <LocationPrompt
        onFix={({ lat, lng }) => {
          er.setPin({ lat, lng })
          er.setPlaceTarget({
            lat,
            lng,
            zoom: 17,
            name: 'You are here',
            label: 'You are here',
            pickedAt: Date.now(),
          })
          er.handleInspect({ lat, lng })
        }}
      />
      <header className="topbar">
        <div>
          <p className="kicker">EarthRelay</p>
          <h1>{isNgo ? 'NGO inbox' : 'File a report'}</h1>
        </div>
        <div className="topbar-meta">
          <Link className="ghost-btn" to="/role">
            Switch role
          </Link>
          <span className={`live-dot ${er.error ? 'is-error' : ''}`} />
          <span>{er.error ? 'Backend offline' : er.loading ? 'Updating' : `${inboxCases.length} in inbox`}</span>
          <button type="button" className="ghost-btn" onClick={er.load} disabled={er.loading}>
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        {!isNgo && (
        <section>
          <h2>File a report</h2>
          <form className="upload-form" onSubmit={onSubmit}>
            <label className="file-btn">
              <ImagePlus size={16} />
              {er.file ? er.file.name : 'Upload site photo'}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => er.setFile(event.target.files?.[0] || null)}
              />
            </label>
            <select value={er.incidentType} onChange={(event) => er.setIncidentType(event.target.value)}>
              {INCIDENT_TYPES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={isNgo ? 'Officer / desk name' : 'Your name (optional)'}
              value={er.reporterName}
              onChange={(event) => er.setReporterName(event.target.value)}
            />
            <input
              type="text"
              placeholder="Case title"
              value={er.title}
              onChange={(event) => er.setTitle(event.target.value)}
            />
            <textarea
              placeholder="Notes for investigators"
              value={er.notes}
              onChange={(event) => er.setNotes(event.target.value)}
              rows={3}
            />
            <p className="pin-note">
              {er.pin
                ? `Pinned ${er.pin.lat.toFixed(3)}, ${er.pin.lng.toFixed(3)}`
                : 'Pin the map or use GPS, then submit.'}
            </p>
            <p className="forward-note">{forwardSentence(er.incidentType)}</p>
            <p className="pin-note">({PHONE_NOTICE})</p>
            {er.error && (
              <p className="banner">
                <AlertTriangle size={16} /> {er.error}
              </p>
            )}
            <button type="submit" className="ghost-btn" disabled={er.uploading}>
              {er.uploading ? 'Building full case report…' : 'Submit report'}
            </button>
          </form>
        </section>
        )}

        {isNgo && (
          <section className="inbox-section">
            <h2>Inbox</h2>
            <p className="layer-help">Cases filed on this official EarthRelay land here. Take a case, then call or dispatch.</p>
            <input
              type="text"
              placeholder="Your desk name (used when you take a case)"
              value={er.reporterName}
              onChange={(event) => er.setReporterName(event.target.value)}
            />
            <div className="inbox-filters">
              <button
                type="button"
                className={`ghost-btn ${inboxTeam === 'all' ? 'is-current' : ''}`}
                onClick={() => setInboxTeam('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`ghost-btn ${inboxTeam === 'unclaimed' ? 'is-current' : ''}`}
                onClick={() => setInboxTeam('unclaimed')}
              >
                Unclaimed
              </button>
              {TEAMS.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={`ghost-btn ${inboxTeam === team.id ? 'is-current' : ''}`}
                  onClick={() => setInboxTeam(team.id)}
                >
                  {team.short}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2>Map layers</h2>
          {LAYER_META.map((layer) => {
            const Icon = LAYER_ICONS[layer.id]
            const count = er.payload?.counts?.[layer.id]
            return (
              <label key={layer.id} className={`layer-row ${layer.id}`}>
                <input
                  type="checkbox"
                  checked={er.layers[layer.id]}
                  onChange={() =>
                    er.setLayers((current) => ({ ...current, [layer.id]: !current[layer.id] }))
                  }
                />
                <Icon size={18} />
                <span>
                  <strong>{layer.label}</strong>
                  <small>{layer.detail}</small>
                </span>
                {count != null && <em>{count}</em>}
              </label>
            )
          })}
        </section>

        <section className="event-list-wrap">
          <h2>{isNgo ? 'Forwarded cases' : 'Your filings'}</h2>
          <div className="event-list">
            {inboxCases.length === 0 && !er.loading && (
              <p className="empty">
                {isNgo ? 'Inbox is empty. New citizen filings appear here automatically.' : 'No cases yet. Upload a photo to start detection.'}
              </p>
            )}
            {inboxCases.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`event-card case ${item.report?.emergency ? 'is-emergency' : ''} ${item.id === er.selectedId ? 'is-active' : ''}`}
                onClick={() => navigate(`/case/${item.id}`)}
              >
                <span className="event-type">
                  {item.report?.priority || item.priority || 'LOW'} · {STATUS_LABELS[item.status] || item.status}
                </span>
                <strong>{item.title}</strong>
                <small>
                  {item.routed_label || routeFor(item.incident_type).label}
                  {item.claimed_by ? ` · taken by ${item.claimed_by}` : ' · unclaimed'}
                </small>
                <small>
                  {item.incident_type.replaceAll('_', ' ')} · {formatTime(item.created_at)}
                </small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="map-stage">
        <PlaceSearch
          onSelect={(place) => {
            er.setPlaceTarget({ ...place, pickedAt: Date.now() })
            er.setPin({ lat: place.lat, lng: place.lng })
          }}
        />
        <HazardMap
          geojson={er.payload?.geojson}
          satellite={er.payload?.satellite}
          layers={er.layers}
          selectedId={er.selectedId}
          onSelect={(id) => navigate(`/case/${id}`)}
          onInspect={er.handleInspect}
          placeTarget={er.placeTarget}
        />
        <div className="legend">
          <span className="swatch earthquake" /> Quakes
          <span className="swatch tsunami" /> Tsunami
          <span className="swatch flood" /> Flood
          <span className="swatch case" /> Cases
        </div>
      </main>
    </div>
  )
}
