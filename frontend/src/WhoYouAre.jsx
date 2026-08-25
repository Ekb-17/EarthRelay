import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus } from 'lucide-react'
import LocationPrompt, { GpsStatus, useGpsGate } from './LocationPrompt.jsx'
import { INCIDENT_TYPES, useEarthRelay } from './context.jsx'
import { needsSafety } from './routing.js'

const FIELD_HINT = {
  first: 'Please provide your first name.',
  gps: 'GPS is off. Turn Location on your phone. Continue stays locked until GPS is on.',
  photo: 'Please provide the photo of the incident.',
  category: 'Please select what you observed.',
}

function hasPin(pin) {
  return pin != null && Number.isFinite(Number(pin.lat)) && Number.isFinite(Number(pin.lng))
}

function gpsIsOn(gps) {
  return gps?.status?.kind === 'on' && !gps?.busy
}

function gpsPending(gps) {
  return Boolean(gps?.busy || gps?.status?.kind === 'asking' || gps?.status?.kind === 'idle')
}

function missingFields({ first, pin, file, incidentType, gps }) {
  const missing = []
  if (!first.trim()) missing.push('first')
  if (!gpsIsOn(gps) || !hasPin(pin)) missing.push('gps')
  if (!file) missing.push('photo')
  if (!incidentType) missing.push('category')
  return missing
}

function summaryMessage(missing) {
  const core = ['first', 'gps', 'photo', 'category']
  const relevant = missing.filter((item) => core.includes(item))
  if (relevant.length === core.length) return 'Please fill all missing blanks.'
  if (relevant.includes('first') && relevant.includes('gps') && relevant.includes('photo')) {
    return 'Please provide name, location, and photo first.'
  }
  return ''
}

function FieldError({ show, text }) {
  if (!show || !text) return null
  return <span className="field-error">{text}</span>
}

