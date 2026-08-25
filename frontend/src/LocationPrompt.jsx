import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ASKING_GPS,
  IDLE_GPS,
  blockedGpsStatus,
  classifyGeoFailure,
  classifyGeoSuccess,
  queryGeoPermission,
} from './gps.js'

const GEO_WATCH = { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 }

function movedEnough(prev, next) {
  if (!prev) return true
  const dlat = prev.lat - next.lat
  const dlng = prev.lng - next.lng
  return dlat * dlat + dlng * dlng > 0.00018 * 0.00018
}

export function useGpsGate({ onFix, autoCheck = true } = {}) {
  const onFixRef = useRef(onFix)
  onFixRef.current = onFix
  const dismissedRef = useRef(false)
  const watchIdRef = useRef(null)
  const lastFixRef = useRef(null)
  const [status, setStatus] = useState(IDLE_GPS)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const applyStatus = useCallback((next) => {
    setStatus(next)
    setOpen(false)
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      applyStatus({
        kind: 'blocked',
        label: 'GPS is off',
        hint: 'This browser cannot read location.',
      })
      return
    }
    if (watchIdRef.current != null) return
    setBusy(true)
    setStatus(ASKING_GPS)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setBusy(false)
        dismissedRef.current = false
        const next = classifyGeoSuccess(pos.coords)
        applyStatus(next)
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }
        if ((next.kind === 'on' || next.kind === 'broken') && movedEnough(lastFixRef.current, fix)) {
          lastFixRef.current = fix
          onFixRef.current?.(fix)
        }
      },
      async (err) => {
        setBusy(false)
        const permission = await queryGeoPermission()
        applyStatus(classifyGeoFailure(err, permission))
        if (err?.code === 1 || permission === 'denied') {
          stopWatch()
        }
      },
      GEO_WATCH,
    )
  }, [applyStatus, stopWatch])

  const request = useCallback(() => {
    dismissedRef.current = false
    stopWatch()
    startWatch()
  }, [startWatch, stopWatch])

  const onYes = useCallback(() => {
    dismissedRef.current = false
    request()
  }, [request])

  const onNo = useCallback(() => {
    dismissedRef.current = true
    stopWatch()
    setOpen(false)
    setStatus({
      kind: 'off',
      label: 'GPS is off',
      hint: 'Location is off. Turn it on in your phone settings. Continue stays locked until GPS is on.',
    })
  }, [stopWatch])

  useEffect(() => {
    if (!autoCheck) return undefined
    let cancelled = false
    let permissionStatus = null

    async function boot() {
      if (cancelled) return
      const blocked = blockedGpsStatus()
      if (blocked) {
        applyStatus(blocked)
        return
      }
      const permission = await queryGeoPermission()
      if (cancelled) return
      if (permission === 'denied') {
        applyStatus(classifyGeoFailure({ code: 1 }, permission))
        return
      }
      startWatch()
    }

    boot()

    function onVisible() {
      if (document.visibilityState !== 'visible' || cancelled) return
      if (watchIdRef.current == null) boot()
    }
    document.addEventListener('visibilitychange', onVisible)

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((statusObj) => {
          if (cancelled) return
          permissionStatus = statusObj
          statusObj.onchange = () => {
            if (cancelled) return
            stopWatch()
            boot()
          }
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (permissionStatus) permissionStatus.onchange = null
      stopWatch()
    }
  }, [autoCheck, applyStatus, startWatch, stopWatch])

  return { status, open, busy, request, onYes, onNo }
}

export function GpsStatus({ gps, compact = false }) {
  const { status, busy } = gps
  const kind = busy ? 'asking' : status.kind
  const label = busy ? ASKING_GPS.label : status.label
  const hint = busy ? ASKING_GPS.hint : status.hint
  const showHint = Boolean(hint) && !compact
  return (
    <div className={`gps-status gps-status-${kind}`} role="status">
      <strong>{label}</strong>
      {showHint && <span>{hint}</span>}
    </div>
  )
}

export function NearbyPlaces({ places }) {
  if (!places?.length) return null
  return (
    <ul className="gps-nearby">
      {places.map((item) => (
        <li key={`${item.kind}-${item.name}-${item.distance_m}`}>
          <strong>{item.kind}</strong> {item.name}
          {item.distance_m != null ? <em> · {item.distance_m} m</em> : null}
        </li>
      ))}
    </ul>
  )
}

export default function LocationPrompt({ onFix, gps: external, autoCheck = true }) {
  const internal = useGpsGate({ onFix, autoCheck: !external && autoCheck })
  const gps = external || internal
  const { status, open, busy, onYes, onNo } = gps
  if (!open) return null
  const title = status.prompt?.title || 'Turn on / allow location?'
  const body = status.prompt?.body || status.hint

  return (
    <div className="loc-modal-backdrop" role="presentation">
      <div className="loc-modal" role="dialog" aria-modal="true" aria-labelledby="loc-modal-title">
        <h2 id="loc-modal-title">{title}</h2>
        <p>{body}</p>
        <div className="loc-modal-actions">
          <button type="button" className="ghost-btn" onClick={onNo} disabled={busy}>
            No
          </button>
          <button type="button" className="ghost-btn page-cta" onClick={onYes} disabled={busy}>
            {busy ? 'Asking GPS…' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  )
}
