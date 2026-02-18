import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import type { City } from '@/types'

interface Props {
  params: { state: string }
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode] ?? stateCode
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  return {
    title: `Backflow Testers in ${stateName} | Find Certified Testers Near You`,
    description:
      `Find certified backflow testers in ${stateName}. Compare ratings, services, and contact licensed professionals near you for RPZ inspection and annual backflow testing.`,
    alternates: {
      canonical: `${siteUrl}/${params.state}`,
    },
    openGraph: {
      title: `Backflow Testers in ${stateName}`,
      description: `Browse certified backflow testing professionals across ${stateName}.`,
      url: `${siteUrl}/${params.state}`,
      type: 'website',
    },
  }
}

export async function generateStaticParams() {
  const supabase = createServerClient()
  const { data } = await supabase.from('cities').select('state_code')
  const codes = [...new Set((data ?? []).map((c) => c.state_code))]
  return codes.map((c) => ({ state: c.toLowerCase() }))
}

export default async function StatePage({ params }: Props) {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode] ?? stateCode
  const supabase  = createServerClient()

  const { data: cities } = await supabase
    .from('cities')
    .select('*')
    .eq('state_code', stateCode)
    .order('provider_count', { ascending: false })

  if (!cities || cities.length === 0) notFound()

  const totalProviders = cities.reduce((s, c) => s + c.provider_count, 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand-600">Home</Link>
        {' / '}
        <span className="text-gray-900 font-medium">{stateName}</span>
      </nav>

      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Backflow Testing Services in {stateName}
      </h1>
      <p className="text-gray-600 mb-8">
        {totalProviders.toLocaleString()} verified providers across {cities.length} cities
      </p>

      {/* City grid */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cities.map((city: City) => (
          <Link
            key={city.id}
            href={`/${params.state}/${city.city_slug}`}
            className="block p-5 bg-white rounded-lg border border-gray-200 hover:border-brand-600 hover:shadow-md transition-all group"
          >
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 text-lg leading-tight">
              {city.city}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {city.provider_count.toLocaleString()} provider
              {city.provider_count !== 1 ? 's' : ''}
            </p>
            <span className="inline-block mt-3 text-xs font-medium text-brand-600 group-hover:text-brand-800">
              View all →
            </span>
          </Link>
        ))}
      </div>

      {/* SEO text */}
      <div className="mt-12 prose prose-sm text-gray-600 max-w-3xl">
        <h2 className="text-xl font-semibold text-gray-800 mb-3">
          Backflow Testing Requirements in {stateName}
        </h2>
        <p>
          Most municipalities in {stateName} require annual backflow prevention assembly
          testing by a certified tester. Our directory lists verified plumbing professionals
          who offer backflow testing, RPZ valve inspection, and cross-connection control
          services across {cities.length} cities in {stateName}.
        </p>
        <p className="mt-2">
          Select a city above to view local providers, read ratings, and connect directly
          with certified testers in your area.
        </p>
      </div>
    </div>
  )
}