function useIsPhone() {
  const [phone, setPhone] = useState(() => !window.matchMedia('(min-width: 901px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 901px)')
    const sync = () => setPhone(!query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return phone
}

export default function WhoYouAre() {
  const navigate = useNavigate()
  const er = useEarthRelay()
  const [first, setFirst] = useState(er.firstName || '')
  const [last, setLast] = useState(er.lastName || '')
  const [phone, setPhone] = useState(er.phone || '')
  const [localError, setLocalError] = useState('')
  const [preview, setPreview] = useState('')
  const [group, setGroup] = useState('incident')
  const firstFly = useRef(true)

  const gps = useGpsGate({
    onFix: ({ lat, lng, accuracy }) => {
      er.setPin({ lat, lng, accuracy })
      if (firstFly.current) {
        firstFly.current = false
        er.setPlaceTarget({
          lat,
          lng,
          zoom: 18,
          name: 'You are here',
          label: 'You are here',
          pickedAt: Date.now(),
        })
      }
    },
  })

  useEffect(() => {
    if (!er.file) {
      setPreview('')
      return undefined
    }
    const url = URL.createObjectURL(er.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [er.file])

  useEffect(() => {
    er.chooseRole('citizen')
  }, [])

  const missing = useMemo(
    () =>
      missingFields({
        first,
        pin: er.pin,
        file: er.file,
        incidentType: er.incidentType,
        gps,
      }),
    [first, er.pin, er.file, er.incidentType, gps.status?.kind, gps.busy],
  )
  const canGo = missing.length === 0
  const incidentReady = !missing.includes('photo') && !missing.includes('category') && !missing.includes('gps')
  const summary = summaryMessage(missing)
  const gpsInvalid = missing.includes('gps') && !gpsPending(gps)
  const show = (key) => (key === 'gps' ? gpsInvalid : missing.includes(key))
  const onPhone = useIsPhone()

  function goToYou() {
    setLocalError('')
    if (!incidentReady) return
    setGroup('you')
    window.scrollTo(0, 0)
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (onPhone && group === 'incident') {
      goToYou()
      return
    }
    setLocalError('')
    if (missing.length || !gpsIsOn(gps) || !hasPin(er.pin)) return

    er.setIdentity({ first: first.trim(), last: last.trim(), phone: phone.trim(), role: 'citizen' })
    er.chooseRole('citizen')
    navigate(needsSafety(er.incidentType) ? '/safety' : '/confirm')
  }

  function pickPhoto(event) {
    const next = event.target.files?.[0]
    if (next) er.setFile(next)
    event.target.value = ''
  }

  return (
    <div className="who-page">
      <LocationPrompt gps={gps} />
      <form className="who-form" onSubmit={onSubmit} noValidate>
        <p className="kicker who-brand">EarthRelay</p>
        <div className={`who-gps who-gps-line ${show('gps') ? 'is-invalid' : ''}`}>
          <GpsStatus gps={gps} compact />
          {gps.status?.kind !== 'on' && (
            <button type="button" className="ghost-btn gps-btn" onClick={() => gps.request()}>
              {gps.busy ? 'Reading GPS…' : 'Try GPS again'}
            </button>
          )}
          <FieldError show={show('gps')} text={FIELD_HINT.gps} />
        </div>

        <div className="who-stepper" aria-label="Form steps">
          <span className={group === 'incident' ? 'is-current' : ''}>1 Incident</span>
          <span className="who-stepper-line" aria-hidden="true" />
          <span className={group === 'you' ? 'is-current' : ''}>2 You</span>
        </div>

        <div className="who-desk">
        <div className={`who-panel ${group === 'incident' ? 'is-open' : ''}`}>
          {!onPhone && <p className="who-col-title">Incident</p>}
          <div className={`who-step ${show('photo') ? 'is-invalid' : ''}`}>
            <p className="who-step-num">Photo</p>
            <label className={`who-photo-line ${show('photo') ? 'is-invalid' : ''}`}>
              <ImagePlus size={18} />
              <span>{er.file ? 'Change photo' : 'Add a photo'}</span>
              <input type="file" accept="image/*" onChange={pickPhoto} />
            </label>
            {preview ? (
              <img
                className="who-preview"
                src={preview}
                alt="Selected site photo"
                key={`${er.file?.name}-${er.file?.size}-${er.file?.lastModified}`}
              />
            ) : null}
            <FieldError show={show('photo')} text={FIELD_HINT.photo} />
          </div>

          <div className={`who-step ${show('category') ? 'is-invalid' : ''}`}>
            <p className="who-step-num">Incident type</p>
            <label className={show('category') ? 'is-invalid' : ''}>
              <span className="who-field-title">What you observed</span>
              <select value={er.incidentType} onChange={(event) => er.setIncidentType(event.target.value)}>
                <option value="">Select a category</option>
                {INCIDENT_TYPES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <FieldError show={show('category')} text={FIELD_HINT.category} />
            </label>
            <p className="pin-note">
              Required. The photo still decides the filed type if it clearly disagrees.
            </p>
            <label>
              <span className="who-field-title">
                Notes <em className="who-optional">optional</em>
              </span>
              <textarea
                placeholder="Anything responders should know"
                value={er.notes}
                onChange={(event) => er.setNotes(event.target.value)}
                rows={2}
              />
            </label>
          </div>

          {onPhone ? (
            <button
              type="button"
              className={`ghost-btn page-cta who-submit ${incidentReady ? '' : 'is-blocked'}`}
              disabled={!incidentReady}
              onClick={goToYou}
            >
              Next
            </button>
          ) : null}
        </div>

        <div className={`who-panel ${group === 'you' ? 'is-open' : ''}`}>
          {!onPhone && <p className="who-col-title">You</p>}
          <div className="who-step">
            <p className="who-step-num">Your name</p>
            <label className={show('first') ? 'is-invalid' : ''}>
              <span className="who-field-title">First name</span>
              <input
                autoComplete="given-name"
                value={first}
                onChange={(event) => setFirst(event.target.value)}
              />
              <FieldError show={show('first')} text={FIELD_HINT.first} />
            </label>
            <label>
              <span className="who-field-title">
                Last name <em className="who-optional">optional</em>
              </span>
              <input
                autoComplete="family-name"
                placeholder="optional"
                value={last}
                onChange={(event) => setLast(event.target.value)}
              />
            </label>
            <label>
              <span className="who-field-title">
                Phone number <em className="who-optional">optional</em>
              </span>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="e.g. 0314 9714765"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <p className="pin-note">Responders use it only if they need to follow up.</p>
            </label>
          </div>

          {(summary || localError || er.error) && <p className="banner">{summary || localError || er.error}</p>}

          <button
            type="submit"
            className={`ghost-btn page-cta who-submit ${canGo ? '' : 'is-blocked'}`}
            disabled={!canGo || er.uploading}
            aria-disabled={!canGo || er.uploading}
          >
            Continue
          </button>
        </div>
        </div>
      </form>
    </div>
  )
}
