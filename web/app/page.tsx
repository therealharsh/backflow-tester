import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import HeroSearch from '@/components/HeroSearch'
import USMap from '@/components/USMap'

export const metadata: Metadata = {
  title: 'Find Certified Backflow Testers Near You | FindBackflowTesters.com',
  description:
    'Browse certified backflow testing professionals by state and city. ' +
    'Find verified RPZ testers, cross-connection inspectors, and backflow repair services across the US.',
  openGraph: {
    title: 'Find Certified Backflow Testers Near You',
    description: 'Verified RPZ testers, cross-connection inspectors, and backflow repair pros. Browse 750+ providers across 33 states.',
  },
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

const FEATURES = [
  {
    title: 'Verified Providers',
    desc: 'Every listing has been cross-checked for backflow testing mentions on their actual website — not just claimed services.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    title: 'Real Google Ratings',
    desc: 'Live ratings and review counts pulled directly from Google Maps so you can hire with confidence.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
  {
    title: 'Local & Specific',
    desc: 'Browse by state → city to find certified testers in your exact service area, not national chains.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
]

export default async function HomePage() {
  const supabase = createServerClient()
  const { data: cities } = await supabase
    .from('cities')
    .select('state_code, provider_count')

  // Aggregate provider counts by state
  const stateMap = new Map<string, number>()
  for (const c of cities ?? []) {
    stateMap.set(c.state_code, (stateMap.get(c.state_code) ?? 0) + c.provider_count)
  }
  const states = Array.from(stateMap.entries()).sort((a, b) =>
    (STATE_NAMES[a[0]] ?? a[0]).localeCompare(STATE_NAMES[b[0]] ?? b[0])
  )
  const totalProviders = states.reduce((s, [, c]) => s + c, 0)

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[560px] flex items-center overflow-hidden bg-gray-900">
        {/* Background: real image if available, else gradient */}
        {/* TODO: drop a high-res image at public/hero.jpg */}
        {/* <Image src="/hero.jpg" alt="Plumber performing backflow test" fill className="object-cover opacity-40" priority /> */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900" />

        {/* Decorative water-pipe pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="pipes" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M0 30h60M30 0v60" stroke="white" strokeWidth="1" fill="none" />
                <circle cx="30" cy="30" r="4" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#pipes)" />
          </svg>
        </div>

        <div className="relative section py-20 w-full">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {totalProviders.toLocaleString()} verified providers across {states.length} states
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5">
              Find Certified<br />
              <span className="text-blue-300">Backflow Testers</span><br />
              Near You
            </h1>

            <p className="text-lg text-blue-100 mb-8 leading-relaxed max-w-xl">
              Verified pros offering RPZ inspection, cross-connection control,
              and annual backflow testing — required by most municipalities.
            </p>

            {/* Search box (client component) */}
            <HeroSearch />

            <Link href="#states" className="mt-4 inline-block text-blue-300 hover:text-white text-sm underline underline-offset-2 transition-colors">
              Or browse all states →
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="section py-5">
          <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
            {[
              { label: 'Verified Providers', value: `${totalProviders.toLocaleString()}+` },
              { label: 'States Covered', value: `${states.length}` },
              { label: 'Cities Listed', value: `${(cities?.length ?? 0).toLocaleString()}+` },
            ].map(({ label, value }) => (
              <div key={label} className="px-4">
                <p className="text-2xl sm:text-3xl font-bold text-blue-700">{value}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="section">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Why choose us</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Built for Homeowners & Property Managers</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {FEATURES.map(({ title, desc, icon }) => (
              <div key={title} className="p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4">
                  {icon}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BROWSE BY STATE ───────────────────────────────────────────────────── */}
      <section id="states" className="py-14 bg-gray-50">
        <div className="section">
          <div className="mb-7">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1">Directory</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Browse by State</h2>
            <p className="text-sm text-gray-500 mt-1">Hover a state to see provider count — click to browse listings</p>
          </div>

          <USMap
            stateCounts={Object.fromEntries(states)}
            stateNames={STATE_NAMES}
          />
        </div>
      </section>
    </div>
  )
}
