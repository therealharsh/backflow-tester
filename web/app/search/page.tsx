import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import ProviderCard from '@/components/ProviderCard'
import type { Provider } from '@/types'
import { geocode, isZip, isStateCode } from '@/lib/geocode'

interface Props {
  searchParams: { [key: string]: string | string[] | undefined }
}

export const metadata: Metadata = {
  title: 'Search Backflow Testers',
  description: 'Search for certified backflow testing professionals near you.',
  robots: { index: false },
}

function sp(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : '') ?? ''
}

function formatDistance(miles: number): string {
  if (miles < 1) return '< 1 mi'
  return `${Math.round(miles)} mi`
}

// Provider returned from the RPC includes distance_miles
interface ProviderWithDistance extends Provider {
  distance_miles?: number
}

export default async function SearchPage({ searchParams }: Props) {
  const query = sp(searchParams.query).trim()
  const supabase = createServerClient()

  let providers: ProviderWithDistance[] = []
  let errorMsg = ''
  let searchMode: 'proximity' | 'exact' | 'text' | '' = ''
  let geocodedLabel = ''

  if (query) {
    const isZipQuery = isZip(query)
    const isState = isStateCode(query)

    // ── 1. State abbreviation — redirect-style text search ─────────────────────
    if (isState) {
      const { data } = await supabase
        .from('providers')
        .select('*')
        .ilike('state_code', query)
        .order('reviews', { ascending: false })
        .limit(30)
      providers = data ?? []
      searchMode = 'text'
    }
    // ── 2. ZIP or address — try geocoding first, then proximity RPC ─────────────
    else if (isZipQuery || query.length > 3) {
      const geo = await geocode(query)

      if (geo) {
        geocodedLabel = geo.display
        // Call the Haversine RPC (25-mile radius, up to 30 results)
        const { data, error } = await supabase.rpc('providers_near_point', {
          lat: geo.lat,
          lon: geo.lon,
          radius_miles: 25,
          max_results: 30,
        })

        if (!error && data && data.length > 0) {
          providers = data as ProviderWithDistance[]
          searchMode = 'proximity'
        } else {
          // Geocoded but nothing within 25 miles — widen to 50 miles
          const { data: wide } = await supabase.rpc('providers_near_point', {
            lat: geo.lat,
            lon: geo.lon,
            radius_miles: 50,
            max_results: 30,
          })
          if (wide && wide.length > 0) {
            providers = wide as ProviderWithDistance[]
            searchMode = 'proximity'
          }
        }
      }

      // If geocoding failed or proximity returned nothing, fall back to text search
      if (providers.length === 0) {
        if (isZipQuery) {
          // Exact ZIP match (handles both "10019" and legacy "10019.0")
          const { data } = await supabase
            .from('providers')
            .select('*')
            .or(`postal_code.eq.${query},postal_code.eq.${query}.0`)
            .order('reviews', { ascending: false })
            .limit(24)
          providers = data ?? []
          searchMode = 'exact'
        } else {
          // Fuzzy city/name search
          const { data } = await supabase
            .from('providers')
            .select('*')
            .or(`city.ilike.%${query}%,name.ilike.%${query}%`)
            .order('reviews', { ascending: false })
            .limit(24)
          providers = data ?? []
          searchMode = 'text'
        }
      }
    }
    // ── 3. Short non-ZIP, non-state text ─────────────────────────────────────
    else {
      const { data } = await supabase
        .from('providers')
        .select('*')
        .or(`city.ilike.%${query}%,name.ilike.%${query}%`)
        .order('reviews', { ascending: false })
        .limit(24)
      providers = data ?? []
      searchMode = 'text'
    }

    if (providers.length === 0) {
      errorMsg = `No providers found near "${query}".`
    }
  }

  const proximityNote = searchMode === 'proximity' && geocodedLabel
    ? `Showing providers within 50 miles of ${geocodedLabel.split(',').slice(0, 2).join(',')}`
    : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          <span className="mx-1.5">/</span>
          <span className="text-gray-900">Search</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">
          {query ? `Results for "${query}"` : 'Search Backflow Testers'}
        </h1>
        {providers.length > 0 && (
          <p className="text-gray-500 mt-1">
            {providers.length} provider{providers.length !== 1 ? 's' : ''} found
            {proximityNote && (
              <span className="ml-2 text-xs text-blue-600 font-medium">
                — {proximityNote}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Search box */}
      <form method="GET" action="/search" className="mb-8">
        <div className="flex gap-2 max-w-lg">
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="ZIP code, city, state, or address"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            autoFocus={!query}
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm"
          >
            Search
          </button>
        </div>
      </form>

      {/* Results */}
      {errorMsg ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium mb-2">{errorMsg}</p>
          <p className="text-sm mb-6">Try a nearby city name, state abbreviation (e.g. "NY"), or browse all states below.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm"
          >
            Browse All States →
          </Link>
        </div>
      ) : providers.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {providers.map((p) => (
            <div key={p.place_id} className="relative">
              {/* Distance badge for proximity results */}
              {searchMode === 'proximity' && p.distance_miles != null && (
                <div className="absolute top-2.5 right-2.5 z-10 text-[11px] font-semibold text-white bg-blue-700/80 backdrop-blur-sm rounded-full px-2 py-0.5 shadow">
                  {formatDistance(p.distance_miles)}
                </div>
              )}
              <ProviderCard provider={p} />
            </div>
          ))}
        </div>
      ) : !query ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">Enter a ZIP code, city name, state, or address to search.</p>
        </div>
      ) : null}
    </div>
  )
}
