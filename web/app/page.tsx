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
} from 'lucide-react'
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
    desc: 'Browse by state \u2192 city to find certified testers in your exact service area, not national chains.',
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
  {
    num: '1',
    title: 'Search by city or ZIP',
    desc: 'Enter your location to find nearby certified backflow testers.',
    icon: <Search className="w-6 h-6" />,
  },
  {
    num: '2',
    title: 'Compare verified providers',
    desc: 'Review ratings, services, and contact info side by side.',
    icon: <Users className="w-6 h-6" />,
  },
  {
    num: '3',
    title: 'Call or visit their website',
    desc: 'Contact providers directly — no middleman, no fees.',
    icon: <Phone className="w-6 h-6" />,
  },
]

const TESTIMONIALS = [
  {
    quote: 'Found a certified tester in minutes. Way easier than calling around.',
    author: 'Homeowner',
    location: 'CA',
  },
  {
    quote: 'Great for managing multiple properties across different cities.',
    author: 'Property Manager',
    location: 'TX',
  },
  {
    quote: 'Helped us prep for inspection fast with providers that actually do backflow testing.',
    author: 'HOA Admin',
    location: 'FL',
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
      <section className="relative min-h-[600px] flex items-center overflow-hidden">
        {/* Hero background image */}
        <Image
          src="/hero-backflow.png"
          alt="Technician performing backflow test"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />

        {/* Dark gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/70" />

        <div className="relative section py-20 sm:py-28 w-full">
          <div className="max-w-2xl">
            {/* Trust pill */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-blue-200 text-xs font-medium px-3.5 py-2 rounded-full mb-8 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {totalProviders.toLocaleString()}+ verified providers across {states.length} states
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold text-white leading-[1.1] mb-5">
              Find Certified{' '}
              <span className="text-blue-400">Backflow Testers</span>{' '}
              Near You
            </h1>

            <p className="text-lg sm:text-xl text-gray-300 mb-8 leading-relaxed max-w-xl">
              Verified pros for RPZ inspection, cross-connection control,
              and annual backflow testing — required by most municipalities.
            </p>

            {/* Search box (client component) */}
            <HeroSearch />

            <Link
              href="#states"
              className="mt-5 inline-flex items-center gap-1.5 text-blue-300 hover:text-white text-sm transition-colors group"
            >
              Or browse all states
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Trust strip */}
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

      {/* ── STATS BAR ─────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="section py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4 text-center sm:divide-x divide-gray-100">
            {[
              { label: 'Verified Providers', value: `${totalProviders.toLocaleString()}+`, icon: <Users className="w-5 h-5" /> },
              { label: 'States Covered', value: `${states.length}`, icon: <Globe className="w-5 h-5" /> },
              { label: 'Cities Listed', value: `${(cities?.length ?? 0).toLocaleString()}+`, icon: <Building2 className="w-5 h-5" /> },
            ].map(({ label, value, icon }, i) => (
              <div
                key={label}
                className="px-4 flex flex-col items-center animate-fade-up"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="text-blue-600 mb-2">{icon}</div>
                <p className="text-3xl sm:text-4xl font-extrabold text-gray-900">{value}</p>
                <p className="text-sm text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Updated regularly from public records &amp; Google Maps</p>
        </div>
      </section>

      {/* ── WHY CHOOSE US ─────────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="section">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Why choose us</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Built for Homeowners &amp; Property Managers</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {FEATURES.map(({ title, desc, icon }) => (
              <div
                key={title}
                className="group p-8 rounded-2xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-lg transition-all duration-300"
              >
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

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="section">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">How it works</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Find a Tester in 3 Steps</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8 relative">
            {/* Connector line (desktop only) */}
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

      {/* ── BROWSE BY STATE ───────────────────────────────────────────────────── */}
      <section id="states" className="py-10 bg-white border-t border-gray-100">
        <div className="section">
          <div className="mb-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1">Directory</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Browse by State</h2>
          </div>

          <USMap
            stateCounts={Object.fromEntries(states)}
            stateNames={STATE_NAMES}
          />
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
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
    </div>
  )
}
