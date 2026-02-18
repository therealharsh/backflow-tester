'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { slugify } from '@/lib/geo-utils'

// ── Types ──────────────────────────────────────────────────────────────

interface Prediction {
  placeId: string
  mainText: string
  secondaryText: string
  types: string[]
}

interface ResolvedPlace {
  lat: number
  lng: number
  city: string | null
  stateCode: string | null
  formattedAddress: string
}

interface Props {
  variant: 'hero' | 'inline'
  defaultValue?: string
  autoFocus?: boolean
}

// ── Known state codes for fallback parsing ─────────────────────────────

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

/** Fallback when user presses Enter without selecting a prediction. */
function parseFallback(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^\d{5}$/.test(v)) return `/search?query=${v}`
  const withState = v.match(/^(.+?)[,\s]+([a-zA-Z]{2})$/)
  if (withState) return `/${withState[2].toLowerCase()}/${slugify(withState[1])}`
  if (/^[a-zA-Z]{2}$/.test(v)) return `/${v.toLowerCase()}`
  if (STATE_LOOKUP[v.toLowerCase()]) return `/${STATE_LOOKUP[v.toLowerCase()]}`
  return `/search?query=${encodeURIComponent(v)}`
}

// ── Icons ──────────────────────────────────────────────────────────────

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

const ICON_LOCATION = (
  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
  </svg>
)

function iconForTypes(types: string[]) {
  if (types.includes('postal_code')) return ICON_ZIP
  if (types.includes('administrative_area_level_1')) return ICON_STATE
  return ICON_CITY
}

// ── Component ──────────────────────────────────────────────────────────

