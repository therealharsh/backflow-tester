'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Suggestion } from '@/app/api/suggest/route'

// Simple slug helper (mirrors Python slugify)
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Known state names → codes (for fallback parsing)
const STATE_LOOKUP: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx',
  utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy',
}

function parseFallback(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^\d{5}$/.test(v)) return `/search?query=${v}`
  const withState = v.match(/^(.+?)[,\s]+([a-zA-Z]{2})$/)
  if (withState) return `/${withState[2].toLowerCase()}/${slugify(withState[1])}`
  if (/^[a-zA-Z]{2}$/.test(v)) return `/${v.toLowerCase()}`
  const stateLower = v.toLowerCase()
  if (STATE_LOOKUP[stateLower]) return `/${STATE_LOOKUP[stateLower]}`
  return `/search?query=${encodeURIComponent(v)}`
}

// Highlight matching prefix in suggestion label
function HighlightMatch({ text, query }: { text: string; query: string }) {
  // Strip the ", ST" part for matching purposes
  const cleanQuery = query.replace(/[,\s]+[a-zA-Z]{0,2}$/, '').trim()
  if (!cleanQuery || !text.toLowerCase().startsWith(cleanQuery.toLowerCase())) {
    return <span>{text}</span>
  }
  return (
    <span>
      <span className="font-semibold text-gray-900">{text.slice(0, cleanQuery.length)}</span>
      <span className="text-gray-600">{text.slice(cleanQuery.length)}</span>
    </span>
  )
}

const ICON_CITY = (
  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const ICON_STATE = (
  <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
  </svg>
)

const ICON_ZIP = (
  <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

export default function HeroSearch() {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!q.trim()) {
      setSuggestions([])
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`)
        const data: Suggestion[] = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 220)
  }, [])

  useEffect(() => {
    fetchSuggestions(value)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, fetchSuggestions])

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function navigate(href: string) {
    setOpen(false)
    setSuggestions([])
    setValue('')
    router.push(href)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') { setOpen(false); return }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      navigate(suggestions[activeIndex].href)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // If a suggestion is highlighted, use it
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      navigate(suggestions[activeIndex].href)
      return
    }
    // Otherwise fall back to text parsing
    const url = parseFallback(value)
    if (url) navigate(url)
  }

  return (
    <div className="relative w-full max-w-lg">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="City, state or ZIP code…"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3.5 pr-10 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/15 backdrop-blur-sm text-sm transition-all"
            aria-label="Search by city, state, or ZIP code"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="search-suggestions"
          />
          {/* Spinner / search icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {loading ? (
              <svg className="w-4 h-4 text-blue-200 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="px-6 py-3.5 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-semibold rounded-xl transition-colors text-sm whitespace-nowrap shadow-lg shadow-blue-900/30"
        >
          Find Testers
        </button>
      </form>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div
          id="search-suggestions"
          ref={dropdownRef}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
          style={{ right: '96px' }}  // align under input, not button
        >
          {suggestions.map((s, i) => (
            <button
              key={s.href}
              role="option"
              aria-selected={i === activeIndex}
              onPointerDown={(e) => { e.preventDefault(); navigate(s.href) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              {s.type === 'city' ? ICON_CITY : s.type === 'state' ? ICON_STATE : ICON_ZIP}

              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight">
                  <HighlightMatch text={s.label} query={value} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">{s.sublabel}</div>
              </div>

              {s.count != null && s.count > 0 && (
                <span className="shrink-0 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {s.count} {s.count === 1 ? 'provider' : 'providers'}
                </span>
              )}

              {s.type === 'state' && (
                <span className="shrink-0 text-xs text-gray-400">All cities →</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
