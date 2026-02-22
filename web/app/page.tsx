export const revalidate = 3600 // refresh from DB every hour

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ShieldCheck,
  Award,
  Star,
  Phone,
  Users,
  Globe,
  Building2,
  Search,
  ArrowRight,
  Quote,
  MapPin,
  Wrench,
  ClipboardCheck,
  Droplets,
  CalendarCheck,
  AlertTriangle,
  Landmark,
  Zap,
} from 'lucide-react'
import { createServerClient } from '@/lib/supabase'
import HeroSearch from '@/components/HeroSearch'
import USMap from '@/components/USMap'
import FAQAccordion from '@/components/FAQAccordion'
import HomepageCTA from '@/components/HomepageCTA'
import StickyMobileCTA from '@/components/StickyMobileCTA'
import { generateFAQSchema, type FAQItem } from '@/lib/schema'
import { STATE_NAMES } from '@/lib/geo-utils'

// ── Metadata ──────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Find Certified Backflow Testers Near Me | Fast, Water-Approved',
  description:
    'Need backflow testing fast? Find certified, water-authority approved backflow testers near you. Compare trusted local providers and stay compliant today.',
  openGraph: {
    title: 'Find Certified Backflow Testers Near Me | Fast, Water-Approved',
    description:
      'Need backflow testing fast? Find certified, water-authority approved backflow testers near you. Compare trusted local providers and stay compliant today.',
    type: 'website',
    url: 'https://www.findbackflowtesters.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find Certified Backflow Testers Near Me | Fast, Water-Approved',
    description:
      'Need backflow testing fast? Find certified, water-authority approved backflow testers near you. Compare trusted local providers and stay compliant today.',
  },
  alternates: { canonical: 'https://www.findbackflowtesters.com' },
}

// ── Static data ───────────────────────────────────────────────────────

const FEATURES = [
  {
    title: 'Verified Providers',
    desc: "Every listing is cross-checked for real backflow testing mentions on the provider's website — not just categories.",
    icon: <ShieldCheck className="w-6 h-6" />,
  },
  {
    title: 'Real Google Ratings',
    desc: 'Live ratings and review counts pulled from Google so you can choose with confidence.',
    icon: <Star className="w-6 h-6" />,
  },
  {
    title: 'Local & Specific',
    desc: 'Browse by state \u2192 city to find certified backflow testers in your exact service area, not national chains.',
    icon: <MapPin className="w-6 h-6" />,
  },
]

const TRUST_ITEMS = [
  { label: 'Municipal-compliant testing', icon: <ShieldCheck className="w-4 h-4" /> },
  { label: 'Licensed & insured pros', icon: <Award className="w-4 h-4" /> },
  { label: 'Real Google ratings', icon: <Star className="w-4 h-4" /> },
  { label: 'Contact providers directly', icon: <Phone className="w-4 h-4" /> },
]

const STEPS = [
  { num: '1', title: 'Search by city or ZIP', desc: 'Enter your location to find nearby certified backflow testers.', icon: <Search className="w-6 h-6" /> },
  { num: '2', title: 'Compare verified providers', desc: 'Review ratings, services, and contact info side by side.', icon: <Users className="w-6 h-6" /> },
  { num: '3', title: 'Call or visit their website', desc: 'Contact providers directly — no middleman, no fees.', icon: <Phone className="w-6 h-6" /> },
]

const TESTIMONIALS = [
  { quote: 'Found a certified tester in minutes. Way easier than calling around.', author: 'Homeowner', location: 'CA' },
  { quote: 'Great for managing multiple properties across different cities.', author: 'Property Manager', location: 'TX' },
  { quote: 'Helped us prep for inspection fast with providers that actually do backflow testing.', author: 'HOA Admin', location: 'FL' },
]

