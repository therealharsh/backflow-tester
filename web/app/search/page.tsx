import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import ProviderCard from '@/components/ProviderCard'
import ListingTracker from '@/components/ListingTracker'
import Filters from '@/components/Filters'
import FAQAccordion from '@/components/FAQAccordion'
import PlacesSearchBar from '@/components/PlacesSearchBar'
import type { Provider } from '@/types'
import { geocode, isZip, isStateCode, type GeoPoint } from '@/lib/geocode'
import { generateFAQSchema, type FAQItem } from '@/lib/schema'
import { STATE_NAMES, stateNameFromCode } from '@/lib/geo-utils'

const SERVICE_FILTERS: Record<string, string[]> = {
  svc_rpz:     ['RPZ Testing'],
  svc_install: ['Installation'],
  svc_repair:  ['Repair'],
  svc_cc:      ['Cross-Connection Control'],
}

interface Props {
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const label = sp(searchParams.label)
  const query = sp(searchParams.query)
  const stateParam = sp(searchParams.state).toUpperCase()
  const display = label || query
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  const title = display
    ? `Backflow Testers near ${display}`
    : 'Search Backflow Testers'

  // Build canonical: point to the best matching location page
  let canonical = siteUrl // fallback to homepage
  if (label && stateParam && STATE_NAMES[stateParam]) {
    // Try to resolve "City, ST" label to a known city page
    const parts = label.split(',').map((s) => s.trim())
    if (parts.length >= 2) {
      const citySlug = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const supabase = createServerClient()
      const { data: match } = await supabase
        .from('cities')
        .select('city_slug')
        .eq('state_code', stateParam)
        .eq('city_slug', citySlug)
        .limit(1)
      if (match && match.length > 0) {
        canonical = `${siteUrl}/${stateParam.toLowerCase()}/${match[0].city_slug}`
      } else {
        canonical = `${siteUrl}/${stateParam.toLowerCase()}`
      }
    } else {
      canonical = `${siteUrl}/${stateParam.toLowerCase()}`
    }
  } else if (stateParam && STATE_NAMES[stateParam]) {
    canonical = `${siteUrl}/${stateParam.toLowerCase()}`
  }

  return {
    title,
    description: display
      ? `Find certified backflow testing professionals near ${display}. Compare ratings, reviews, and services.`
      : 'Search for certified backflow testing professionals near you.',
    robots: { index: false, follow: true },
    alternates: { canonical },
  }
}

function sp(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : '') ?? ''
}

// Provider returned from the RPC includes distance_miles
interface ProviderWithDistance extends Provider {
  distance_miles?: number
}

// ── FAQ builder ─────────────────────────────────────────────────────────

function buildSearchFAQs(location: string, stateName: string): FAQItem[] {
  return [
    {
      question: `How much does backflow testing cost near ${location}?`,
      answer:
        `Backflow testing near ${location} typically costs between $50 and $200 per device, ` +
        `depending on the type of backflow preventer and the complexity of the installation. ` +
        `RPZ (Reduced Pressure Zone) assemblies generally cost more to test than double check ` +
        `valve assemblies. Contact providers listed above for current pricing.`,
    },
    {
      question: `How often is backflow testing required in ${stateName}?`,
      answer:
        `Many municipalities in ${stateName} require annual backflow testing for commercial and ` +
        `residential properties with backflow prevention devices. Your local water authority ` +
        `can confirm the exact testing schedule and deadlines for your area. ` +
        `Failing to test on time may result in fines or water service interruption.`,
    },
    {
      question: `What is RPZ testing?`,
      answer:
        `RPZ (Reduced Pressure Zone) testing verifies that your reduced pressure backflow ` +
        `preventer is functioning correctly to protect your water supply from contamination. ` +
        `A certified tester uses specialized gauges to measure differential pressures across ` +
        `the assembly. RPZ devices are typically required for high-hazard connections where ` +
        `contaminants could pose a health risk.`,
    },
    {
      question: `Do backflow testers near ${location} file reports with the city?`,
      answer:
        `Many certified backflow testers will file test reports directly with your ` +
        `local water authority or municipality on your behalf. It's a good idea to confirm this ` +
        `with your provider before scheduling. Some jurisdictions require the property owner to ` +
        `submit reports, while others accept direct submissions from the tester.`,
    },
    {
      question: `What is cross-connection control?`,
      answer:
        `Cross-connection control prevents contaminated water from flowing backwards into the ` +
        `clean water supply. Backflow prevention devices are installed at cross-connection ` +
        `points to protect public health. Regular testing ensures these devices function ` +
        `properly. Many municipalities in ${stateName} require cross-connection control programs ` +
        `for commercial properties and irrigation systems.`,
    },
  ]
}

