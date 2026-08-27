import { useEffect, useRef, useState } from 'react'

const UNDO_SEC = 5

export function useTimedDelete(commitFn) {
  const [pending, setPending] = useState(null)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)
  const tickRef = useRef(null)

  function clearTimers() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (tickRef.current) window.clearInterval(tickRef.current)
    timerRef.current = null
    tickRef.current = null
  }

  async function flush() {
    const current = pendingRef.current
    clearTimers()
    pendingRef.current = null
    setPending(null)
    if (current) await commitFn(current.item)
  }

  function requestDelete(item, label) {
    if (pendingRef.current) {
      const prev = pendingRef.current
      clearTimers()
      pendingRef.current = null
      commitFn(prev.item)
    }
    const next = { item, label, left: UNDO_SEC }
    pendingRef.current = next
    setPending(next)
    tickRef.current = window.setInterval(() => {
      setPending((cur) => {
        if (!cur) return cur
        const left = Math.max(0, cur.left - 1)
        const updated = { ...cur, left }
        pendingRef.current = updated
        return updated
      })
    }, 1000)
    timerRef.current = window.setTimeout(() => {
      flush()
    }, UNDO_SEC * 1000)
  }

  function undo() {
    clearTimers()
    pendingRef.current = null
    setPending(null)
  }

  function isPending(id) {
    return pending?.item?.id === id || pending?.item?.cms_id === id
  }

  useEffect(
    () => () => {
      const current = pendingRef.current
      clearTimers()
      pendingRef.current = null
      if (current) commitFn(current.item)
    },
    [],
  )

  return { pending, requestDelete, undo, isPending }
}

export function UndoToast({ pending, onUndo }) {
  if (!pending) return null
  return (
    <div className="undo-toast" role="status">
      <p>
        Undo in {pending.left} sec, or data will be deleted
        {pending.label ? ` · ${pending.label}` : ''}
      </p>
      <button type="button" className="ghost-btn" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
