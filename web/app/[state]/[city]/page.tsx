import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, PER_PAGE } from '@/lib/supabase'
import { STATE_NAMES } from '@/lib/geo-utils'
import { geocodeCity } from '@/lib/google-places'
import EmptyResultsState from '@/components/EmptyResultsState'
import ProviderCard from '@/components/ProviderCard'
import Filters from '@/components/Filters'
import Pagination from '@/components/Pagination'
import FAQAccordion from '@/components/FAQAccordion'
import type { Provider, City } from '@/types'
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

// ── SEO content helpers ──────────────────────────────────────────────────

function buildLocationIntro(city: string, state: string, count: number): string {
  return (
    `Finding a reliable backflow testing professional in ${city}, ${state} is essential ` +
    `for maintaining a safe water supply and staying in compliance with local regulations. ` +
    `Our directory lists ${count > 0 ? count.toLocaleString() : ''} verified backflow testing ` +
    `companies serving the ${city} area, each reviewed by real customers on Google Maps.\n\n` +
    `Whether you need annual backflow testing, RPZ (Reduced Pressure Zone) valve inspection, ` +
    `or cross-connection control services, the providers listed below offer professional ` +
    `certification and testing for both residential and commercial properties throughout ` +
    `${city} and surrounding areas in ${state}.\n\n` +
    `Backflow prevention devices must be tested regularly to ensure they are functioning ` +
    `correctly and protecting your potable water supply from contamination. Most water ` +
    `authorities in ${state} require annual testing and reporting for all backflow ` +
    `prevention assemblies. A certified backflow tester will inspect your devices, ` +
    `perform the required differential pressure tests, and file compliance reports ` +
    `with your local water authority.\n\n` +
    `Browse the listings below to compare ratings, read verified customer reviews, and ` +
    `contact certified backflow testing professionals in ${city}, ${state} directly. ` +
    `Use the filters above to narrow results by rating, review count, or specific ` +
    `services like RPZ testing and preventer installation.`
  )
}

function buildFAQs(city: string, state: string): FAQItem[] {
  return [
    {
      question: `How much does backflow testing cost in ${city}?`,
      answer:
        `Backflow testing in ${city}, ${state} typically costs between $50 and $200 per device, ` +
        `depending on the type of backflow preventer and the complexity of the installation. ` +
        `RPZ (Reduced Pressure Zone) assemblies generally cost more to test than double check ` +
        `valve assemblies. Contact providers listed above for current pricing in the ${city} area.`,
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
        `the assembly. RPZ devices are typically required for high-hazard connections where ` +
        `contaminants could pose a health risk.`,
    },
    {
      question: `Do backflow testers in ${city} file reports with the city?`,
      answer:
        `Many certified backflow testers in ${city} will file test reports directly with your ` +
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
        `properly. Many municipalities in ${state} require cross-connection control programs ` +
        `for commercial properties and irrigation systems.`,
    },
  ]
}

// ── Metadata ─────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode]
  if (!stateName) return {}
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  if (/^\d{5}$/.test(params.city)) {
    return {
      title: `Backflow Testers Near ZIP ${params.city} | Find Certified Testers Near You`,
      description: `Find certified backflow testers near ZIP code ${params.city}, ${stateName}. Compare ratings, services, and contact licensed professionals near you.`,
      robots: { index: false },
    }
  }

  const supabase = createServerClient()
  const { data: city } = await supabase
    .from('cities')
    .select('city, provider_count')
    .eq('state_code', stateCode)
    .eq('city_slug', params.city)
    .single()

  const cityName = city?.city
    ?? params.city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return {
    title: `Backflow Testers in ${cityName}, ${stateName} | Find Certified Testers Near You`,
    description:
      `Find certified backflow testers in ${cityName}, ${stateName}. Compare ratings, services, and contact licensed professionals near you for RPZ inspection and annual backflow testing.`,
    alternates: {
      canonical: `${siteUrl}/${params.state}/${params.city}`,
    },
    openGraph: {
      title: `Backflow Testers in ${cityName}, ${stateName}`,
      description: `Find ${city?.provider_count ?? ''} certified backflow testing professionals in ${cityName}, ${stateName}.`,
      url: `${siteUrl}/${params.state}/${params.city}`,
      type: 'website',
    },
  }
}

