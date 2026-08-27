import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createCase,
  fetchCases,
  fetchMapData,
  fetchWeather,
  updateCase,
} from './api.js'

const EarthRelayContext = createContext(null)

function orderCases(list) {
  return [...(list || [])].sort((a, b) => {
    const closedDiff = Number(a.status === 'resolved') - Number(b.status === 'resolved')
    if (closedDiff) return closedDiff
    const at = String(a.updated_at || a.created_at || '')
    const bt = String(b.updated_at || b.created_at || '')
    return bt.localeCompare(at)
  })
}

export const LAYERS = [
  { id: 'satellite', label: 'Satellite', detail: 'Photo overlay · zoom in', icon: 'satellite' },
  { id: 'earthquake', label: 'Earthquakes', detail: 'USGS M4.5+ last 7 days', icon: 'earthquake' },
  { id: 'tsunami', label: 'Tsunamis', detail: 'NOAA NCEI historical', icon: 'tsunami' },
  { id: 'flood', label: 'Floods', detail: 'NASA EONET + GDACS', icon: 'flood' },
  { id: 'weather', label: 'Weather', detail: 'Click a pin for wind and rain', icon: 'weather' },
  { id: 'wildlife', label: 'Wildlife', detail: 'GBIF threatened species', icon: 'wildlife' },
  { id: 'protected', label: 'Protected areas', detail: 'Natural Earth + UNESCO', icon: 'protected' },
  { id: 'case', label: 'EarthRelay cases', detail: 'Uploaded investigation files', icon: 'case' },
]

export const INCIDENT_TYPES = [
  ['illegal_dumping', 'Illegal dumping'],
  ['sewage_discharge', 'Sewage discharge'],
  ['deforestation', 'Deforestation'],
  ['wildlife', 'Wildlife issue'],
  ['erosion', 'Erosion / mudslide'],
  ['flood_damage', 'Flooding'],
  ['earthquake', 'Earthquake damage'],
  ['wildfire_smoke', 'Fire / smoke'],
  ['other', 'Other'],
]

const TYPE_LABELS = Object.fromEntries(INCIDENT_TYPES)
TYPE_LABELS.plastic_waste = 'Illegal dumping'
TYPE_LABELS.overflowing_garbage = 'Illegal dumping'
TYPE_LABELS.construction_debris = 'Illegal dumping'
TYPE_LABELS.e_waste = 'Illegal dumping'
TYPE_LABELS.tires_dumped = 'Illegal dumping'
TYPE_LABELS.oil_spill = 'Other'
TYPE_LABELS.chemical_spill = 'Other'
TYPE_LABELS.grass_fire = 'Fire / smoke'
TYPE_LABELS.burning_trash = 'Fire / smoke'
TYPE_LABELS.factory_smoke = 'Other'
TYPE_LABELS.air_pollution = 'Other'
TYPE_LABELS.river_overflow = 'Flooding'
TYPE_LABELS.urban_flooding = 'Flooding'
TYPE_LABELS.water_pollution = 'Flooding'
TYPE_LABELS.illegal_logging = 'Deforestation'
TYPE_LABELS.habitat_destruction = 'Deforestation'
TYPE_LABELS.injured_wildlife = 'Wildlife issue'

export function incidentTypeLabel(id) {
  if (TYPE_LABELS[id]) return TYPE_LABELS[id]
  const text = String(id || '').replaceAll('_', ' ').trim()
  if (!text || text === '.') return 'Not specified'
  return text
}

export function reporterDisplayName(caseFile) {
  const first = String(caseFile?.first_name || '').trim()
  const last = String(caseFile?.last_name || '').trim()
  const full = `${first} ${last}`.trim()
  if (full) return full
  const stored = String(caseFile?.reporter_name || '').trim()
  return stored || 'Citizen'
}

export function reporterMention(notes) {
  const text = String(notes || '').trim()
  return text ? `The reporter also mentioned: ${text}` : ''
}

export const KIND_LABELS = {
  flood: 'Flood',
  fire: 'Fire',
  waste: 'Waste',
  sewage: 'Sewage',
  erosion: 'Erosion',
  wildlife: 'Wildlife',
  collapse: 'Collapse',
  deforestation: 'Forest',
  indoor: 'Other',
}

