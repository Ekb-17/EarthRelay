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

export async function fetchHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) return { status: 'down' }
  return response.json()
}

function apiErrorMessage(detail, fallback) {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => item?.msg || item?.message || '').filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  if (detail && typeof detail === 'object' && (detail.msg || detail.message)) {
    return detail.msg || detail.message
  }
  return fallback
}

export async function createCase(formData) {
  const response = await fetch('/api/cases', { method: 'POST', body: formData })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, 'Upload failed'))
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

export async function joinVolunteer(fields) {
  const response = await fetch('/api/volunteers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, 'Could not submit request'))
  }
  return response.json()
}

export async function volunteerSession(email, password, phone = '') {
  const response = await fetch('/api/volunteers/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, phone }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, 'Email or password is incorrect.'))
  }
  return response.json()
}

export async function forgotVolunteerPassword(email, phone) {
  const response = await fetch('/api/volunteers/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phone }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, 'Could not start password reset'))
  }
  return response.json()
}

export async function resetVolunteerPassword(email, phone, code, password) {
  const response = await fetch('/api/volunteers/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phone, code, password }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, 'Could not reset password'))
  }
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

export async function deleteCase(id) {
  const response = await fetch(`/api/cases/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return readJson(response, 'Could not delete case')
}

export async function fetchNearby(caseId, radiusM = 1000) {
  const response = await fetch(`/api/cases/${caseId}/nearby?radius_m=${radiusM}`)
  if (!response.ok) throw new Error('Could not load nearby cases')
  return response.json()
}

async function readJson(response, fallback) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(apiErrorMessage(payload.detail, fallback))
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


export async function updateVolunteer(id, fields) {
  const response = await fetch(`/api/volunteers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not update volunteer')
}

export async function setVolunteerPassword(id, password) {
  const response = await fetch(`/api/volunteers/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return readJson(response, 'Could not set volunteer password')
}

export async function changeVolunteerPassword(id, currentPassword, password) {
  const response = await fetch(`/api/volunteers/${encodeURIComponent(id)}/password/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, password }),
  })
  return readJson(response, 'Could not change password')
}

export async function deleteVolunteer(id) {
  const response = await fetch(`/api/volunteers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return readJson(response, 'Could not delete volunteer')
}

export async function fetchOrg() {
  const response = await fetch('/api/org')
  return readJson(response, 'Could not load organization')
}

export async function setupOrg(fields) {
  const response = await fetch('/api/org/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not set up organization login')
}

export async function orgSession(fields) {
  const response = await fetch('/api/org/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not sign in')
}

export async function updateOrg(fields) {
  const response = await fetch('/api/org', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not save settings')
}

export async function forgotOrgPassword(fields) {
  const response = await fetch('/api/org/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not send a verification code')
}

export async function resetOrgPassword(fields) {
  const response = await fetch('/api/org/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not reset password')
}

export async function setOrgRecovery(fields) {
  const response = await fetch('/api/org/recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not save recovery email')
}

export async function changeOrgPassword(fields) {
  const response = await fetch('/api/org/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not change password')
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

export async function fetchHelpline() {
  const response = await fetch('/api/helpline')
  return readJson(response, 'Could not load helpline')
}

export async function fetchEvalStatus() {
  const response = await fetch('/api/eval/status')
  return readJson(response, 'Could not load eval status')
}

export async function fetchStaff() {
  const response = await fetch('/api/staff')
  return readJson(response, 'Could not load staff')
}

export async function allotStaff(fields) {
  const response = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return readJson(response, 'Could not allot Staff ID')
}

export async function staffSession(cmsId, password, phone = '') {
  const response = await fetch('/api/staff/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cms_id: cmsId, password, phone }),
  })
  return readJson(response, 'Staff ID or password is incorrect.')
}

export async function setStaffPassword(cmsId, password) {
  const response = await fetch(`/api/staff/${encodeURIComponent(cmsId)}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return readJson(response, 'Could not set password')
}

export async function changeStaffPassword(cmsId, currentPassword, password) {
  const response = await fetch(`/api/staff/${encodeURIComponent(cmsId)}/password/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, password }),
  })
  return readJson(response, 'Could not change password')
}

export async function deleteStaff(cmsId) {
  const response = await fetch(`/api/staff/${encodeURIComponent(cmsId)}`, { method: 'DELETE' })
  return readJson(response, 'Could not delete staff')
}