const SERVICES = [
  { title: 'Backflow Testing', desc: 'Annual and on-demand testing to ensure your backflow device meets code.', icon: <ClipboardCheck className="w-5 h-5" /> },
  { title: 'RPZ Testing', desc: 'Specialized testing for Reduced Pressure Zone assemblies required for high-hazard connections.', icon: <Droplets className="w-5 h-5" /> },
  { title: 'Annual Certification', desc: 'Recurring certification to keep your property compliant with local regulations.', icon: <CalendarCheck className="w-5 h-5" /> },
  { title: 'Preventer Installation', desc: 'New backflow preventer installation for residential and commercial properties.', icon: <Wrench className="w-5 h-5" /> },
  { title: 'Preventer Repair', desc: 'Diagnosis and repair of faulty backflow prevention devices.', icon: <AlertTriangle className="w-5 h-5" /> },
  { title: 'Cross-Connection Control', desc: 'Inspections and compliance for cross-connection control programs.', icon: <Landmark className="w-5 h-5" /> },
  { title: 'Commercial & Multi-Family', desc: 'Backflow services for apartment complexes, office buildings, and commercial properties.', icon: <Building2 className="w-5 h-5" /> },
  { title: 'Emergency & Same-Day', desc: 'Urgent testing and repair when you need fast turnaround for compliance deadlines.', icon: <Zap className="w-5 h-5" /> },
]

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How often is backflow testing required?',
    answer:
      'Most cities and water districts require annual backflow testing for any property with a backflow prevention device. ' +
      'Some high-hazard connections may require semi-annual testing. Check with your local water authority for exact deadlines — ' +
      'missing yours can result in fines or water shutoff.',
  },
  {
    question: 'What is an RPZ backflow preventer?',
    answer:
      'An RPZ (Reduced Pressure Zone) assembly is a backflow preventer used on high-hazard cross-connections. ' +
      'It has two independent check valves separated by a pressure-monitored relief valve. ' +
      'RPZ devices require certified technicians with calibrated gauges to test.',
  },
  {
    question: 'How much does backflow testing cost?',
    answer:
      'A standard residential test (PVB or DCVA) typically runs $90 to $200. RPZ assemblies cost $150 to $350 due to added complexity. ' +
      'Commercial or multi-family sites with multiple devices can run $200 to $800+. Repairs after a failed test commonly add $150 to $600+.',
  },
  {
    question: 'Do I need a certified tester?',
    answer:
      'Yes. Nearly every state and municipality requires backflow tests to be performed by a certified backflow tester. ' +
      'Certification generally involves training, an exam, and continuing education. ' +
      'All providers in our directory have been verified for backflow testing services.',
  },
  {
    question: 'What happens if I fail a backflow test?',
    answer:
      'A failed device must be repaired or replaced and then re-tested before it passes inspection. ' +
      'Many testers handle repairs on-site the same day. Your water authority will set a deadline to submit a passing report — ' +
      'continued failure can lead to fines or water disconnection.',
  },
  {
    question: 'Do testers file results with the city?',
    answer:
      'Many certified testers submit test reports directly to your local water authority on your behalf. ' +
      'This is common but not universal, so confirm with your provider when scheduling. ' +
      'Some jurisdictions require the property owner to file separately.',
  },
]

const AUDIENCE_BADGES = [
  'Homeowners',
  'Property Managers',
  'HOAs & Condo Boards',
  'Facility Managers',
  'Plumbing Contractors',
]

