export const revalidate = 3600 // refresh from DB every hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, PER_PAGE, PER_PAGE_OPTIONS } from '@/lib/supabase'
import { STATE_NAMES } from '@/lib/geo-utils'
import { geocodeCity } from '@/lib/google-places'
import { getCityBySlug, getNearbyCities, getAllCities, hashString } from '@/lib/city-data'
import EmptyResultsState from '@/components/EmptyResultsState'
import ProviderCard from '@/components/ProviderCard'
import ListingTracker from '@/components/ListingTracker'
import Filters from '@/components/Filters'
import Pagination from '@/components/Pagination'
import FAQAccordion from '@/components/FAQAccordion'
import CityHelpfulResources from '@/components/CityHelpfulResources'
import type { Provider } from '@/types'
import {
  generateFAQSchema,
  generateItemListSchema,
  type FAQItem,
} from '@/lib/schema'

interface Props {
  params: { state: string; city: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

/** Service filter definitions — key maps to URL param, tags to Supabase contains. */
const SERVICE_FILTERS: Record<string, string[]> = {
  svc_rpz:     ['RPZ Testing'],
  svc_install: ['Installation'],
  svc_repair:  ['Repair'],
  svc_cc:      ['Cross-Connection Control'],
}

function sp(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : '') ?? ''
}

// ── FAQ pool (10 questions — 4–5 selected per city via hash) ────────────

function buildFAQPool(city: string, state: string): FAQItem[] {
  return [
    {
      question: `How much does backflow testing cost in ${city}?`,
      answer:
        `Backflow testing in ${city}, ${state} typically costs between $50 and $200 per device, ` +
        `depending on the type of backflow preventer and the complexity of the installation. ` +
        `RPZ assemblies generally cost more to test than double check valve assemblies. ` +
        `Contact providers listed above for current pricing in the ${city} area.`,
    },
    {
      question: `How often is backflow testing required in ${state}?`,
      answer:
        `Many municipalities in ${state} require annual backflow testing for commercial and ` +
        `residential properties with backflow prevention devices. Your local water authority ` +
        `in ${city} can confirm the exact testing schedule and deadlines for your area. ` +
        `Failing to test on time may result in fines or water service interruption.`,
    },
    {
      question: `What is RPZ testing?`,
      answer:
        `RPZ (Reduced Pressure Zone) testing verifies that your reduced pressure backflow ` +
        `preventer is functioning correctly to protect your water supply from contamination. ` +
        `A certified tester uses specialized gauges to measure differential pressures across ` +
        `the assembly. RPZ devices are typically required for high-hazard connections.`,
    },
    {
      question: `Do backflow testers in ${city} file reports with the city?`,
      answer:
        `Many certified backflow testers in ${city} will file test reports directly with your ` +
        `local water authority or municipality on your behalf. Confirm this with your provider ` +
        `before scheduling. Some jurisdictions require the property owner to submit reports, ` +
        `while others accept direct submissions from the tester.`,
    },
    {
      question: `What is cross-connection control?`,
      answer:
        `Cross-connection control prevents contaminated water from flowing backwards into the ` +
        `clean water supply. Backflow prevention devices are installed at cross-connection ` +
        `points to protect public health. Regular testing ensures these devices function ` +
        `properly. Many municipalities in ${state} require cross-connection control programs ` +
        `for commercial properties and irrigation systems.`,
    },
    {
      question: `How do I choose a backflow tester in ${city}?`,
      answer:
        `Look for testers with active state certification, strong Google reviews, and experience ` +
        `with your type of backflow preventer (PVB, DCVA, or RPZ). Ask whether they file ` +
        `compliance reports with your local water authority and request a written estimate ` +
        `before scheduling. Our directory lists verified testers near ${city} with real customer reviews.`,
    },
    {
      question: `Is residential backflow testing different from commercial in ${city}?`,
      answer:
        `Residential tests typically involve a single PVB or DCVA device and are quicker to ` +
        `complete. Commercial properties in ${city} often have multiple assemblies, RPZ ` +
        `devices, and fire-line backflow preventers that require more time and specialized ` +
        `equipment. Pricing and scheduling may differ for each type.`,
    },
    {
      question: `What happens if a backflow device fails its test?`,
      answer:
        `If a backflow preventer fails its annual test, the certified tester will diagnose ` +
        `the issue — often a worn check valve, damaged disc, or fouled relief valve. Most ` +
        `testers in ${city} can repair the device on site and re-test it the same day. Your ` +
        `water authority may require the passing report within a set deadline.`,
    },
    {
      question: `Can I get emergency backflow testing in ${city}?`,
      answer:
        `Some certified testers near ${city} offer same-day or emergency scheduling for ` +
        `urgent situations such as a failed device, a compliance deadline, or a new ` +
        `construction inspection. Check individual provider listings above for availability, ` +
        `or request a quote to find a tester who can accommodate your schedule.`,
    },
    {
      question: `What certification do backflow testers need in ${state}?`,
      answer:
        `Most jurisdictions in ${state} require backflow testers to hold a current certification ` +
        `from an approved training program, typically involving classroom instruction, a ` +
        `hands-on practical exam, and continuing education credits. Some municipalities ` +
        `maintain their own approved-tester lists. Always verify certification before hiring.`,
    },
  ]
}

/** Select 5 FAQs from the pool using a deterministic hash of the city slug. */
function buildFAQs(citySlug: string, city: string, state: string): FAQItem[] {
  const pool = buildFAQPool(city, state)
  const h = hashString(citySlug)
  const count = 5
  const selected: FAQItem[] = []
  const used = new Set<number>()
  for (let i = 0; i < count; i++) {
    let idx = (h + i * 7) % pool.length
    while (used.has(idx)) idx = (idx + 1) % pool.length
    used.add(idx)
    selected.push(pool[idx])
  }
  return selected
}

// ── Location intro (unique per city via nearby city names) ──────────────

function buildLocationIntro(
  city: string,
  state: string,
  count: number,
  nearbyCityNames: string[],
): string {
  const countStr = count > 0 ? `${count.toLocaleString()} ` : ''
  const nearbyStr = nearbyCityNames.length > 0
    ? ` and surrounding communities including ${nearbyCityNames.slice(0, 3).join(', ')}`
    : ' and surrounding areas'

  return (
    `Finding a reliable backflow testing professional in ${city}, ${state} is essential ` +
    `for maintaining a safe water supply and staying in compliance with local regulations. ` +
    `Our directory lists ${countStr}verified backflow testing companies serving ` +
    `${city}${nearbyStr}.\n\n` +
    `Whether you need annual backflow testing, RPZ (Reduced Pressure Zone) valve inspection, ` +
    `or cross-connection control services, the providers listed below offer professional ` +
    `certification and testing for both residential and commercial properties throughout ` +
    `the ${city} area.\n\n` +
    `Most water authorities in ${state} require annual testing and reporting for all ` +
    `backflow prevention assemblies. A certified backflow tester will inspect your devices, ` +
    `perform the required differential pressure tests, and file compliance reports ` +
    `with your local water authority.\n\n` +
    `Browse the listings below to compare ratings, read verified customer reviews, and ` +
    `contact certified backflow testing professionals near ${city} directly. ` +
    `Use the filters above to narrow results by rating, review count, or specific ` +
    `services like RPZ testing and preventer installation.`
  )
}

// ── Metadata ─────────────────────────────────────────────────────────────

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode]
  if (!stateName) return {}
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  if (/^\d{5}$/.test(params.city)) {
    return {
      title: `Backflow Testers Near ZIP ${params.city} | Find Certified Backflow Testers Near You`,
      description: `Find certified backflow testers near ZIP code ${params.city}, ${stateName}. Compare ratings, services, and contact licensed professionals near you.`,
      robots: { index: false, follow: true },
    }
  }

  // Resolve city info from dataset, DB, or slug
  const datasetCity = getCityBySlug(params.city, stateCode)
  const supabase = createServerClient()
  let cityName: string
  let lat: number | null = null
  let lng: number | null = null

  if (datasetCity) {
    cityName = datasetCity.city
    lat = datasetCity.lat
    lng = datasetCity.lng
  } else {
    const { data: dbCity } = await supabase
      .from('cities')
      .select('city, latitude, longitude')
      .eq('state_code', stateCode)
      .eq('city_slug', params.city)
      .single()
    cityName = dbCity?.city
      ?? params.city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    lat = dbCity?.latitude ?? null
    lng = dbCity?.longitude ?? null
  }

  // Lightweight check: fetch max 3 providers to determine indexability
  let shouldIndex = false
  if (lat && lng) {
    const { data } = await supabase.rpc('providers_near_point', {
      lat, lon: lng, radius_miles: 20, max_results: 3, state_filter: stateCode,
    })
    shouldIndex = (data?.length ?? 0) >= 3
  }

  // Page-aware canonical: page 1 (or missing) → clean URL, page >= 2 → include ?page=N
  const pageParam = parseInt(sp(searchParams.page) || '1', 10)
  const pageNum = Number.isFinite(pageParam) && pageParam >= 2 ? pageParam : null
  const baseCanonical = `${siteUrl}/${params.state}/${params.city}`
  const canonical = pageNum ? `${baseCanonical}?page=${pageNum}` : baseCanonical

  return {
    title: `Backflow Testers in ${cityName}, ${stateName} | Find Certified Backflow Testers Near You`,
    description:
      `Find certified backflow testers in ${cityName}, ${stateName}. Compare ratings, services, and contact licensed professionals near you for RPZ inspection and annual backflow testing.`,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `Backflow Testers in ${cityName}, ${stateName}`,
      description: `Find certified backflow testing professionals in ${cityName}, ${stateName}.`,
      url: `${siteUrl}/${params.state}/${params.city}`,
      type: 'website',
    },
    ...(!shouldIndex && { robots: { index: false, follow: true } }),
  }
}

