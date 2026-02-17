import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient, PER_PAGE } from '@/lib/supabase'
import ProviderCard from '@/components/ProviderCard'
import Filters from '@/components/Filters'
import Pagination from '@/components/Pagination'
import type { Provider, City } from '@/types'

interface Props {
  params: { state: string; city: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

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

function sp(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : '') ?? ''
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase   = createServerClient()
  const stateCode  = params.state.toUpperCase()
  const stateName  = STATE_NAMES[stateCode] ?? stateCode
  const { data: city } = await supabase
    .from('cities')
    .select('city, provider_count')
    .eq('state_code', stateCode)
    .eq('city_slug', params.city)
    .single()

  const cityName = city?.city ?? params.city
  return {
    title: `Backflow Testing in ${cityName}, ${stateCode}`,
    description:
      `Find ${city?.provider_count ?? ''} certified backflow testing professionals ` +
      `in ${cityName}, ${stateName}. Compare ratings, verify credentials, and contact local experts.`,
    alternates: {
      canonical: `/${params.state}/${params.city}`,
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

export default async function CityPage({ params, searchParams }: Props) {
  const stateCode  = params.state.toUpperCase()
  const stateName  = STATE_NAMES[stateCode] ?? stateCode
  const supabase   = createServerClient()

  // Parse filters from URL
  const minRating  = sp(searchParams.min_rating)
  const minReviews = sp(searchParams.min_reviews)
  const testing    = sp(searchParams.testing) === '1'
  const sort       = sp(searchParams.sort)  // 'rating' | 'score' | '' (default: most reviewed)
  const page       = Math.max(1, parseInt(sp(searchParams.page) || '1', 10))

  // Fetch city info
  const { data: cityInfo } = await supabase
    .from('cities')
    .select('*')
    .eq('state_code', stateCode)
    .eq('city_slug', params.city)
    .single()

  if (!cityInfo) notFound()

  // Build query
  let query = supabase
    .from('providers')
    .select('*', { count: 'exact' })
    .eq('state_code', stateCode)
    .eq('city_slug', params.city)
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)

  // Apply sort order
  if (sort === 'rating') {
    query = query.order('rating', { ascending: false }).order('reviews', { ascending: false })
  } else if (sort === 'score') {
    query = query.order('backflow_score', { ascending: false }).order('reviews', { ascending: false })
  } else {
    // default: most reviewed
    query = query.order('reviews', { ascending: false }).order('rating', { ascending: false })
  }

  if (minRating)  query = query.gte('rating', parseFloat(minRating))
  if (minReviews) query = query.gte('reviews', parseInt(minReviews, 10))
  if (testing)    query = query.eq('tier', 'testing')

  const { data: providers, count } = await query
  const total   = count ?? 0
  const hasMore = page * PER_PAGE < total

  // Nearby cities (same state, exclude current)
  const { data: nearbyCities } = await supabase
    .from('cities')
    .select('city, city_slug, provider_count')
    .eq('state_code', stateCode)
    .neq('city_slug', params.city)
    .order('provider_count', { ascending: false })
    .limit(10)

  const cityName = cityInfo.city

  // JSON-LD for the city page (Service listing)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `Backflow Testing in ${cityName}, ${stateCode}`,
    description: `Directory of certified backflow testing professionals in ${cityName}, ${stateName}.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/${params.state}/${params.city}`,
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-5">
        <Link href="/" className="hover:text-brand-600">Home</Link>
        {' / '}
        <Link href={`/${params.state}`} className="hover:text-brand-600">{stateName}</Link>
        {' / '}
        <span className="text-gray-900 font-medium">{cityName}</span>
      </nav>

      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-1">
        Backflow Testing in {cityName}, {stateCode}
      </h1>
      <p className="text-gray-500 mb-6">
        {total.toLocaleString()} verified provider{total !== 1 ? 's' : ''}
      </p>

      {/* Filters */}
      <Filters
        minRating={minRating}
        minReviews={minReviews}
        testing={testing}
        sort={sort}
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

      {/* Nearby cities */}
      {nearbyCities && nearbyCities.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Other Cities in {stateName}
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
        </div>
      )}

      {/* SEO text */}
      <div className="mt-12 text-gray-600 text-sm max-w-3xl">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          About Backflow Testing in {cityName}
        </h2>
        <p>
          Backflow prevention assemblies in {cityName}, {stateName} must be tested annually
          by a certified tester to ensure your water supply stays safe from contamination.
          All providers listed here have been verified for backflow testing services.
          Contact them directly to schedule your annual inspection or RPZ valve test.
        </p>
      </div>
    </div>
  )
}
