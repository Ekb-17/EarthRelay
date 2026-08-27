import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  CloudSun,
  Droplets,
  FolderOpen,
  PawPrint,
  RefreshCw,
  Satellite,
  Trees,
  Waves,
} from 'lucide-react'
import HazardMap from './HazardMap.jsx'
import LocationPrompt from './LocationPrompt.jsx'
import PlaceSearch from './PlaceSearch.jsx'
import { displayCaseId, hasIncidentPhoto, incidentTypeLabel, reporterDisplayName, reporterMention, useEarthRelay } from './context.jsx'
import { fetchHealth, deleteCase } from './api.js'
import { STATUS_LABELS, TEAMS, responseTeam, staffDeskLabel } from './routing.js'
import { UndoToast, useTimedDelete } from './UndoBar.jsx'

const LAYER_ICONS = {
  satellite: Satellite,
  earthquake: Activity,
  tsunami: Waves,
  flood: Droplets,
  weather: CloudSun,
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
  const [inboxTeam, setInboxTeam] = useState('all')
  const [cloud, setCloud] = useState(null)
  const [layersOpen, setLayersOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const trash = useTimedDelete(async (item) => {
    try {
      await deleteCase(item.id)
    } catch (err) {
      er.restoreCase(item)
      setDeleteError(err.message || 'Could not delete the case.')
    }
  })

  useEffect(() => {
    er.chooseRole('ngo')
  }, [])

  useEffect(() => {
    fetchHealth()
      .then((data) => setCloud(data.supabase || null))
      .catch(() => setCloud(null))
  }, [])

  const inboxCases = er.cases.filter((item) => {
    if (trash.isPending(item.id)) return false
    if (!hasIncidentPhoto(item)) return false
    if (inboxTeam === 'all') return true
    if (inboxTeam === 'unclaimed') return !item.claimed_by
    return (item.routed_to || item.assigned_team) === inboxTeam
  })

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
        <h1>Cases</h1>
        <div className="topbar-meta">
          {trash.pending ? (
            <div className="topbar-undo">
              <p>Undo in {trash.pending.left} sec, or data will be deleted</p>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  if (trash.pending?.item) er.restoreCase(trash.pending.item)
                  trash.undo()
                }}
              >
                Undo
              </button>
            </div>
          ) : (
            <>
              <span className={`inbox-cloud ${cloud?.ok ? 'is-live' : ''}`}>
                {cloud?.ok ? 'Cloud inbox' : 'Local inbox'}
              </span>
              <span className={`live-dot ${er.error ? 'is-error' : ''}`} />
              <span>{er.error ? 'Backend offline' : er.loading ? 'Updating' : `${inboxCases.length} in inbox`}</span>
              <button type="button" className="ghost-btn" onClick={er.load} disabled={er.loading}>
                <RefreshCw size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <aside className="sidebar">
        <section className="inbox-section">
            <h2>Inbox</h2>
            <p className="layer-help">
              {cloud?.ok
                ? 'Cases filed on the phone land here and in Supabase, so this laptop and the phone share one inbox.'
                : 'Cases filed on this EarthRelay land here. Take a case, then call or dispatch.'}
            </p>
            {deleteError ? <p className="error-banner">{deleteError}</p> : null}
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

        <section className="layer-section">
          <div className="layer-heading">
            <h2>Map layers</h2>
            <label className={`layer-toggle${layersOpen ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={layersOpen}
                onChange={() => setLayersOpen(true)}
              />
              <span className="layer-toggle-box" aria-hidden="true">
                {layersOpen ? '✓' : ''}
              </span>
              Show
            </label>
            <label className={`layer-toggle${!layersOpen ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={!layersOpen}
                onChange={() => setLayersOpen(false)}
              />
              <span className="layer-toggle-box" aria-hidden="true">
                {!layersOpen ? '✓' : ''}
              </span>
              Hide
            </label>
          </div>
          {layersOpen
            ? LAYER_META.map((layer) => {
                const Icon = LAYER_ICONS[layer.id]
                const count = er.payload?.counts?.[layer.id]
                const on = Boolean(er.layers[layer.id])
                return (
                  <label key={layer.id} className={`layer-row ${layer.id}${on ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        er.setLayers((current) => ({ ...current, [layer.id]: !current[layer.id] }))
                      }
                    />
                    <span className="layer-tick" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <Icon size={18} />
                    <span>
                      <strong>{layer.label}</strong>
                      <small>{layer.detail}</small>
                    </span>
                    {count != null && <em>{count}</em>}
                  </label>
                )
              })
            : null}
        </section>

        <section className="event-list-wrap">
          <h2>Forwarded cases</h2>
          <div className="event-list">
            {inboxCases.length === 0 && !er.loading && (
              <p className="empty">Inbox is empty. New citizen filings appear here automatically.</p>
            )}
            {inboxCases.map((item) => (
              <div
                key={item.id}
                className={`event-card case ${item.report?.emergency ? 'is-emergency' : ''} ${item.status === 'resolved' ? 'is-closed' : ''} ${item.id === er.selectedId ? 'is-active' : ''}`}
              >
                <div className="event-card-head">
                  <span className="event-type">
                    {displayCaseId(item)} · {item.report?.priority || item.priority || 'LOW'} · {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <button
                    type="button"
                    className="ghost-btn event-delete"
                    onClick={(event) => {
                      event.stopPropagation()
                      setDeleteError('')
                      er.forgetCase(item.id)
                      trash.requestDelete(item, displayCaseId(item))
                    }}
                  >
                    Delete
                  </button>
                </div>
                <button
                  type="button"
                  className="event-card-main"
                  onClick={() => navigate(`/case/${item.id}`)}
                >
                <strong>{item.title}</strong>
                <small>{reporterDisplayName(item)}</small>
                <small>
                  {item.routed_label || responseTeam(item.incident_type)} · {staffDeskLabel(item.claimed_by)}
                </small>
                {item.assignment?.responder_name ? (
                  <small>
                    Assigned to {item.assignment.responder_name}
                    {item.assignment.need_label || item.assignment.need
                      ? ` · ${item.assignment.need_label || item.assignment.need}`
                      : ''}
                  </small>
                ) : null}
                <small>
                  {incidentTypeLabel(item.incident_type)} · {formatTime(item.created_at)}
                </small>
                {reporterMention(item.notes) ? <small className="inbox-mention">{reporterMention(item.notes)}</small> : null}
                </button>
              </div>
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
      <UndoToast
        pending={trash.pending}
        onUndo={() => {
          if (trash.pending?.item) er.restoreCase(trash.pending.item)
          trash.undo()
        }}
      />
    </div>
  )
}
