import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { searchPlaces } from './api.js'

export default function PlaceSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      setOpen(false)
      return undefined
    }
    const timer = setTimeout(async () => {
      try {
        const places = await searchPlaces(q)
        setHits(places)
        setOpen(places.length > 0)
        setActive(0)
      } catch {
        setHits([])
        setOpen(false)
      }
    }, q.length === 1 ? 60 : 220)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function onDocClick(event) {
      if (!boxRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(place) {
    if (!place) return
    setQuery(place.label || place.name)
    setOpen(false)
    onSelect?.(place)
  }

  function onKeyDown(event) {
    if (!open || hits.length === 0) {
      if (event.key === 'Enter' && hits[0]) choose(hits[0])
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(hits[active] || hits[0])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="place-search" ref={boxRef}>
      <Search size={16} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search Pakistan, Norway, Lagos…"
        aria-label="Search places"
        autoComplete="off"
      />
      {open && (
        <ul className="place-hits">
          {hits.map((place, index) => (
            <li key={place.id}>
              <button
                type="button"
                className={index === active ? 'is-active' : ''}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(place)}
              >
                <strong>{place.name}</strong>
                <small>
                  {place.kind}
                  {place.country && place.country !== place.name ? ` · ${place.country}` : ''}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
