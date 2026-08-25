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

export async function fetchCases() {
  const response = await fetch('/api/cases')
  if (!response.ok) throw new Error('Could not load cases')
  return response.json()
}

export async function fetchHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) return { status: 'down' }
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

export async function reverseGeocode(lat, lng, { nearby = true } = {}) {
  const response = await fetch(
    `/api/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&nearby=${nearby ? 1 : 0}`,
  )
  if (!response.ok) throw new Error('Could not read street name')
  return response.json()
}

export async function updateCase(id, fields) {
  const body = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value != null && value !== '') body.append(key, String(value))
  })
  const response = await fetch(`/api/cases/${id}`, { method: 'PATCH', body })
  if (!response.ok) throw new Error('Could not update case')
  return response.json()
}

export async function fetchNearby(caseId, radiusM = 1000) {
  const response = await fetch(`/api/cases/${caseId}/nearby?radius_m=${radiusM}`)
  if (!response.ok) throw new Error('Could not load nearby cases')
  return response.json()
}

async function readJson(response, fallback) {
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || fallback)
  }
  return response.json()
}

export async function fetchVolunteers(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await fetch(`/api/volunteers${query}`)
  return readJson(response, 'Could not load volunteers')
}

export async function inviteVolunteer(fields) {
  const response = await fetch('/api/volunteers/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not send invitation')
}

export async function joinVolunteer(fields) {
  const response = await fetch('/api/volunteers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not submit request')
}

export async function volunteerSession(email, password) {
  const response = await fetch('/api/volunteers/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return readJson(response, 'Email or password is incorrect.')
}

export async function updateVolunteer(id, fields) {
  const response = await fetch(`/api/volunteers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not update volunteer')
}

export async function fetchOrg() {
  const response = await fetch('/api/org')
  return readJson(response, 'Could not load organization')
}

export async function updateOrg(fields) {
  const response = await fetch('/api/org', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not save settings')
}

export async function assignResponse(caseId, fields) {
  const response = await fetch(`/api/cases/${caseId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not assign response')
}

export async function fetchFieldTasks(volunteerId) {
  const response = await fetch(`/api/field/tasks?volunteer=${encodeURIComponent(volunteerId)}`)
  return readJson(response, 'Could not load tasks')
}

export async function fetchFieldTask(caseId, volunteerId) {
  const response = await fetch(
    `/api/field/tasks/${caseId}?volunteer=${encodeURIComponent(volunteerId)}`,
  )
  return readJson(response, 'Task not found')
}

export async function acceptFieldTask(caseId, volunteerId) {
  const response = await fetch(
    `/api/field/tasks/${caseId}/accept?volunteer=${encodeURIComponent(volunteerId)}`,
    { method: 'POST' },
  )
  return readJson(response, 'Could not accept task')
}