export async function generateStaticParams() {
  const supabase = createServerClient()
  const { data } = await supabase.from('cities').select('city_slug, state_code')
  return (data ?? []).map((c) => ({
    state: c.state_code.toLowerCase(),
    city: c.city_slug,
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
  const page       = Math.max(1, parseInt(sp(searchParams.page) || '1', 10))

  // Service filter params
  const activeServices: string[] = []
  for (const key of Object.keys(SERVICE_FILTERS)) {
    if (sp(searchParams[key]) === '1') activeServices.push(key)
  }

  // ── Fetch city info ───────────────────────────────────────────────────
  const { data: cityInfo } = await supabase
    .from('cities')
    .select('*')
    .eq('state_code', stateCode)
    .eq('city_slug', params.city)
    .single()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
  const pageUrl = `${siteUrl}/${params.state}/${params.city}`

  // ── Empty state: city not in DB, validate via geocoding ─────────────
  if (!cityInfo) {
    const geo = await geocodeCity(params.city, stateCode)
    if (!geo) notFound()

    const { data: nearbyCities } = await supabase
      .from('cities')
      .select('city, city_slug, provider_count')
      .eq('state_code', stateCode)
      .order('provider_count', { ascending: false })
      .limit(8)

    const suggestedLinks = (nearbyCities ?? []).map((c) => ({
      label: `${c.city} (${c.provider_count})`,
      href: `/${params.state}/${c.city_slug}`,
    }))

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: stateName, item: `${siteUrl}/${params.state}` },
        { '@type': 'ListItem', position: 3, name: geo!.city, item: pageUrl },
      ],
    }

    const faqItems = buildFAQs(geo!.city, stateName)
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
          <span className="text-gray-900 font-medium">{geo!.city}</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Backflow Testing Services in {geo!.city}, {stateName}
        </h1>

        <EmptyResultsState
          scope="city"
          location={`${geo!.city}, ${stateName}`}
          stateCode={stateCode}
          suggestedLinks={suggestedLinks}
        />

        <div className="mt-14 max-w-3xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Backflow Testing FAQ for {geo!.city}, {stateName}
          </h2>
          <FAQAccordion items={faqItems} />
        </div>
      </div>
    )
  }

  const cityName = cityInfo.city

  // ── Build provider query ──────────────────────────────────────────────
  // Show providers within ~50 miles of the city, same state
  const BOX = 0.75 // ~50 miles bounding box
  let query = supabase
    .from('providers')
    .select('*', { count: 'exact' })
    .eq('state_code', stateCode)

  if (cityInfo.latitude && cityInfo.longitude) {
    query = query
      .gte('latitude', cityInfo.latitude - BOX)
      .lte('latitude', cityInfo.latitude + BOX)
      .gte('longitude', cityInfo.longitude - BOX)
      .lte('longitude', cityInfo.longitude + BOX)
  } else {
    query = query.eq('city_slug', params.city)
  }

  query = query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  // Sort order — premium listings always first
  query = query.order('premium_rank', { ascending: false })
  if (sort === 'rating') {
    query = query.order('rating', { ascending: false }).order('reviews', { ascending: false })
  } else if (sort === 'score') {
    query = query.order('backflow_score', { ascending: false }).order('reviews', { ascending: false })
  } else {
    query = query.order('reviews', { ascending: false }).order('rating', { ascending: false })
  }

  if (minRating)  query = query.gte('rating', parseFloat(minRating))
  if (minReviews) query = query.gte('reviews', parseInt(minReviews, 10))
  if (testing)    query = query.eq('tier', 'testing')

  // Apply service tag filters
  for (const key of activeServices) {
    const tags = SERVICE_FILTERS[key]
    if (tags) query = query.contains('service_tags', tags)
  }

  const { data: providers, count } = await query
  const total   = count ?? 0
  const hasMore = page * PER_PAGE < total

  // ── Nearby cities ─────────────────────────────────────────────────────
  const { data: nearbyCities } = await supabase
    .from('cities')
    .select('city, city_slug, provider_count')
    .eq('state_code', stateCode)
    .neq('city_slug', params.city)
    .order('provider_count', { ascending: false })
    .limit(8)

  // ── Structured data ───────────────────────────────────────────────────
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Backflow Testing Services in ${cityName}, ${stateName}`,
    description: `Find certified backflow testers in ${cityName}, ${stateName}. Compare ratings, services, and contact licensed professionals near you for RPZ inspection and annual backflow testing.`,
    url: pageUrl,
  }

  const faqItems = buildFAQs(cityName, stateName)
  const faqSchema = generateFAQSchema(faqItems)

  const itemListSchema = providers && providers.length > 0
    ? generateItemListSchema(providers, pageUrl, cityName, stateName)
    : null

  const locationIntro = buildLocationIntro(cityName, stateName, cityInfo.provider_count)

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
      />

      {/* Provider grid */}
      {providers && providers.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {providers.map((p: Provider) => (
            <ProviderCard key={p.place_id} provider={p} />
          ))}
        </div>
      ) : (
        <div className="mt-10 text-center text-gray-500 py-16 bg-white rounded-lg border border-gray-100">
          <p className="text-lg">No providers match your filters.</p>
          <p className="mt-2 text-sm">Try relaxing your filter criteria.</p>
        </div>
      )}

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="mt-8">
          <Pagination page={page} hasMore={hasMore} total={total} perPage={PER_PAGE} />
        </div>
      )}

      {/* FAQ section */}
      <div className="mt-14">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Frequently Asked Questions About Backflow Testing in {cityName}
        </h2>
        <FAQAccordion items={faqItems} />
      </div>

      {/* Nearby cities */}
      {nearbyCities && nearbyCities.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Nearby Cities in {stateName}
          </h2>
          <div className="flex flex-wrap gap-2">
            {nearbyCities.map((c) => (
              <Link
                key={c.city_slug}
                href={`/${params.state}/${c.city_slug}`}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-brand-600 hover:text-brand-700 transition-colors"
              >
                {c.city} ({c.provider_count})
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
