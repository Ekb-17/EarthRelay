import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  createCase,
  fetchAirQuality,
  fetchCases,
  fetchMapData,
  fetchWeather,
  updateCase,
} from './api.js'

const EarthRelayContext = createContext(null)

export const LAYERS = [
  { id: 'satellite', label: 'Satellite', detail: 'Photo overlay · zoom in', icon: 'satellite' },
  { id: 'earthquake', label: 'Earthquakes', detail: 'USGS M4.5+ last 7 days', icon: 'earthquake' },
  { id: 'tsunami', label: 'Tsunamis', detail: 'NOAA NCEI historical', icon: 'tsunami' },
  { id: 'flood', label: 'Floods', detail: 'NASA EONET + GDACS', icon: 'flood' },
  { id: 'weather', label: 'Weather', detail: 'Click a pin for wind and rain', icon: 'weather' },
  { id: 'air', label: 'Air quality', detail: 'Click a pin for AQI', icon: 'air' },
  { id: 'wildlife', label: 'Wildlife', detail: 'GBIF threatened species', icon: 'wildlife' },
  { id: 'protected', label: 'Protected areas', detail: 'Natural Earth + UNESCO', icon: 'protected' },
  { id: 'case', label: 'EarthRelay cases', detail: 'Uploaded investigation files', icon: 'case' },
]

export const INCIDENT_TYPES = [
  ['illegal_dumping', 'Illegal dumping'],
  ['plastic_waste', 'Plastic waste'],
  ['overflowing_garbage', 'Overflowing garbage'],
  ['construction_debris', 'Construction debris'],
  ['e_waste', 'E-waste'],
  ['tires_dumped', 'Tires dumped'],
  ['oil_spill', 'Oil spill (visible)'],
  ['sewage_discharge', 'Sewage discharge'],
  ['water_pollution', 'Possible water pollution'],
  ['wildfire_smoke', 'Wildfire / smoke'],
  ['grass_fire', 'Grass fire'],
  ['factory_smoke', 'Factory smoke'],
  ['burning_trash', 'Burning trash'],
  ['flood_damage', 'Flooding'],
  ['river_overflow', 'River overflow'],
  ['urban_flooding', 'Urban flooding'],
  ['erosion', 'Erosion / mudslide'],
  ['deforestation', 'Deforestation'],
  ['illegal_logging', 'Illegal tree cutting'],
  ['habitat_destruction', 'Habitat destruction'],
  ['wildlife', 'Wildlife issue'],
  ['injured_wildlife', 'Injured / trapped wildlife'],
  ['air_pollution', 'Air pollution / dust'],
  ['chemical_spill', 'Visible hazardous leak'],
  ['earthquake', 'Earthquake damage'],
  ['other', 'Other'],
]

export function isElevated(caseFile) {
  const priority = String(caseFile?.report?.priority || caseFile?.priority || 'LOW').toUpperCase()
  return priority === 'HIGH' || priority === 'MEDIUM'
}

export function EarthRelayProvider({ children }) {
  const [payload, setPayload] = useState(null)
  const [cases, setCases] = useState([])
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
  const [incidentType, setIncidentType] = useState('plastic_waste')
  const [role, setRole] = useState(() => sessionStorage.getItem('er-role') || 'citizen')
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
    air: true,
    wildlife: false,
    protected: false,
    case: true,
  })

  function chooseRole(next) {
    setRole(next)
    sessionStorage.setItem('er-role', next)
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
    setError('')
    try {
      const [mapData, caseData] = await Promise.all([fetchMapData(), fetchCases()])
      setPayload(mapData)
      setCases(caseData.cases || [])
    } catch (err) {
      setError(
        err.message.includes('failed') || err.message.includes('load')
          ? 'Could not reach the EarthRelay API. Start the backend on port 8000.'
          : err.message,
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      fetchCases()
        .then((caseData) => setCases(caseData.cases || []))
        .catch(() => {})
    }, 8000)
    return () => clearInterval(timer)
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
          setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        } catch {
          /* pin still used for next upload */
        }
      }
    }
    if (!layers.weather && !layers.air) return
    setInspect({ lat: next.lat, lng: next.lng, loading: true })
    try {
      const [weather, air] = await Promise.all([
        layers.weather ? fetchWeather(next.lat, next.lng) : null,
        layers.air ? fetchAirQuality(next.lat, next.lng) : null,
      ])
      setInspect({ lat: next.lat, lng: next.lng, weather, air })
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
      body.append('image', file)
      body.append('title', title)
      body.append('incident_type', incidentType)
      body.append('notes', notes)
      if (pin) {
        body.append('lat', String(pin.lat))
        body.append('lng', String(pin.lng))
        body.append('location_source', extra.locationSource || 'gps')
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
    setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleAssign(team, caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, { assigned_team: team })
    setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  async function handleClaim(caseId, name) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, {
      claimed_by: name || reporterName || 'EarthRelay desk',
    })
    setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    return updated
  }

  async function handleContact(fields, caseId) {
    const id = caseId || selectedId
    if (!id) return
    const updated = await updateCase(id, fields)
    setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)))
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
      chooseRole,
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
      handleInspect,
      handleUpload,
      handleStatus,
      handleAssign,
      handleClaim,
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