export default function PlacesSearchBar({ variant, defaultValue = '', autoFocus }: Props) {
  const [value, setValue] = useState(defaultValue)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [hasGeolocation, setHasGeolocation] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTokenRef = useRef(generateSessionToken())

  // ── Autocomplete fetch with debounce ────────────────────────────────

  const fetchPredictions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!q.trim() || q.trim().length < 2) {
      setPredictions([])
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          sessionToken: sessionTokenRef.current,
        })
        const res = await fetch(`/api/geo/autocomplete?${params}`)
        if (!res.ok) throw new Error()
        const data: Prediction[] = await res.json()
        setPredictions(data)
        setOpen(data.length > 0)
        setActiveIndex(-1)
      } catch {
        setPredictions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 250)
  }, [])

  useEffect(() => {
    fetchPredictions(value)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, fetchPredictions])

  // ── Close on outside click ──────────────────────────────────────────

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

  // ── Detect geolocation after mount (avoids hydration mismatch) ──────

  useEffect(() => {
    setHasGeolocation('geolocation' in navigator)
  }, [])

  // ── Auto-dismiss location error ─────────────────────────────────────

  useEffect(() => {
    if (!locationError) return
    const t = setTimeout(() => setLocationError(''), 5000)
    return () => clearTimeout(t)
  }, [locationError])

  // ── Navigation ──────────────────────────────────────────────────────

  function navigate(href: string) {
    setOpen(false)
    setPredictions([])
    setValue('')
    router.push(href)
  }

  async function selectPrediction(pred: Prediction) {
    setOpen(false)
    setLoading(true)

    try {
      const params = new URLSearchParams({
        placeId: pred.placeId,
        sessionToken: sessionTokenRef.current,
      })
      const res = await fetch(`/api/geo/geocode?${params}`)

      // Reset session token after geocode (ends Google billing session)
      sessionTokenRef.current = generateSessionToken()

      if (!res.ok) throw new Error()
      const place: ResolvedPlace = await res.json()

      // Determine where to navigate
      if (pred.types.includes('administrative_area_level_1') && place.stateCode) {
        // State-only search → state page
        navigate(`/${place.stateCode.toLowerCase()}`)
      } else {
        // City/ZIP/address → search with coordinates
        const label = place.city && place.stateCode
          ? `${place.city}, ${place.stateCode}`
          : place.formattedAddress || pred.mainText
        const sp = new URLSearchParams({
          lat: String(place.lat),
          lng: String(place.lng),
          label,
          ...(place.stateCode ? { state: place.stateCode } : {}),
        })
        navigate(`/search?${sp}`)
      }
    } catch {
      // Fallback: navigate to search with the text
      sessionTokenRef.current = generateSessionToken()
      const url = parseFallback(value)
      if (url) navigate(url)
    } finally {
      setLoading(false)
    }
  }

  // ── Use my location ─────────────────────────────────────────────────

  async function handleUseMyLocation() {
    if (locationLoading) return
    setLocationLoading(true)
    setLocationError('')

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 300_000,
        })
      })

      const { latitude, longitude } = position.coords
      const res = await fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}`)
      if (!res.ok) throw new Error('Reverse geocode failed')
      const place: ResolvedPlace = await res.json()

      const label = place.city && place.stateCode
        ? `${place.city}, ${place.stateCode}`
        : place.formattedAddress || 'Your Location'
      const sp = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
        label,
        ...(place.stateCode ? { state: place.stateCode } : {}),
      })
      navigate(`/search?${sp}`)
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setLocationError('Please allow location access in your browser settings.')
      } else {
        setLocationError('Could not determine your location. Try searching by city or ZIP.')
      }
    } finally {
      setLocationLoading(false)
    }
  }

  // ── Keyboard nav ────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || predictions.length === 0) {
      if (e.key === 'Escape') { setOpen(false); return }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, predictions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      selectPrediction(predictions[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (activeIndex >= 0 && predictions[activeIndex]) {
      selectPrediction(predictions[activeIndex])
      return
    }
    // If there are predictions open, select the first one
    if (predictions.length > 0) {
      selectPrediction(predictions[0])
      return
    }
    // Fallback: parse raw text
    const url = parseFallback(value)
    if (url) navigate(url)
  }

  // ── Render ──────────────────────────────────────────────────────────

  const isHero = variant === 'hero'

  const inputCls = isHero
    ? 'w-full px-5 py-4 pr-11 rounded-xl bg-white text-gray-900 placeholder-gray-400 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg text-[15px] transition-all'
    : 'flex-1 px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'

  const buttonCls = isHero
    ? 'px-7 py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-[15px] whitespace-nowrap shadow-lg shadow-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent'
    : 'px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm'

  return (
    <div className={`relative ${isHero ? 'w-full max-w-xl z-20' : 'max-w-lg mb-8'}`}>
      <form onSubmit={handleSubmit} className={`flex ${isHero ? 'flex-col sm:flex-row' : 'flex-row'} gap-2.5`}>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => predictions.length > 0 && setOpen(true)}
            placeholder="City, state, ZIP code, or address..."
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            className={inputCls}
            aria-label="Search by city, state, ZIP code, or address"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="places-suggestions"
          />

          {/* Spinner / search icon */}
          <div className={`absolute ${isHero ? 'right-4' : 'right-3'} top-1/2 -translate-y-1/2 pointer-events-none`}>
            {loading ? (
              <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Dropdown */}
          {open && predictions.length > 0 && (
            <div
              id="places-suggestions"
              ref={dropdownRef}
              role="listbox"
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[100]"
            >
              {predictions.map((pred, i) => (
                <button
                  key={pred.placeId}
                  role="option"
                  aria-selected={i === activeIndex}
                  onPointerDown={(e) => { e.preventDefault(); selectPrediction(pred) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  {iconForTypes(pred.types)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 leading-tight truncate">
                      {pred.mainText}
                    </div>
                    {pred.secondaryText && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{pred.secondaryText}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className={buttonCls}>
          {isHero ? 'Find Certified Testers' : 'Search'}
        </button>
      </form>

      {/* Helper text + Use my location */}
      <div className={`flex ${isHero ? 'flex-col sm:flex-row sm:items-center' : 'flex-row items-center'} gap-x-4 gap-y-1 mt-2.5`}>
        {hasGeolocation && (
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locationLoading}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
            locationLoading
              ? (isHero ? 'text-gray-400 cursor-wait' : 'text-gray-400 cursor-wait')
              : (isHero ? 'text-blue-300 hover:text-white' : 'text-blue-600 hover:text-blue-800')
          }`}
        >
          {locationLoading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
            </svg>
          )}
          {locationLoading ? 'Finding your location...' : 'Use my current location'}
        </button>
        )}
        {isHero && (
          <span className="text-xs text-gray-400">
            Start typing an address, city, state, or ZIP
          </span>
        )}
      </div>

      {/* Location error */}
      {locationError && (
        <p className="mt-1.5 text-xs text-red-500">{locationError}</p>
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
