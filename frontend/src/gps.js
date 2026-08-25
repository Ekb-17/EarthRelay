export function queryGeoPermission() {
  if (!navigator.permissions?.query) return Promise.resolve('prompt')
  return navigator.permissions
    .query({ name: 'geolocation' })
    .then((status) => status.state)
    .catch(() => 'prompt')
}

export function gpsPageStatus() {
  if (!navigator.geolocation) {
    return { ok: false, text: 'This browser cannot read location.' }
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      text: 'Your phone GPS is on, but this page is not a real https:// site, so the browser blocks location. Open the https EarthRelay link (not http, not localhost on the phone).',
    }
  }
  return {
    ok: true,
    text: 'This is a secure page. Location is read automatically when GPS is on.',
  }
}

export function geoErrorMessage(err) {
  const code = err?.code
  if (!window.isSecureContext) {
    return 'Browser blocked location because the page is not https. Open the https EarthRelay link.'
  }
  if (code === 1) {
    return 'Location is blocked for this site. Allow location in the browser, then GPS turns green by itself.'
  }
  if (code === 2) {
    return 'GPS is off or has no fix yet. Turn Location on in Settings. This box turns green by itself when a fix arrives.'
  }
  if (code === 3) {
    return 'GPS timed out. Keep Location on. This box turns green by itself when a fix arrives.'
  }
  return 'Could not read GPS. Turn Location on in your phone settings.'
}

export function blockedGpsStatus() {
  if (!navigator.geolocation) {
    return {
      kind: 'blocked',
      label: 'GPS is off',
      hint: 'This browser cannot read location.',
    }
  }
  if (!window.isSecureContext) {
    return {
      kind: 'blocked',
      label: 'GPS is off',
      hint: 'Phone GPS can be on, but this http page cannot read it. Open the https EarthRelay link.',
    }
  }
  return null
}

export function classifyGeoSuccess(coords) {
  const meters = Math.round(coords?.accuracy || 0)
  if (meters > 80) {
    return {
      kind: 'on',
      label: 'GPS is on',
      hint: `Live fix. Pin is within about ${meters} m — waiting for a closer street-level lock.`,
    }
  }
  return {
    kind: 'on',
    label: 'GPS is on',
    hint: `Live street-level fix, within about ${meters} m.`,
  }
}

export function classifyGeoFailure(err, permission) {
  const blocked = blockedGpsStatus()
  if (blocked) return blocked
  const code = err?.code
  if (code === 1 || permission === 'denied') {
    return {
      kind: 'off',
      label: 'GPS is off',
      hint: 'Location is not allowed for this site. Allow it in the browser. Continue stays locked until GPS is on.',
    }
  }
  if (code === 2 || code === 3) {
    return {
      kind: 'off',
      label: 'GPS is off',
      hint:
        code === 3
          ? 'No GPS fix yet. Keep Location on. This turns green by itself when the phone gets a lock. Continue stays locked until then.'
          : 'Location looks off, or there is no GPS signal yet. Turn Location on in Settings. This turns green by itself when a fix arrives. Continue stays locked until then.',
    }
  }
  return {
    kind: 'off',
    label: 'GPS is off',
    hint: geoErrorMessage(err),
  }
}

export const IDLE_GPS = {
  kind: 'idle',
  label: 'Checking GPS…',
  hint: 'Location is read automatically. No extra button is required.',
}

export const ASKING_GPS = {
  kind: 'asking',
  label: 'Reading GPS…',
  hint: 'If the browser asks Allow, press Allow. After that, this turns green by itself when GPS is on.',
}