const TYPE_TO_KIND = {
  flood_damage: 'flood',
  river_overflow: 'flood',
  urban_flooding: 'flood',
  water_pollution: 'flood',
  wildfire_smoke: 'fire',
  grass_fire: 'fire',
  burning_trash: 'fire',
  illegal_dumping: 'waste',
  plastic_waste: 'waste',
  overflowing_garbage: 'waste',
  construction_debris: 'waste',
  e_waste: 'waste',
  tires_dumped: 'waste',
  sewage_discharge: 'sewage',
  erosion: 'erosion',
  wildlife: 'wildlife',
  injured_wildlife: 'wildlife',
  deforestation: 'deforestation',
  illegal_logging: 'deforestation',
  habitat_destruction: 'deforestation',
  earthquake: 'collapse',
}

export function photoKindOf(caseFile) {
  const kind = String(caseFile?.report?.photo_kind || '').toLowerCase()
  if (KIND_LABELS[kind]) return kind
  return TYPE_TO_KIND[caseFile?.incident_type] || ''
}

export function displayCaseId(caseFile) {
  if (caseFile?.display_id) return caseFile.display_id
  if (!caseFile?.id) return ''
  return `ER-${String(caseFile.id).slice(-5).toUpperCase()}`
}

export function hasIncidentPhoto(caseFile) {
  if (!caseFile || caseFile.has_photo === false) return false
  return Boolean(caseFile.has_photo || caseFile.image_url)
}

function compressPhoto(file) {
  if (!file || !file.type.startsWith('image/')) return Promise.resolve(file)
  if (file.size < 900 * 1024) return Promise.resolve(file)
  return new Promise((resolve) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const max = 1600
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.72,
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    image.src = url
  })
}

export function caseStats(cases) {
  const list = cases || []
  const categories = {}
  let active = 0
  let high = 0
  let pending = 0
  for (const item of list) {
    if (item.status !== 'resolved') active += 1
    const priority = String(item.report?.priority || item.priority || '').toUpperCase()
    if (priority === 'HIGH') high += 1
    if (item.status === 'pending') pending += 1
    const kind = photoKindOf(item)
    if (kind) categories[kind] = (categories[kind] || 0) + 1
  }
  return { total: list.length, active, high, pending, categories }
}

export function primaryConfidence(report) {
  let best = null
  const conf = report?.confidence
  if (conf && typeof conf === 'object' && !Array.isArray(conf)) {
    for (const value of Object.values(conf)) {
      const n = Number(value)
      if (!Number.isFinite(n)) continue
      const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
      if (best == null || pct > best) best = pct
    }
  }
  for (const item of report?.detected || []) {
    if (item?.confidence == null) continue
    const n = Number(item.confidence)
    if (!Number.isFinite(n)) continue
    const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
    if (best == null || pct > best) best = pct
  }
  return best
}

export function isElevated(caseFile) {
  const priority = String(caseFile?.report?.priority || caseFile?.priority || 'LOW').toUpperCase()
  return priority === 'HIGH' || priority === 'MEDIUM'
}