// ── Page component ──────────────────────────────────────────────────────

export default async function SearchPage({ searchParams }: Props) {
  const query = sp(searchParams.query).trim()
  const label = sp(searchParams.label).trim()
  const latParam = sp(searchParams.lat)
  const lngParam = sp(searchParams.lng)
  const stateParam = sp(searchParams.state).toUpperCase()

  // Determine if we have direct coordinates from PlacesSearchBar
  const hasCoords = latParam && lngParam && !isNaN(parseFloat(latParam)) && !isNaN(parseFloat(lngParam))
  const hasQuery = !!query

  if (!hasCoords && !hasQuery) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="text-sm text-gray-500 mb-5">
          <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
          {' / '}
          <span className="text-gray-900 font-medium">Search</span>
        </nav>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Search Backflow Testers</h1>
        <div className="mb-8 max-w-lg">
          <PlacesSearchBar variant="inline" autoFocus />
        </div>
        <div className="text-center py-16 text-gray-500">
          <p className="text-sm">Enter a ZIP code, city name, state, or address to search.</p>
        </div>
      </div>
    )
  }

  const supabase = createServerClient()

  // ── Parse filter params ───────────────────────────────────────────────
  const minRating    = sp(searchParams.min_rating)
  const minReviews   = sp(searchParams.min_reviews)
  const testingOnly  = sp(searchParams.testing) === '1'
  const sort         = sp(searchParams.sort)
  const activeServices: string[] = []
  for (const key of Object.keys(SERVICE_FILTERS)) {
    if (sp(searchParams[key]) === '1') activeServices.push(key)
  }

  // ── Variables we'll populate ──────────────────────────────────────────
  let providers: ProviderWithDistance[] = []
  let searchMode: 'proximity' | 'exact' | 'text' | '' = ''
  let locationCity = ''
  let locationStateCode = ''
  let locationStateName = ''

  // ══════════════════════════════════════════════════════════════════════
  // PATH A: Direct coordinates from Google Places (lat/lng/state/label)
  // ══════════════════════════════════════════════════════════════════════
  if (hasCoords) {
    const lat = parseFloat(latParam)
    const lng = parseFloat(lngParam)

    // Extract city / state from label ("Jersey City, NJ")
    if (label) {
      const parts = label.split(',').map((s) => s.trim())
      if (parts.length >= 2) {
        locationCity = parts[0]
        const code = parts[parts.length - 1].toUpperCase()
        if (code.length === 2 && STATE_NAMES[code]) {
          locationStateCode = code
          locationStateName = STATE_NAMES[code]
        }
      } else {
        locationCity = parts[0]
      }
    }

    // Use stateParam if label didn't yield a state code
    if (!locationStateCode && stateParam && STATE_NAMES[stateParam]) {
      locationStateCode = stateParam
      locationStateName = STATE_NAMES[stateParam]
    }

    // Call the proximity RPC with state_filter
    const stateFilter = locationStateCode || null
    const { data, error } = await supabase.rpc('providers_near_point', {
      lat,
      lon: lng,
      radius_miles: 20,
      max_results: 50,
      state_filter: stateFilter,
    })

    if (!error && data && data.length > 0) {
      providers = data as ProviderWithDistance[]
      searchMode = 'proximity'
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PATH B: Legacy query param (Nominatim fallback, bookmarks, etc.)
  // ══════════════════════════════════════════════════════════════════════
  if (!hasCoords && hasQuery) {
    const isZipQuery = isZip(query)
    const isState = isStateCode(query)

    // ── Smart redirects to SEO-friendly routes ──────────────────────────

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

    // 3. "City, ST" format → redirect to /[state]/[city]
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

    // 4. Plain city name → if unique match, redirect
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

    // ── No redirect — proximity/text search via Nominatim ───────────────
    let geo: GeoPoint | null = null

    if (isZipQuery || query.length > 3) {
      geo = await geocode(query)

      if (geo) {
        // Parse state from geocoded display name
        const parts = geo.display.split(',').map((s) => s.trim())
        const cityPart = parts.find(
          (p) => !/^\d{5}/.test(p) && p !== 'United States' && p !== 'US' && !p.toLowerCase().includes('county')
        )
        const statePart = parts.find((p) =>
          Object.values(STATE_NAMES).some((name) => name.toLowerCase() === p.toLowerCase())
        )
        if (cityPart) locationCity = cityPart
        if (statePart) {
          const match = Object.entries(STATE_NAMES).find(
            ([, name]) => name.toLowerCase() === statePart.toLowerCase()
          )
          if (match) {
            locationStateCode = match[0]
            locationStateName = match[1]
          }
        }

        // Redirect to coords-based URL so the title/label are clean
        if (locationCity && locationStateCode) {
          const resolvedLabel = `${locationCity}, ${locationStateCode}`
          const qs = new URLSearchParams({
            lat: String(geo.lat),
            lng: String(geo.lon),
            state: locationStateCode,
            label: resolvedLabel,
          })
          redirect(`/search?${qs.toString()}`)
        }

        // Call the Haversine RPC with state filter for ZIP queries
        const stateFilter = isZipQuery && locationStateCode ? locationStateCode : null
        const { data, error } = await supabase.rpc('providers_near_point', {
          lat: geo.lat,
          lon: geo.lon,
          radius_miles: 20,
          max_results: 50,
          state_filter: stateFilter,
        })

        if (!error && data && data.length > 0) {
          providers = data as ProviderWithDistance[]
          searchMode = 'proximity'
        } else {
          // Widen to 30 miles if nothing within 20
          const { data: wide } = await supabase.rpc('providers_near_point', {
            lat: geo.lat,
            lon: geo.lon,
            radius_miles: 30,
            max_results: 50,
            state_filter: stateFilter,
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
            .order('premium_rank', { ascending: false })
            .order('reviews', { ascending: false })
            .limit(24)
          providers = data ?? []
          searchMode = 'exact'
        } else {
          const { data } = await supabase
            .from('providers')
            .select('*')
            .or(`city.ilike.%${query}%,name.ilike.%${query}%`)
            .order('premium_rank', { ascending: false })
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
        .order('premium_rank', { ascending: false })
        .order('reviews', { ascending: false })
        .limit(24)
      providers = data ?? []
      searchMode = 'text'
    }
  }

  // ── Location label for display ────────────────────────────────────────
  const locationLabel = label
    || (locationCity && locationStateCode
      ? `${locationCity}, ${locationStateCode}`
      : locationCity || '')

  // ── Apply filters in JS (proximity data comes pre-fetched) ────────────
  let filtered = [...providers]

  if (minRating) filtered = filtered.filter((p) => (p.rating ?? 0) >= parseFloat(minRating))
  if (minReviews) filtered = filtered.filter((p) => p.reviews >= parseInt(minReviews, 10))
  if (testingOnly) filtered = filtered.filter((p) => p.tier === 'testing')
  for (const key of activeServices) {
    const tags = SERVICE_FILTERS[key]
    if (tags) filtered = filtered.filter((p) => tags.every((t) => (p.service_tags ?? []).includes(t)))
  }

  // Apply sort — premium listings always first, then user-chosen sort
  if (sort === 'rating') {
    filtered.sort((a, b) => (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews)
  } else if (sort === 'score') {
    filtered.sort((a, b) => (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || (b.backflow_score ?? 0) - (a.backflow_score ?? 0) || b.reviews - a.reviews)
  } else {
    // Default: premium first, then keep existing order (distance for proximity, reviews for text)
    filtered.sort((a, b) => (b.premium_rank ?? 0) - (a.premium_rank ?? 0))
  }

  // ── Nearby cities ─────────────────────────────────────────────────────
  let nearbyCities: { city: string; city_slug: string; state_code: string; provider_count: number }[] = []
  const nearbyLat = hasCoords ? parseFloat(latParam) : null
  const nearbyLng = hasCoords ? parseFloat(lngParam) : null

  if (nearbyLat && nearbyLng) {
    let nearbyQuery = supabase
      .from('cities')
      .select('city, city_slug, state_code, provider_count')
      .gte('latitude', nearbyLat - 0.5)
      .lte('latitude', nearbyLat + 0.5)
      .gte('longitude', nearbyLng - 0.5)
      .lte('longitude', nearbyLng + 0.5)
    if (locationStateCode) {
      nearbyQuery = nearbyQuery.eq('state_code', locationStateCode)
    }
    const { data: nearby } = await nearbyQuery
      .order('provider_count', { ascending: false })
      .limit(8)
    nearbyCities = nearby ?? []
  }

  // ── FAQ ────────────────────────────────────────────────────────────────
  const faqStateName = locationStateName || (locationStateCode ? stateNameFromCode(locationStateCode) : '')
  const faqItems = locationLabel && faqStateName
    ? buildSearchFAQs(locationLabel, faqStateName)
    : null

  const faqSchema = faqItems ? generateFAQSchema(faqItems) : null

  // ── Heading & error ───────────────────────────────────────────────────
  const heading = locationLabel
    ? `Backflow Testers near ${locationLabel}`
    : query
      ? `Results for \u201c${query}\u201d`
      : 'Search Backflow Testers'

  const hasFilters = !!(minRating || minReviews || testingOnly || sort || activeServices.length)

  let errorMsg = ''
  if (filtered.length === 0 && providers.length > 0 && hasFilters) {
    errorMsg = 'No providers match your filters. Try relaxing your criteria.'
  } else if (providers.length === 0) {
    const display = locationLabel || query
    errorMsg = display ? `No providers found near \u201c${display}\u201d.` : ''
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* JSON-LD structured data */}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-5">
        <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
        {' / '}
        <span className="text-gray-900 font-medium">Search</span>
      </nav>

      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-3">{heading}</h1>

      {/* SEO intro */}
      {locationLabel && faqStateName && providers.length > 0 && (
        <div className="text-sm text-gray-600 leading-relaxed max-w-3xl mb-2 space-y-2">
          <p>
            Find certified backflow testing professionals near {locationLabel}.
            Our directory lists verified backflow testing companies serving the {locationCity || locationLabel} area,
            each reviewed by real customers on Google Maps.
          </p>
        </div>
      )}

      {/* Data source note */}
      {providers.length > 0 && (
        <p className="text-xs text-gray-400 mb-6">
          Data source: Google Maps. Always verify licensing with your local water authority.
        </p>
      )}

      {/* Provider count */}
      <p className="text-gray-500 mb-4">
        {filtered.length > 0
          ? `${filtered.length} provider${filtered.length !== 1 ? 's' : ''} found`
          : providers.length === 0
            ? ''
            : `0 of ${providers.length} providers match your filters`}
      </p>

      {/* Search box */}
      <div className="mb-8 max-w-lg">
        <PlacesSearchBar variant="inline" defaultValue={locationLabel || query} />
      </div>

      {/* Filters */}
      {providers.length > 0 && (
        <Filters
          minRating={minRating}
          minReviews={minReviews}
          testing={testingOnly}
          sort={sort}
          activeServices={activeServices}
        />
      )}

      {/* Results */}
      {errorMsg ? (
        <div className="mt-10 text-center text-gray-500 py-16 bg-white rounded-lg border border-gray-100">
          <p className="text-lg font-medium mb-2">{errorMsg}</p>
          {!hasFilters && (
            <p className="text-sm mb-6">
              Try a nearby city name, state abbreviation (e.g. &quot;NY&quot;), or browse all states below.
            </p>
          )}
          {!hasFilters && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm"
            >
              Browse All States &rarr;
            </Link>
          )}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {filtered.map((p, i) => (
            <ListingTracker
              key={p.place_id}
              providerSlug={p.provider_slug}
              providerName={p.name}
              position={i}
              isPremium={!!p.is_premium}
              pageType="search"
            >
              <ProviderCard
                provider={p}
                distanceMiles={searchMode === 'proximity' ? p.distance_miles : undefined}
              />
            </ListingTracker>
          ))}
        </div>
      ) : null}

      {/* FAQ section */}
      {faqItems && providers.length > 0 && (
        <div className="mt-14">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Frequently Asked Questions About Backflow Testing near {locationLabel}
          </h2>
          <FAQAccordion items={faqItems} />
        </div>
      )}

      {/* Nearby cities */}
      {nearbyCities.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Nearby Cities{locationStateName ? ` in ${locationStateName}` : ''}
          </h2>
          <div className="flex flex-wrap gap-2">
            {nearbyCities.map((c) => (
              <Link
                key={`${c.state_code}-${c.city_slug}`}
                href={`/${c.state_code.toLowerCase()}/${c.city_slug}`}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-blue-600 hover:text-blue-700 transition-colors"
              >
                {c.city} ({c.provider_count})
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            {locationStateCode && (
              <Link
                href={`/${locationStateCode.toLowerCase()}`}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                View all cities in {locationStateName} &rarr;
              </Link>
            )}
            <Link
              href="/#states"
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Browse all states &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
