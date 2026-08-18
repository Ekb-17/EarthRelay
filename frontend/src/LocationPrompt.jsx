import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ASKING_GPS,
  IDLE_GPS,
  blockedGpsStatus,
  classifyGeoFailure,
  classifyGeoSuccess,
  queryGeoPermission,
} from './gps.js'

const GEO_OPTS = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }

export function useGpsGate({ onFix, autoCheck = true } = {}) {
  const onFixRef = useRef(onFix)
  onFixRef.current = onFix
  const dismissedRef = useRef(false)
  const [status, setStatus] = useState(IDLE_GPS)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const applyStatus = useCallback((next, { openPrompt = false } = {}) => {
    setStatus(next)
    if (next.kind === 'on') {
      setOpen(false)
      return
    }
    if (openPrompt && next.prompt && !dismissedRef.current) {
      setOpen(true)
    } else if (!next.prompt) {
      setOpen(false)
    }
  }, [])

  const readPosition = useCallback(
    ({ openPromptOnFail = false, quiet = false } = {}) => {
      const blocked = blockedGpsStatus()
      if (blocked) {
        applyStatus(blocked, { openPrompt: openPromptOnFail })
        return
      }
      if (!quiet) {
        setBusy(true)
        setStatus(ASKING_GPS)
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBusy(false)
          dismissedRef.current = false
          const next = classifyGeoSuccess(pos.coords)
          applyStatus(next)
          if (next.kind === 'on' || next.kind === 'broken') {
            onFixRef.current?.({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            })
          }
        },
        async (err) => {
          setBusy(false)
          const permission = await queryGeoPermission()
          applyStatus(classifyGeoFailure(err, permission), {
            openPrompt: openPromptOnFail,
          })
        },
        GEO_OPTS,
      )
    },
    [applyStatus],
  )

  const request = useCallback(() => {
    dismissedRef.current = false
    readPosition({ openPromptOnFail: true, quiet: false })
  }, [readPosition])

  const onYes = useCallback(() => {
    dismissedRef.current = false
    readPosition({ openPromptOnFail: true, quiet: false })
  }, [readPosition])

  const onNo = useCallback(() => {
    dismissedRef.current = true
    setOpen(false)
    setStatus((prev) =>
      prev.kind === 'asking' || prev.kind === 'idle'
        ? {
            kind: 'off',
            label: 'GPS is off',
            hint: 'You chose No. Tap Use GPS when you want to turn it on.',
            prompt: prev.prompt,
          }
        : prev,
    )
  }, [])

  useEffect(() => {
    if (!autoCheck) return undefined
    let cancelled = false
    let permissionStatus = null

    async function check() {
      if (cancelled) return
      const blocked = blockedGpsStatus()
      if (blocked) {
        applyStatus(blocked, { openPrompt: true })
        return
      }
      const permission = await queryGeoPermission()
      if (cancelled) return
      if (permission === 'denied') {
        applyStatus(classifyGeoFailure({ code: 1 }, permission), { openPrompt: true })
        return
      }
      if (permission === 'granted') {
        readPosition({ openPromptOnFail: false, quiet: true })
        return
      }
      applyStatus(
        {
          kind: 'off',
          label: 'GPS is off',
          hint: 'Location is not allowed yet. Tap Yes to turn it on.',
          prompt: {
            title: 'Turn on / allow location?',
            body: 'Location is off or not allowed for EarthRelay. Turn on Location / GPS, then tap Yes. The next popup is the browser asking Allow.',
          },
        },
        { openPrompt: true },
      )
    }

    check()

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    queryGeoPermission().then(() => {
      if (cancelled || !navigator.permissions?.query) return
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((statusObj) => {
          permissionStatus = statusObj
          statusObj.onchange = () => {
            if (!cancelled) check()
          }
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [autoCheck, applyStatus, readPosition])

  return { status, open, busy, request, onYes, onNo }
}

export function GpsStatus({ gps }) {
  const { status, busy } = gps
  const kind = busy ? 'asking' : status.kind
  const label = busy ? ASKING_GPS.label : status.label
  const hint = busy ? ASKING_GPS.hint : status.hint
  return (
    <div className={`gps-status gps-status-${kind}`} role="status">
      <strong>{label}</strong>
      {hint && <span>{hint}</span>}
    </div>
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
