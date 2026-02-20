import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { STATE_NAMES } from '@/lib/geo-utils'
import { generateFAQSchema, type FAQItem } from '@/lib/schema'
import EmptyResultsState from '@/components/EmptyResultsState'
import FAQAccordion from '@/components/FAQAccordion'

interface Props {
  params: { state: string }
}

const ALL_STATE_CODES = Object.keys(STATE_NAMES)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode]
  if (!stateName) return {}

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
  return ALL_STATE_CODES.map((c) => ({ state: c.toLowerCase() }))
}

function buildStateFAQs(stateName: string): FAQItem[] {
  return [
    {
      question: `How often is backflow testing required in ${stateName}?`,
      answer:
        `Most municipalities in ${stateName} require annual backflow prevention assembly testing. ` +
        `Some high-hazard connections may require semi-annual testing. Check with your local water authority for exact deadlines.`,
    },
    {
      question: `How much does backflow testing cost in ${stateName}?`,
      answer:
        `A standard residential test (PVB or DCVA) typically runs $90 to $200. RPZ assemblies cost $150 to $350 due to added complexity. ` +
        `Commercial sites with multiple devices can run $200 to $800+.`,
    },
    {
      question: `Do I need a certified backflow tester in ${stateName}?`,
      answer:
        `Yes. Nearly every municipality in ${stateName} requires backflow tests to be performed by a certified tester. ` +
        `Certification generally involves training, an exam, and continuing education.`,
    },
  ]
}

export default async function StatePage({ params }: Props) {
  const stateCode = params.state.toUpperCase()
  const stateName = STATE_NAMES[stateCode]

  // Only 404 for truly invalid state codes
  if (!stateName) notFound()

  const supabase = createServerClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  const { data: cities } = await supabase
    .rpc('cities_with_nearby_count', { p_state_code: stateCode }) as {
      data: { id: number; city: string; city_slug: string; state_code: string; latitude: number; longitude: number; provider_count: number; nearby_count: number }[] | null
    }

  const hasCities = cities && cities.length > 0
  const totalProviders = hasCities ? cities.reduce((s: number, c: { nearby_count: number }) => s + c.nearby_count, 0) : 0

  // Structured data
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${siteUrl}/${params.state}` },
    ],
  }

  const faqItems = buildStateFAQs(stateName)
  const faqSchema = generateFAQSchema(faqItems)

  // Nearby states with providers (for empty state)
  let suggestedLinks: { label: string; href: string }[] = []
  if (!hasCities) {
    const { data: otherStates } = await supabase
      .from('cities')
      .select('state_code')
    const stateCounts = new Map<string, number>()
    for (const c of otherStates ?? []) {
      stateCounts.set(c.state_code, (stateCounts.get(c.state_code) ?? 0) + 1)
    }
    suggestedLinks = Array.from(stateCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([code]) => ({
        label: STATE_NAMES[code] ?? code,
        href: `/${code.toLowerCase()}`,
      }))
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

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

      {hasCities ? (
        <>
          <p className="text-gray-600 mb-8">
            {totalProviders.toLocaleString()} verified providers across {cities.length} cities
          </p>

          {/* City grid */}
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cities.map((city) => (
              <Link
                key={city.id}
                href={`/${params.state}/${city.city_slug}`}
                className="block p-5 bg-white rounded-lg border border-gray-200 hover:border-brand-600 hover:shadow-md transition-all group"
              >
                <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 text-lg leading-tight">
                  {city.city}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {city.nearby_count.toLocaleString()} provider
                  {city.nearby_count !== 1 ? 's' : ''} nearby
                </p>
                <span className="inline-block mt-3 text-xs font-medium text-brand-600 group-hover:text-brand-800">
                  View all →
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyResultsState
          scope="state"
          location={stateName}
          stateCode={stateCode}
          suggestedLinks={suggestedLinks}
        />
      )}

      {/* FAQ */}
      <div className="mt-14 max-w-3xl">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Backflow Testing FAQ for {stateName}
        </h2>
        <FAQAccordion items={faqItems} />
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
          services{hasCities ? ` across ${cities.length} cities in ${stateName}` : ` in ${stateName}`}.
        </p>
        <p className="mt-2">
          {hasCities
            ? `Select a city above to view local providers, read ratings, and connect directly with certified testers in your area.`
            : `We're actively adding providers in ${stateName}. Request a free quote above or register your business to be listed.`}
        </p>
      </div>
    </div>
  )
}