export function EarthRelayProvider({ children }) {
  const [payload, setPayload] = useState(null)
  const [cases, setCases] = useState([])
  const deletedIdsRef = useRef(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [inspect, setInspect] = useState(null)
  const [pin, setPin] = useState(null)
  const [placeTarget, setPlaceTarget] = useState(null)
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [incidentType, setIncidentType] = useState('')
  const [role, setRole] = useState(() => {
    const stored = sessionStorage.getItem('er-role') || 'citizen'
    if (stored === 'ngo') {
      sessionStorage.removeItem('er-org-auth')
      sessionStorage.setItem('er-role', 'citizen')
      return 'citizen'
    }
    return stored
  })
  const [volunteer, setVolunteerState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('er-volunteer') || 'null')
    } catch {
      return null
    }
  })
  const [staff, setStaffState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('er-staff') || 'null')
    } catch {
      return null
    }
  })
  const [orgAuth, setOrgAuthState] = useState(null)
  const [firstName, setFirstName] = useState(() => sessionStorage.getItem('er-first') || '')
  const [lastName, setLastName] = useState(() => sessionStorage.getItem('er-last') || '')
  const [phone, setPhone] = useState(() => sessionStorage.getItem('er-phone') || '')
  const [reporterName, setReporterName] = useState(() => sessionStorage.getItem('er-desk') || '')
  const [layers, setLayers] = useState({
    satellite: false,
    earthquake: true,
    tsunami: true,
    flood: true,
    weather: true,
    wildlife: false,
    protected: false,
    case: true,
  })

  function chooseRole(next) {
    setRole(next)
    sessionStorage.setItem('er-role', next)
    if (next !== 'volunteer') {
      setVolunteerState(null)
      sessionStorage.removeItem('er-volunteer')
    }
    if (next !== 'staff') {
      setStaffState(null)
      sessionStorage.removeItem('er-staff')
    }
    if (next === 'citizen' || next === 'volunteer') {
      setOrgAuthState(null)
    }
  }

  function setVolunteer(next) {
    setVolunteerState(next)
    if (next) {
      sessionStorage.setItem('er-volunteer', JSON.stringify(next))
      chooseRole('volunteer')
    } else {
      sessionStorage.removeItem('er-volunteer')
    }
  }

  function setStaff(next) {
    setStaffState(next)
    if (next) {
      sessionStorage.setItem('er-staff', JSON.stringify(next))
      chooseRole('staff')
      if (next.name) {
        setReporterName(next.name)
        sessionStorage.setItem('er-desk', next.name)
      }
    } else {
      sessionStorage.removeItem('er-staff')
    }
  }

  function setOrgAuth(next) {
    setOrgAuthState(next)
    if (next) chooseRole('ngo')
  }

  function setIdentity({ first, last, phone: nextPhone, role: nextRole }) {
    if (first != null) {
      setFirstName(first)
      sessionStorage.setItem('er-first', first)
    }
    if (last != null) {
      setLastName(last)
      sessionStorage.setItem('er-last', last)
    }
    if (nextPhone != null) {
      setPhone(nextPhone)
      sessionStorage.setItem('er-phone', nextPhone)
    }
    if (nextRole) chooseRole(nextRole)
    const full = `${first ?? firstName} ${last ?? lastName}`.trim()
    if (full) {
      setReporterName(full)
      sessionStorage.setItem('er-desk', full)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const caseData = await fetchCases()
      applyCases(caseData.cases || [])
      setError('')
    } catch (err) {
      setError(
        err.message.includes('failed') || err.message.includes('load')
          ? 'Could not reach the EarthRelay API. Start the backend on port 8000.'
          : err.message,
      )
    }
    try {
      const mapData = await fetchMapData()
      setPayload(mapData)
    } catch {
      /* map layers can fail without blocking the inbox */
    } finally {
      setLoading(false)
    }
  }

  function applyCases(list) {
    const blocked = deletedIdsRef.current
    setCases(orderCases((list || []).filter((item) => !blocked.has(item.id))))
  }

  function forgetCase(id) {
    deletedIdsRef.current.add(id)
    setCases((current) => current.filter((item) => item.id !== id))
  }

  function restoreCase(item) {
    if (!item?.id) return
    deletedIdsRef.current.delete(item.id)
    setCases((current) => orderCases([...current.filter((row) => row.id !== item.id), item]))
  }

  useEffect(() => {
    sessionStorage.removeItem('er-org-auth')
    function onPageShow(event) {
      if (event.persisted) setOrgAuthState(null)
    }
    window.addEventListener('pageshow', onPageShow)
    load()
    const timer = setInterval(() => {
      fetchCases()
        .then((caseData) => applyCases(caseData.cases || []))
        .catch(() => {})
    }, 8000)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('er-desk', reporterName)
  }, [reporterName])

  const selectedCase = cases.find((item) => item.id === selectedId) || null

  async function handleInspect(lngLat) {
    const next = { lat: lngLat.lat, lng: lngLat.lng }
    setPin(next)
    if (selectedId) {
      const open = cases.find((item) => item.id === selectedId)
      if (open && (open.lat == null || open.lng == null)) {
        try {
          const updated = await updateCase(selectedId, { ...next, location_source: 'map_pin' })
          setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
        } catch {
          /* pin still used for next upload */
        }
      }
    }
    if (!layers.weather) return
    setInspect({ lat: next.lat, lng: next.lng, loading: true })
    try {
      const weather = await fetchWeather(next.lat, next.lng)
      setInspect({ lat: next.lat, lng: next.lng, weather })
    } catch (err) {
      setInspect({ lat: next.lat, lng: next.lng, error: err.message })
    }
  }

  async function handleUpload(extra = {}) {
    if (!file) {
      setError('Choose an image to open a case.')
      return null
    }
    const nextRole = extra.role || role
    const nextFirst = extra.firstName ?? firstName
    const nextLast = extra.lastName ?? lastName
    const nextPhone = extra.phone ?? phone
    setUploading(true)
    setError('')
    try {
      const body = new FormData()
      const upload = await compressPhoto(file)
      body.append('image', upload)
      body.append('title', title)
      body.append('incident_type', incidentType || 'other')
      body.append('notes', notes)
      if (pin) {
        body.append('lat', String(pin.lat))
        body.append('lng', String(pin.lng))
        body.append('location_source', extra.locationSource || (pin.accuracy != null ? 'gps' : 'map_pin'))
        if (pin.accuracy != null) body.append('location_accuracy_m', String(pin.accuracy))
      }
      body.append('reporter_role', nextRole)
      const fullName = `${nextFirst} ${nextLast}`.trim() || reporterName
      body.append('reporter_name', fullName)
      body.append('first_name', nextFirst)
      body.append('last_name', nextLast)
      if (nextPhone) body.append('phone', nextPhone)
      const created = await createCase(body)
      setFile(null)
      setTitle('')
      setNotes('')
      setSelectedId(created.id)
      await load()
      return created
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handleStatus(status, caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, { status })
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
  }

  async function handleEscalate(caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, { priority: 'HIGH', detail: 'Escalated.' })
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
  }

  async function handleAssign(team, caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, { assigned_team: team })
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
  }

  async function handleClaim(caseId, name) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, {
      claimed_by: name || reporterName || 'EarthRelay desk',
    })
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
    return updated
  }

  async function handleActivity(caseId, { kind, result }) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, {
      activity_kind: kind,
      activity_result: result,
      activity_by: reporterName || `${firstName} ${lastName}`.trim(),
    })
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
    return updated
  }

  async function handleContact(fields, caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, fields)
    setCases((current) => orderCases(current.map((item) => (item.id === updated.id ? updated : item))))
    if (fields.lat != null && fields.lng != null) {
      const lat = Number(fields.lat)
      const lng = Number(fields.lng)
      setPin({ lat, lng })
      setPlaceTarget({
        lat,
        lng,
        zoom: 17,
        name: 'You are here',
        label: 'You are here',
        pickedAt: Date.now(),
      })
    }
    return updated
  }

  const value = useMemo(
    () => ({
      payload,
      cases,
      error,
      loading,
      uploading,
      selectedId,
      setSelectedId,
      inspect,
      pin,
      placeTarget,
      setPlaceTarget,
      setPin,
      file,
      setFile,
      title,
      setTitle,
      notes,
      setNotes,
      incidentType,
      setIncidentType,
      role,
      volunteer,
      staff,
      orgAuth,
      chooseRole,
      setVolunteer,
      setStaff,
      setOrgAuth,
      firstName,
      lastName,
      phone,
      setIdentity,
      reporterName,
      setReporterName,
      layers,
      setLayers,
      selectedCase,
      load,
      forgetCase,
      restoreCase,
      handleInspect,
      handleUpload,
      handleStatus,
      handleEscalate,
      handleAssign,
      handleClaim,
      handleActivity,
      handleContact,
    }),
    [
      payload,
      cases,
      error,
      loading,
      uploading,
      selectedId,
      inspect,
      pin,
      placeTarget,
      file,
      title,
      notes,
      incidentType,
      role,
      volunteer,
      staff,
      orgAuth,
      firstName,
      lastName,
      phone,
      reporterName,
      layers,
      selectedCase,
    ],
  )

  return <EarthRelayContext.Provider value={value}>{children}</EarthRelayContext.Provider>
}

export function useEarthRelay() {
  const ctx = useContext(EarthRelayContext)
  if (!ctx) throw new Error('EarthRelay context missing')
  return ctx
}
