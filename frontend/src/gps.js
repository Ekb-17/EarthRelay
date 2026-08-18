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
    text: 'This is a secure page. Press Use GPS, then Allow. You should jump to your street on the map.',
  }
}

export function geoErrorMessage(err) {
  const code = err?.code
  if (!window.isSecureContext) {
    return 'Browser blocked location because the page is not https. Open the https EarthRelay link.'
  }
  if (code === 1) {
    return 'You need to Allow location for this site. Phone GPS being on is not enough until you press Allow in the browser.'
  }
  if (code === 2) {
    return 'No GPS fix yet. Keep Location on, wait outside or by a window, then press Use GPS again.'
  }
  if (code === 3) {
    return 'GPS timed out. Keep Location on and try Use GPS again.'
  }
  return 'Could not read GPS. Press Allow, or tap the map on your street.'
}

export function blockedGpsStatus() {
  if (!navigator.geolocation) {
    return {
      kind: 'blocked',
      label: 'GPS is not available',
      hint: 'This browser cannot read location.',
      prompt: {
        title: 'Location is not available',
        body: 'This browser cannot read GPS.',
      },
    }
  }
  if (!window.isSecureContext) {
    return {
      kind: 'blocked',
      label: 'GPS is blocked on this page',
      hint: 'Open the https:// EarthRelay link. HTTP pages cannot use GPS.',
      prompt: {
        title: 'Location is blocked on this page',
        body: 'Open the https:// EarthRelay link on your phone. Then we can ask to turn location on.',
      },
    }
  }
  return null
}

export function classifyGeoSuccess(coords) {
  const meters = Math.round(coords?.accuracy || 0)
  if (meters > 1000) {
    return {
      kind: 'broken',
      label: 'GPS is on but not working',
      hint: `Location is allowed, but this is only a network/Wi-Fi guess (±${meters} m), not a real GPS fix. Check your connection, turn Location on, or try outdoors.`,
    }
  }
  return {
    kind: 'on',
    label: 'GPS is on · allowed',
    hint: `Allowed. Pin is within about ${meters} m.`,
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
      hint: 'Location is not allowed. Turn it on, then tap Yes.',
      prompt: {
        title: 'Turn on / allow location?',
        body: 'Location is off or blocked for EarthRelay. Turn on Location / GPS, then tap Yes. The next popup is the browser asking Allow.',
      },
    }
  }
  if (code === 2 || code === 3) {
    if (permission === 'granted') {
      return {
        kind: 'broken',
        label: 'GPS is on but not working',
        hint:
          code === 3
            ? 'Location is allowed, but the fix timed out. Check network, wait outdoors, then tap Use GPS again.'
            : 'Location is allowed, but the phone could not get a fix. Check network, GPS signal, or try outdoors.',
      }
    }
    return {
      kind: 'off',
      label: 'GPS is off',
      hint: 'Turn Location / GPS on in Settings, then tap Yes.',
      prompt: {
        title: 'Turn on / allow location?',
        body: 'GPS looks off on this phone. Turn Location on in Settings, come back, and tap Yes.',
      },
    }
  }
  return {
    kind: 'off',
    label: 'GPS is off',
    hint: geoErrorMessage(err),
    prompt: {
      title: 'Turn on / allow location?',
      body: `${geoErrorMessage(err)} Tap Yes to try again.`,
    },
  }
}

export const IDLE_GPS = {
  kind: 'idle',
  label: 'GPS not checked yet',
  hint: 'Tap Use GPS. If it is off, we will ask to turn it on.',
}

export const ASKING_GPS = {
  kind: 'asking',
  label: 'Asking for GPS…',
  hint: 'If the browser asks Allow, press Allow.',
}
