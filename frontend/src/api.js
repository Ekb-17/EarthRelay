export async function fetchMapData() {
  const response = await fetch('/api/map-data')
  if (!response.ok) {
    throw new Error(`Map API failed (${response.status})`)
  }
  return response.json()
}

export async function fetchWeather(lat, lng) {
  const response = await fetch(`/api/weather?lat=${lat}&lng=${lng}`)
  if (!response.ok) throw new Error('Weather lookup failed')
  return response.json()
}

export async function fetchAirQuality(lat, lng) {
  const response = await fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
  if (!response.ok) throw new Error('Air quality lookup failed')
  return response.json()
}

export async function fetchCases() {
  const response = await fetch('/api/cases')
  if (!response.ok) throw new Error('Could not load cases')
  return response.json()
}

export async function createCase(formData) {
  const response = await fetch('/api/cases', { method: 'POST', body: formData })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || 'Upload failed')
  }
  return response.json()
}

export async function searchPlaces(query) {
  const q = query.trim()
  if (!q) return []
  const response = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=12`)
  if (!response.ok) throw new Error('Place search failed')
  const payload = await response.json()
  return payload.places || []
}

export async function updateCase(id, fields) {
  const body = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value != null && value !== '') body.append(key, value)
  })
  const response = await fetch(`/api/cases/${id}`, { method: 'PATCH', body })
  if (!response.ok) throw new Error('Could not update case')
  return response.json()
}
