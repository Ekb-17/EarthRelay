import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ImagePlus, Shield, User } from 'lucide-react'
import HazardMap from './HazardMap.jsx'
import LocationPrompt, { GpsStatus, useGpsGate } from './LocationPrompt.jsx'
import { INCIDENT_TYPES, useEarthRelay } from './context.jsx'
import { PHONE_NOTICE, forwardSentence } from './routing.js'

export default function WhoYouAre() {
  const navigate = useNavigate()
  const er = useEarthRelay()
  const [first, setFirst] = useState(er.firstName || '')
  const [last, setLast] = useState(er.lastName || '')
  const [phone, setPhone] = useState(er.phone || '')
  const [role, setRole] = useState(er.role || 'citizen')
  const [localError, setLocalError] = useState('')

  const gps = useGpsGate({
    onFix: ({ lat, lng }) => {
      er.setPin({ lat, lng })
      er.setPlaceTarget({
        lat,
        lng,
        zoom: 16,
        name: 'You are here',
        label: 'You are here',
        pickedAt: Date.now(),
      })
    },
  })

  async function onSubmit(event) {
    event.preventDefault()
    setLocalError('')
    if (!first.trim() || !last.trim()) {
      setLocalError('Enter your first and last name.')
      return
    }
    if (!phone.trim()) {
      setLocalError('Enter a phone number so the organization can reach you.')
      return
    }
    er.setIdentity({ first: first.trim(), last: last.trim(), phone: phone.trim(), role })
    er.chooseRole(role)

    if (role === 'ngo') {
      navigate('/app')
      return
    }
    if (!er.file) {
      setLocalError('Add a site photo to file the case.')
      return
    }
    const created = await er.handleUpload({
      firstName: first.trim(),
      lastName: last.trim(),
      phone: phone.trim(),
      role,
    })
    if (!created?.id) {
      setLocalError(er.error || 'Could not submit.')
      return
    }
    navigate(`/case/${created.id}`)
  }

  return (
    <div className="who-page">
      <LocationPrompt gps={gps} />
      <header className="topbar">
        <div>
          <p className="kicker">EarthRelay</p>
          <h1>Who are you?</h1>
        </div>
        <Link className="ghost-btn" to="/">
          Back
        </Link>
      </header>

      <div className="who-map">
        <HazardMap
          geojson={er.payload?.geojson}
          satellite={er.payload?.satellite}
          layers={er.layers}
          selectedId={null}
          onSelect={() => {}}
          onInspect={er.handleInspect}
          placeTarget={er.placeTarget}
        />
      </div>

      <form className="who-form" onSubmit={onSubmit}>
        <label>
          First name
          <input
            required
            autoComplete="given-name"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
          />
        </label>
        <label>
          Last name
          <input
            required
            autoComplete="family-name"
            value={last}
            onChange={(event) => setLast(event.target.value)}
          />
        </label>
        <label>
          Phone number
          <input
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="e.g. 0314 9714765"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <p className="pin-note">({PHONE_NOTICE})</p>

        <p className="who-label">Who are you?</p>
        <div className="role-toggle">
          <button
            type="button"
            className={`ghost-btn ${role === 'citizen' ? 'is-current' : ''}`}
            onClick={() => setRole('citizen')}
          >
            <User size={18} /> Citizen
          </button>
          <button
            type="button"
            className={`ghost-btn ${role === 'ngo' ? 'is-current' : ''}`}
            onClick={() => setRole('ngo')}
          >
            <Shield size={18} /> NGO / officer
          </button>
        </div>

        <div className="who-gps">
          <p className="who-label">GPS</p>
          <GpsStatus gps={gps} />
          <button type="button" className="ghost-btn gps-btn" onClick={() => gps.request()} disabled={gps.busy}>
            {gps.busy ? 'Trying GPS…' : gps.status?.kind === 'on' ? 'Refresh GPS' : 'Turn on / Allow GPS'}
          </button>
        </div>

        {role === 'citizen' && (
          <>
            <label className="file-btn">
              <ImagePlus size={16} />
              {er.file ? er.file.name : 'Add site photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => er.setFile(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              What did you see?
              <select value={er.incidentType} onChange={(event) => er.setIncidentType(event.target.value)}>
                {INCIDENT_TYPES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              placeholder="Notes for investigators (optional)"
              value={er.notes}
              onChange={(event) => er.setNotes(event.target.value)}
              rows={3}
            />
            <p className="forward-note">{forwardSentence(er.incidentType)}</p>
          </>
        )}

        {(localError || er.error) && <p className="banner">{localError || er.error}</p>}

        <button type="submit" className="ghost-btn page-cta who-submit" disabled={er.uploading}>
          {er.uploading ? 'Building your case…' : role === 'ngo' ? 'Open inbox' : 'Submit report'}
        </button>
      </form>
    </div>
  )
}