// ── Component ─────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = createServerClient()

  const { data: cities } = await supabase
    .from('cities')
    .select('city, city_slug, state_code, provider_count')
    .order('provider_count', { ascending: false })

  // Aggregate provider counts by state
  const stateMap = new Map<string, number>()
  for (const c of cities ?? []) {
    stateMap.set(c.state_code, (stateMap.get(c.state_code) ?? 0) + c.provider_count)
  }
  const states = Array.from(stateMap.entries()).sort((a, b) =>
    (STATE_NAMES[a[0]] ?? a[0]).localeCompare(STATE_NAMES[b[0]] ?? b[0])
  )
  const totalProviders = states.reduce((s, [, c]) => s + c, 0)

  // Top states by provider count
  const topStates = Array.from(stateMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Top cities for internal linking
  const topCities = (cities ?? []).slice(0, 40)

  // JSON-LD schemas
  const faqSchema = generateFAQSchema(FAQ_ITEMS)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'FindBackflowTesters.com',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/search?query={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FindBackflowTesters.com',
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    description: 'Directory of verified backflow testing professionals across the United States.',
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
    ],
  }

  return (
    <div>
      {/* ── JSON-LD Structured Data ──────────────────────────────────────── */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[600px] flex items-center overflow-hidden">
        <Image src="/hero-backflow.png" alt="Technician performing backflow test" fill className="object-cover" priority sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />

        <div className="relative section py-20 sm:py-28 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-blue-200 text-xs font-medium px-3.5 py-2 rounded-full mb-8 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {totalProviders.toLocaleString()}+ verified providers across {states.length} states
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-5">
              Find Certified{' '}
              <span className="text-blue-400">Backflow Testers</span>{' '}
              Near You
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed max-w-xl">
              Verified pros for RPZ inspection, cross-connection control,
              and annual backflow testing — required by most municipalities.
            </p>

            <HeroSearch />

            <Link href="#states" className="mt-5 inline-flex items-center gap-1.5 text-blue-300 hover:text-white text-sm transition-colors group">
              Or browse all states
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <div className="mt-10 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-3 text-sm text-gray-400">
              {TRUST_ITEMS.map(({ label, icon }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-blue-400">{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="section py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4 text-center sm:divide-x divide-gray-100">
            {[
              { label: 'Verified Providers', value: `${totalProviders.toLocaleString()}+`, icon: <Users className="w-5 h-5" /> },
              { label: 'States & DC Covered', value: '50', icon: <Globe className="w-5 h-5" /> },
              { label: 'Cities Listed', value: `${(cities?.length ?? 0).toLocaleString()}+`, icon: <Building2 className="w-5 h-5" /> },
            ].map(({ label, value, icon }, i) => (
              <div key={label} className="px-4 flex flex-col items-center animate-fade-up" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="text-blue-600 mb-2">{icon}</div>
                <p className="text-3xl sm:text-4xl font-extrabold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Updated regularly from public records &amp; Google Maps</p>
        </div>
      </section>

      {/* ── WHY CHOOSE US ────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="section">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Why choose us</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Built for Homeowners &amp; Property Managers</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {FEATURES.map(({ title, desc, icon }) => (
              <div key={title} className="group p-8 rounded-2xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                  {icon}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="section">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">How it works</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Find a Tester in 3 Steps</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8 relative">
            <div className="hidden sm:block absolute top-10 left-[20%] right-[20%] h-px bg-blue-200" />
            {STEPS.map(({ num, title, desc, icon }) => (
              <div key={num} className="relative text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-white border-2 border-blue-100 text-blue-600 flex items-center justify-center mb-5 relative z-10 shadow-sm">
                  {icon}
                </div>
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Step {num}</div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="section">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Services</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Services You Can Request</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto text-sm">
              Our directory providers offer a wide range of backflow prevention and testing services.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map(({ title, desc, icon }) => (
              <div key={title} className="p-5 rounded-xl border border-gray-200 hover:border-blue-200 hover:shadow-sm transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                  {icon}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GET FREE QUOTE CTA ───────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900">
        <div className="section text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Get a Free Quote From a Local Tester
          </h2>
          <p className="text-blue-200 max-w-lg mx-auto mb-8 leading-relaxed">
            No obligation. Tell us what you need and we&apos;ll connect you with a certified
            backflow testing provider in your area.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <HomepageCTA />
            <Link
              href="#states"
              className="text-sm text-blue-200 hover:text-white underline-offset-4 hover:underline transition-colors"
            >
              Browse providers instead
            </Link>
          </div>

          {/* Trust signals */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-blue-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Verified providers
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4" /> Real Google ratings
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4" /> No spam — info goes only to our team
            </span>
          </div>
        </div>
      </section>

      {/* ── BROWSE BY STATE ──────────────────────────────────────────────── */}
      <section id="states" className="py-10 bg-white border-t border-gray-100">
        <div className="section">
          <div className="mb-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1">Directory</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Browse by State</h2>
          </div>
          <USMap stateCounts={Object.fromEntries(states)} stateNames={STATE_NAMES} />
        </div>
      </section>

      {/* ── BACKFLOW TESTING 101 (SEO) ───────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="section">
          <div className="grid lg:grid-cols-[1fr_320px] gap-12 items-start">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Learn more</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                What Is Backflow Testing and Why Is It Required?
              </h2>

              <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
                <p>
                  Backflow testing is an annual backflow testing check that confirms water only flows one way through your
                  plumbing. A backflow preventer sits at cross-connection control points (like irrigation, fire lines, or
                  commercial systems) to stop contaminated water from reversing into the clean supply.
                </p>
                <p>
                  Many cities and water districts require a backflow prevention device inspection by a certified professional
                  to stay in city compliance. Common devices include RPZ assemblies (RPZ valve testing), double-check
                  valves (DCVA), and pressure vacuum breakers (PVB).
                </p>
                <p>
                  If you&apos;re looking for a certified backflow tester near me, our directory helps you compare verified
                  providers with real Google ratings, service details, and direct contact info.
                </p>

                <h3 className="text-xl font-bold text-gray-900 pt-4">
                  How Much Does Backflow Testing Cost?
                </h3>
                <p>
                  Backflow testing prices vary by location, device type, and whether the provider files results with your
                  water district. Typical ranges:
                </p>
                <ul className="list-disc list-inside space-y-1.5 text-gray-700">
                  <li><strong>Standard residential device (PVB / DCVA):</strong> $90&ndash;$200</li>
                  <li><strong>RPZ assembly:</strong> $150&ndash;$350 (often higher due to complexity)</li>
                  <li><strong>Additional devices on the same visit:</strong> +$50&ndash;$150 each (many providers discount multi-device testing)</li>
                  <li><strong>Commercial / multi-family sites:</strong> $200&ndash;$800+ total depending on device count and access</li>
                  <li><strong>Repairs after a failed test:</strong> commonly $150&ndash;$600+ (parts + labor), and a retest may be required</li>
                </ul>
                <p>
                  Prices are often higher in major metros and during peak compliance season. Use Get Quote to compare
                  local pricing for your address.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/#states" className="btn-secondary text-sm">Browse by State</Link>
                <Link href="/blog" className="btn-ghost text-sm">Read Our Blog</Link>
              </div>

              {topStates.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top states by providers</p>
                  <div className="flex flex-wrap gap-2">
                    {topStates.map(([code, count]) => (
                      <Link
                        key={code}
                        href={`/${code.toLowerCase()}`}
                        className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:border-blue-600 hover:text-blue-700 transition-colors"
                      >
                        {STATE_NAMES[code]} ({count})
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Images alongside text */}
            <div className="flex flex-col gap-5 lg:sticky lg:top-24">
              <Image
                src="/backflowtesting3.jpeg"
                alt="Technician testing a backflow prevention device"
                width={320}
                height={240}
                className="rounded-xl border border-gray-200 shadow-sm w-full object-cover"
              />
              <Image
                src="/backflowtesting4.jpg"
                alt="Backflow preventer assembly installed on a water line"
                width={320}
                height={240}
                className="rounded-xl border border-gray-200 shadow-sm w-full object-cover"
              />
              <Image
                src="/backflowtesting5.jpg"
                alt="Certified tester inspecting a backflow device"
                width={320}
                height={240}
                className="rounded-xl border border-gray-200 shadow-sm w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── POPULAR CITIES / SERVICE AREAS ────────────────────────────────── */}
      {topCities.length > 0 && (
        <section className="py-16 bg-white border-t border-gray-100">
          <div className="section">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Popular service areas</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
              Backflow Testers in Top Cities
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
              {topCities.map((c) => (
                <Link
                  key={`${c.state_code}-${c.city_slug}`}
                  href={`/${c.state_code.toLowerCase()}/${c.city_slug}`}
                  className="text-sm text-gray-600 hover:text-blue-700 transition-colors py-1 truncate"
                >
                  {c.city}, {c.state_code}{' '}
                  <span className="text-gray-400">({c.provider_count})</span>
                </Link>
              ))}
            </div>
            <div className="mt-6">
              <Link href="/#states" className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
                View all states and cities &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="section">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Common questions</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Backflow Testing FAQ</h2>
            </div>
            <FAQAccordion items={FAQ_ITEMS} />
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="section">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Social proof</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Trusted by Homeowners &amp; Property Managers</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {TESTIMONIALS.map(({ quote, author, location }) => (
              <div key={author} className="p-8 rounded-2xl bg-white border border-gray-100 shadow-sm">
                <Quote className="w-8 h-8 text-blue-100 mb-4" />
                <p className="text-gray-700 leading-relaxed mb-6">&ldquo;{quote}&rdquo;</p>
                <p className="text-sm font-semibold text-gray-900">
                  &mdash; {author}, <span className="text-gray-500">{location}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE / TRUSTED BY ────────────────────────────────────────── */}
      <section className="py-12 bg-gray-50 border-t border-gray-100">
        <div className="section">
          <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">Trusted by</p>
          <div className="flex flex-wrap justify-center gap-3">
            {AUDIENCE_BADGES.map((badge) => (
              <span key={badge} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 font-medium">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROVIDER CTA — CLAIM & UPGRADE ───────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-t border-gray-700">
        <div className="section">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">For Backflow Professionals</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Are You a Certified Backflow Tester?
            </h2>
            <p className="text-gray-400 leading-relaxed mb-8 max-w-lg mx-auto">
              Claim your listing to manage your profile, respond to quote requests, and upgrade
              to premium placement. Get more visibility and more jobs in your service area.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/claim"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Find Your Listing
              </Link>
              <Link
                href="/claim?tab=register"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white/10 text-white font-semibold rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Register Your Listing
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
              {[
                { title: 'Premium Placement', desc: 'Appear first in search results with a highlighted card and badge.' },
                { title: 'More Quote Leads', desc: 'Get prioritized quote requests from customers in your area.' },
                { title: 'Plans from $49/mo', desc: 'Starter, Pro, and Featured tiers. Cancel anytime.' },
              ].map(({ title, desc }) => (
                <div key={title} className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-1 text-sm">{title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY MOBILE CTA ────────────────────────────────────────────── */}
      <StickyMobileCTA />
    </div>
  )
}
