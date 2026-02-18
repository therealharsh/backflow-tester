import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import ProviderCard from '@/components/ProviderCard'
import type { Provider } from '@/types'
import { geocode, isZip, isStateCode } from '@/lib/geocode'

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'Washington D.C.',
}

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

// Provider returned from the RPC includes distance_miles
interface ProviderWithDistance extends Provider {
  distance_miles?: number
}

export default async function SearchPage({ searchParams }: Props) {
  const query = sp(searchParams.query).trim()

  if (!query) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <nav className="text-sm text-gray-500 mb-4">
            <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
            <span className="mx-1.5">/</span>
            <span className="text-gray-900">Search</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Search Backflow Testers</h1>
        </div>
        <SearchForm query="" />
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">Enter a ZIP code, city name, state, or address to search.</p>
        </div>
      </div>
    )
  }

  const supabase = createServerClient()
  const isZipQuery = isZip(query)
  const isState = isStateCode(query)

  // ── Smart redirects to SEO-friendly routes ────────────────────────────

  // 1. State abbreviation → redirect to /[state]
  if (isState) {
    const upper = query.toUpperCase()
    if (STATE_NAMES[upper]) {
      const { count } = await supabase
        .from('cities')
        .select('*', { count: 'exact', head: true })
        .eq('state_code', upper)
      if (count && count > 0) {
        redirect(`/${query.toLowerCase()}`)
      }
    }
  }

  // 2. Full state name → redirect to /[state]
  if (!isState && !isZipQuery) {
    for (const [code, name] of Object.entries(STATE_NAMES)) {
      if (name.toLowerCase() === query.toLowerCase()) {
        redirect(`/${code.toLowerCase()}`)
      }
    }
  }

  // 3. ZIP code → find matching city via providers table, then geocode fallback
  if (isZipQuery) {
    const { data: zipMatch } = await supabase
      .from('providers')
      .select('city_slug, state_code')
      .or(`postal_code.eq.${query},postal_code.eq.${query}.0`)
      .not('city_slug', 'is', null)
      .limit(1)

    if (zipMatch && zipMatch.length > 0 && zipMatch[0].city_slug) {
      redirect(`/${zipMatch[0].state_code.toLowerCase()}/${zipMatch[0].city_slug}`)
    }

    // Geocode fallback: resolve ZIP to coordinates, find nearest provider's city
    const geo = await geocode(query)
    if (geo) {
      const { data: nearProviders } = await supabase.rpc('providers_near_point', {
        lat: geo.lat,
        lon: geo.lon,
        radius_miles: 25,
        max_results: 1,
      })
      if (nearProviders?.[0]?.city_slug && nearProviders[0]?.state_code) {
        redirect(`/${nearProviders[0].state_code.toLowerCase()}/${nearProviders[0].city_slug}`)
      }
    }
  }

  // 4. "City, ST" format → redirect to /[state]/[city]
  const csvMatch = query.match(/^(.+?)[,\s]+([a-zA-Z]{2})$/)
  if (csvMatch && !isState) {
    const cityName = csvMatch[1].trim()
    const stateCode = csvMatch[2].toUpperCase()
    const { data: cityMatch } = await supabase
      .from('cities')
      .select('city_slug, state_code')
      .eq('state_code', stateCode)
      .ilike('city', cityName)
      .limit(1)

    if (cityMatch && cityMatch.length > 0) {
      redirect(`/${cityMatch[0].state_code.toLowerCase()}/${cityMatch[0].city_slug}`)
    }
  }

  // 5. Plain city name → if unique match, redirect
  if (!isZipQuery && !isState && !csvMatch) {
    const { data: cityMatches } = await supabase
      .from('cities')
      .select('city_slug, state_code')
      .ilike('city', query)
      .order('provider_count', { ascending: false })
      .limit(2)

    if (cityMatches && cityMatches.length === 1) {
      redirect(`/${cityMatches[0].state_code.toLowerCase()}/${cityMatches[0].city_slug}`)
    }
  }

  // ── No redirect matched — fall through to proximity/text search ───────

  let providers: ProviderWithDistance[] = []
  let errorMsg = ''
  let searchMode: 'proximity' | 'exact' | 'text' | '' = ''
  let geocodedLabel = ''

  if (isZipQuery || query.length > 3) {
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
        // Widen to 50 miles
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
        const { data } = await supabase
          .from('providers')
          .select('*')
          .or(`postal_code.eq.${query},postal_code.eq.${query}.0`)
          .order('reviews', { ascending: false })
          .limit(24)
        providers = data ?? []
        searchMode = 'exact'
      } else {
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
  } else {
    // Short non-ZIP, non-state text
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
      <SearchForm query={query} />

      {/* Results */}
      {errorMsg ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium mb-2">{errorMsg}</p>
          <p className="text-sm mb-6">Try a nearby city name, state abbreviation (e.g. &quot;NY&quot;), or browse all states below.</p>
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
            <ProviderCard
              key={p.place_id}
              provider={p}
              distanceMiles={searchMode === 'proximity' ? p.distance_miles : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SearchForm({ query }: { query: string }) {
  return (
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
  )
}