export async function generateStaticParams() {
  // Generate from static dataset instead of DB
  return getAllCities().map((c) => ({
    state: c.state_code.toLowerCase(),
    city: c.slug,
  }))
}

// ── Page component ───────────────────────────────────────────────────────

export default async function CityPage({ params, searchParams }: Props) {
  const stateCode  = params.state.toUpperCase()
  const stateName  = STATE_NAMES[stateCode]
  const supabase   = createServerClient()

  // Only 404 for truly invalid state codes
  if (!stateName) notFound()

  // ── ZIP code in URL → redirect to the matching city page ──────────────
  if (/^\d{5}$/.test(params.city)) {
    const { data: zipMatch } = await supabase
      .from('providers')
      .select('city_slug')
      .or(`postal_code.eq.${params.city},postal_code.eq.${params.city}.0`)
      .eq('state_code', stateCode)
      .not('city_slug', 'is', null)
      .limit(1)

    if (zipMatch && zipMatch.length > 0 && zipMatch[0].city_slug) {
      redirect(`/${params.state}/${zipMatch[0].city_slug}`)
    }

    const { data: anyZip } = await supabase
      .from('providers')
      .select('city_slug, state_code')
      .or(`postal_code.eq.${params.city},postal_code.eq.${params.city}.0`)
      .not('city_slug', 'is', null)
      .limit(1)

    if (anyZip && anyZip.length > 0 && anyZip[0].city_slug) {
      redirect(`/${anyZip[0].state_code.toLowerCase()}/${anyZip[0].city_slug}`)
    }

    notFound()
  }

  // ── Parse filters from URL ────────────────────────────────────────────
  const minRating  = sp(searchParams.min_rating)
  const minReviews = sp(searchParams.min_reviews)
  const testing    = sp(searchParams.testing) === '1'
  const sort       = sp(searchParams.sort)
  const rawPage    = sp(searchParams.page)

  // Validate page param: NaN / < 1 → redirect to clean URL; explicit "1" → redirect to clean URL
  const basePath = `/${params.state}/${params.city}`
  const parsedPage = parseInt(rawPage || '1', 10)
  if (rawPage && (isNaN(parsedPage) || parsedPage < 1)) {
    const clean = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== 'page' && typeof v === 'string') clean.set(k, v)
    }
    const qs = clean.toString()
    redirect(qs ? `${basePath}?${qs}` : basePath)
  }
  if (rawPage === '1') {
    const clean = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== 'page' && typeof v === 'string') clean.set(k, v)
    }
    const qs = clean.toString()
    redirect(qs ? `${basePath}?${qs}` : basePath)
  }
  const page = Math.max(1, parsedPage)

  // Parse per_page param: display value (12/25/50) → actual slice count (12/24/48)
  const rawPerPage = parseInt(sp(searchParams.per_page) || String(PER_PAGE), 10)
  const perPage = rawPerPage in PER_PAGE_OPTIONS ? PER_PAGE_OPTIONS[rawPerPage] : PER_PAGE

  // Service filter params
  const activeServices: string[] = []
  for (const key of Object.keys(SERVICE_FILTERS)) {
    if (sp(searchParams[key]) === '1') activeServices.push(key)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
  const pageUrl = `${siteUrl}/${params.state}/${params.city}`

  // ── Resolve city: dataset → DB → geocode → helpful fallback ──────────
  const datasetCity = getCityBySlug(params.city, stateCode)
  let cityName: string
  let cityLat: number | null = null
  let cityLng: number | null = null

  if (datasetCity) {
    // Primary: from static dataset
    cityName = datasetCity.city
    cityLat = datasetCity.lat
    cityLng = datasetCity.lng
  } else {
    // Fallback: check DB cities table
    const { data: dbCity } = await supabase
      .from('cities')
      .select('*')
      .eq('state_code', stateCode)
      .eq('city_slug', params.city)
      .single()

    if (dbCity) {
      cityName = dbCity.city
      cityLat = dbCity.latitude
      cityLng = dbCity.longitude
    } else {
      // Last resort: geocode validation
      const geo = await geocodeCity(params.city, stateCode)
      if (geo) {
        cityName = geo.city
        cityLat = geo.lat
        cityLng = geo.lng
      } else {
        // Completely unknown city — render helpful noindex page (NO 404)
        cityName = params.city
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      }
    }
  }

  // ── Fetch providers within 20 miles ───────────────────────────────────
  let allProviders: (Provider & { distance_miles: number })[] = []

  if (cityLat && cityLng) {
    const { data } = await supabase.rpc('providers_near_point', {
      lat: cityLat,
      lon: cityLng,
      radius_miles: 20,
      max_results: 200,
      state_filter: stateCode,
    })
    allProviders = (data ?? []) as (Provider & { distance_miles: number })[]
  }

  // ── Batch-fetch subscription + owner data for promotion ranking ─────
  let promotedSet = new Set<string>()
  if (allProviders.length > 0) {
    const placeIds = allProviders.map((p) => p.place_id)
    const [{ data: subs }, { data: owners }] = await Promise.all([
      supabase
        .from('provider_subscriptions')
        .select('provider_place_id')
        .in('provider_place_id', placeIds)
        .in('tier', ['premium', 'pro'])
        .eq('status', 'active'),
      supabase
        .from('provider_owners')
        .select('provider_place_id')
        .in('provider_place_id', placeIds),
    ])
    const activePremiumPro = new Set((subs ?? []).map((s) => s.provider_place_id))
    const ownerSet = new Set((owners ?? []).map((o) => o.provider_place_id))
    for (const id of activePremiumPro) {
      if (ownerSet.has(id)) promotedSet.add(id)
    }
  }

  /** Provider is promoted if within 20 mi, active premium/pro tier, and owner verified */
  const isPromoted = (p: Provider & { distance_miles: number }) =>
    promotedSet.has(p.place_id) && p.distance_miles <= 20

  const providerCount = allProviders.length

  // ── Nearby cities (from static dataset, haversine-sorted) ─────────────
  const nearbyCityEntries = cityLat && cityLng
    ? getNearbyCities(cityLat, cityLng, stateCode, params.city, 12)
    : []

  // ── Build SEO content ─────────────────────────────────────────────────
  const nearbyCityNames = nearbyCityEntries.map((c) => c.city)
  const locationIntro = buildLocationIntro(cityName, stateName, providerCount, nearbyCityNames)
  const faqItems = buildFAQs(params.city, cityName, stateName)

  // ── Empty state (0 providers) ─────────────────────────────────────────
  if (providerCount === 0) {
    const suggestedLinks = nearbyCityEntries.slice(0, 8).map((c) => ({
      label: c.city,
      href: `/${params.state}/${c.slug}`,
    }))

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: stateName, item: `${siteUrl}/${params.state}` },
        { '@type': 'ListItem', position: 3, name: cityName, item: pageUrl },
      ],
    }

    const faqSchema = generateFAQSchema(faqItems)

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-brand-600">Home</Link>
          {' / '}
          <Link href={`/${params.state}`} className="hover:text-brand-600">{stateName}</Link>
          {' / '}
          <span className="text-gray-900 font-medium">{cityName}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Backflow Testing Services in {cityName}, {stateName}
        </h1>

        <EmptyResultsState
          scope="city"
          location={`${cityName}, ${stateName}`}
          stateCode={stateCode}
          suggestedLinks={suggestedLinks}
        />

        {/* Nearby cities */}
        {nearbyCityEntries.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              Nearby Cities in {stateName}
            </h2>
            <div className="flex flex-wrap gap-2">
              {nearbyCityEntries.map((c) => (
                <Link
                  key={c.slug}
                  href={`/${params.state}/${c.slug}`}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-brand-600 hover:text-brand-700 transition-colors"
                >
                  {c.city}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              <Link href={`/${params.state}`} className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                View all cities in {stateName} &rarr;
              </Link>
              <Link href="/#states" className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Browse all states &rarr;
              </Link>
            </div>
          </div>
        )}

        <CityHelpfulResources state={stateName} city={cityName} basePath={basePath} />

        <div className="mt-14 max-w-3xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Backflow Testing FAQ for {cityName}, {stateName}
          </h2>
          <FAQAccordion items={faqItems} />
        </div>
      </div>
    )
  }

  // ── Apply filters in JS ────────────────────────────────────────────────
  let filtered = [...allProviders]

  if (minRating) filtered = filtered.filter((p) => (p.rating ?? 0) >= parseFloat(minRating))
  if (minReviews) filtered = filtered.filter((p) => p.reviews >= parseInt(minReviews, 10))
  if (testing) filtered = filtered.filter((p) => p.tier === 'testing')
  for (const key of activeServices) {
    const tags = SERVICE_FILTERS[key]
    if (tags) filtered = filtered.filter((p) => tags.every((t) => (p.service_tags ?? []).includes(t)))
  }

  // Sort: promoted first (premium/pro within 20 mi), then premium_rank, then user-chosen sort
  const promo = (p: Provider & { distance_miles: number }) => isPromoted(p) ? 1 : 0
  if (sort === 'rating') {
    filtered.sort((a, b) => promo(b) - promo(a) || (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews)
  } else if (sort === 'score') {
    filtered.sort((a, b) => promo(b) - promo(a) || (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || (b.backflow_score ?? 0) - (a.backflow_score ?? 0) || b.reviews - a.reviews)
  } else if (sort === 'reviews') {
    filtered.sort((a, b) => promo(b) - promo(a) || (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || b.reviews - a.reviews)
  } else {
    // Default (Nearest): promoted first, then premium, then nearest distance
    filtered.sort((a, b) => promo(b) - promo(a) || (b.premium_rank ?? 0) - (a.premium_rank ?? 0) || a.distance_miles - b.distance_miles)
  }

  // ── Paginate (server-side slice) ─────────────────────────────────────
  const total      = filtered.length
  const totalPages = Math.ceil(total / perPage)

  // 404 for page numbers beyond the last valid page
  if (totalPages > 0 && page > totalPages) notFound()

  const providers = filtered.slice((page - 1) * perPage, page * perPage)

  // Build a clean searchParams record (without `page`) for Pagination link building
  const filterParams: Record<string, string> = {}
  for (const [k, v] of Object.entries(searchParams)) {
    if (k !== 'page' && typeof v === 'string' && v) filterParams[k] = v
  }

  // ── Structured data ───────────────────────────────────────────────────
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Backflow Testing Services in ${cityName}, ${stateName}`,
    description: `Find certified backflow testers in ${cityName}, ${stateName}. Compare ratings, services, and contact licensed professionals near you for RPZ inspection and annual backflow testing.`,
    url: pageUrl,
  }

  const faqSchema = generateFAQSchema(faqItems)

  const itemListSchema = providers && providers.length > 0
    ? generateItemListSchema(providers, pageUrl, cityName, stateName)
    : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {itemListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      )}

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-5">
        <Link href="/" className="hover:text-brand-600">Home</Link>
        {' / '}
        <Link href={`/${params.state}`} className="hover:text-brand-600">{stateName}</Link>
        {' / '}
        <span className="text-gray-900 font-medium">{cityName}</span>
      </nav>

      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        Backflow Testing Services in {cityName}, {stateName}
      </h1>

      {/* SEO location intro */}
      <div className="text-sm text-gray-600 leading-relaxed max-w-3xl mb-2 space-y-2">
        {locationIntro.split('\n\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {/* Data source note */}
      <p className="text-xs text-gray-400 mb-6">
        Data source: Google Maps. Always verify licensing with your local water authority.
      </p>

      {/* Provider count */}
      <p className="text-gray-500 mb-4">
        {total.toLocaleString()} verified provider{total !== 1 ? 's' : ''}
      </p>

      {/* Filters */}
      <Filters
        minRating={minRating}
        minReviews={minReviews}
        testing={testing}
        sort={sort}
        activeServices={activeServices}
        perPage={rawPerPage in PER_PAGE_OPTIONS ? rawPerPage : PER_PAGE}
      />

      {/* Provider grid */}
      {providers && providers.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {providers.map((p, i) => (
            <ListingTracker
              key={p.place_id}
              providerSlug={p.provider_slug}
              providerName={p.name}
              position={i}
              isPremium={!!p.is_premium}
              pageType="city"
            >
              <ProviderCard provider={p} distanceMiles={p.distance_miles} />
            </ListingTracker>
          ))}
        </div>
      ) : (
        <div className="mt-10 text-center text-gray-500 py-16 bg-white rounded-lg border border-gray-100">
          <p className="text-lg">No providers match your filters.</p>
          <p className="mt-2 text-sm">Try relaxing your filter criteria.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={perPage}
            basePath={basePath}
            searchParams={filterParams}
          />
        </div>
      )}

      {/* Helpful resources */}
      <CityHelpfulResources state={stateName} city={cityName} basePath={basePath} />

      {/* FAQ section */}
      <div className="mt-14">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Frequently Asked Questions About Backflow Testing in {cityName}
        </h2>
        <FAQAccordion items={faqItems} />
      </div>

      {/* Nearby cities */}
      {nearbyCityEntries.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Nearby Cities in {stateName}
          </h2>
          <div className="flex flex-wrap gap-2">
            {nearbyCityEntries.map((c) => (
              <Link
                key={c.slug}
                href={`/${params.state}/${c.slug}`}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-brand-600 hover:text-brand-700 transition-colors"
              >
                {c.city}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <Link
              href={`/${params.state}`}
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              View all cities in {stateName} &rarr;
            </Link>
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
