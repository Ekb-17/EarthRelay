import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ASKING_GPS,
  IDLE_GPS,
  blockedGpsStatus,
  classifyGeoFailure,
  classifyGeoSuccess,
  queryGeoPermission,
} from './gps.js'

/** ~20 m in degrees at mid-latitudes — ignore tiny GPS jitter. */
function movedEnough(prev, next) {
  if (!prev) return true
  const dlat = prev.lat - next.lat
  const dlng = prev.lng - next.lng
  return dlat * dlat + dlng * dlng > 0.00018 * 0.00018
}

/** Prefer a clearly better fix (e.g. drop a stale city-level cache). */
function betterFix(prev, next) {
  if (!prev) return true
  if (movedEnough(prev, next)) return true
  const prevAcc = Number(prev.accuracy)
  const nextAcc = Number(next.accuracy)
  if (!Number.isFinite(prevAcc) || !Number.isFinite(nextAcc)) return false
  return nextAcc + 25 < prevAcc
}

const FRESH_GPS = { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
const WATCH_GPS = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }

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
    const blocked = blockedGpsStatus()
    if (blocked) {
      applyStatus(blocked)
      setOpen(true)
      return
    }
    setBusy(true)
    setStatus(ASKING_GPS)

    const onFix = (pos) => {
      setBusy(false)
      dismissedRef.current = false
      const next = classifyGeoSuccess(pos.coords)
      applyStatus(next)
      const fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }
      lastFixRef.current = fix
      onFixRef.current?.(fix)
    }

    // maximumAge: 0 — never reuse another visitor's / earlier session's cached fix
    // (that is what made Tarlai / Taramri stick for the next person on the same browser).
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onFix(pos)
        if (watchIdRef.current != null) return
        watchIdRef.current = navigator.geolocation.watchPosition(
          (nextPos) => {
            const fix = {
              lat: nextPos.coords.latitude,
              lng: nextPos.coords.longitude,
              accuracy: nextPos.coords.accuracy,
            }
            applyStatus(classifyGeoSuccess(nextPos.coords))
            if (betterFix(lastFixRef.current, fix)) {
              lastFixRef.current = fix
              onFixRef.current?.(fix)
            }
          },
          () => {},
          WATCH_GPS,
        )
      },
      async (err) => {
        setBusy(false)
        const permission = await queryGeoPermission()
        applyStatus(classifyGeoFailure(err, permission))
        setOpen(true)
        if (err?.code === 1 || permission === 'denied') {
          stopWatch()
        }
      },
      FRESH_GPS,
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
        setOpen(true)
        return
      }
      const permission = await queryGeoPermission()
      if (cancelled) return
      if (permission === 'denied') {
        applyStatus(classifyGeoFailure({ code: 1 }, permission))
        setOpen(true)
        return
      }
      if (permission === 'granted') {
        startWatch()
        return
      }
      setStatus({
        kind: 'idle',
        label: 'GPS not checked yet',
        hint: 'Tap Yes, then Allow. Phone Location must stay on.',
        prompt: {
          title: 'Use your location?',
          body: 'Turn Location on, tap Yes, then press Allow in the browser. That is what reads GPS on a phone.',
        },
      })
      setOpen(true)
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
  const showHint = Boolean(hint) && (!compact || kind === 'blocked')
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
