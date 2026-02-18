import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export interface Suggestion {
  type: 'city' | 'state' | 'zip'
  label: string        // primary display text
  sublabel: string     // secondary (e.g. state name)
  href: string         // where to navigate
  count?: number       // provider count
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (q.length < 1) {
    return NextResponse.json([])
  }

  const results: Suggestion[] = []

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )

  // ZIP code: 5 digits — try to resolve to a city route
  if (/^\d{1,5}$/.test(q)) {
    if (q.length === 5) {
      const { data: zipCity } = await supabase
        .from('providers')
        .select('city, city_slug, state_code')
        .or(`postal_code.eq.${q},postal_code.eq.${q}.0`)
        .not('city_slug', 'is', null)
        .limit(1)

      if (zipCity && zipCity.length > 0 && zipCity[0].city_slug) {
        const stateName = STATE_NAMES[zipCity[0].state_code] ?? zipCity[0].state_code
        results.push({
          type: 'zip',
          label: `${zipCity[0].city}, ${zipCity[0].state_code}`,
          sublabel: `ZIP ${q} · ${stateName}`,
          href: `/${zipCity[0].state_code.toLowerCase()}/${zipCity[0].city_slug}`,
        })
      } else {
        results.push({
          type: 'zip',
          label: q,
          sublabel: 'Search by ZIP code',
          href: `/search?query=${q}`,
        })
      }
    }
    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  }

  // State match: 2-letter code
  if (/^[a-zA-Z]{1,2}$/.test(q)) {
    const upper = q.toUpperCase()
    for (const [code, name] of Object.entries(STATE_NAMES)) {
      if (code.startsWith(upper) || name.toLowerCase().startsWith(q.toLowerCase())) {
        results.push({
          type: 'state',
          label: name,
          sublabel: code,
          href: `/${code.toLowerCase()}`,
        })
        if (results.length >= 4) break
      }
    }
  }

  // Full state name match (supports word-level prefix: "jersey" → "New Jersey")
  const stateLower = q.toLowerCase()
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    const nameLower = name.toLowerCase()
    const matchesStart = nameLower.startsWith(stateLower)
    const matchesWord = nameLower.split(' ').some((w) => w.startsWith(stateLower))
    if ((matchesStart || matchesWord) && !results.some((r) => r.href === `/${code.toLowerCase()}`)) {
      results.push({
        type: 'state',
        label: name,
        sublabel: code,
        href: `/${code.toLowerCase()}`,
      })
      if (results.length >= 4) break
    }
  }

  // City + state prefix match — handle "City, ST" format too
  let cityQ = q
  let stateFilter: string | null = null
  const csvMatch = q.match(/^(.+?)[,\s]+([a-zA-Z]{2})$/)
  if (csvMatch) {
    cityQ = csvMatch[1].trim()
    stateFilter = csvMatch[2].toUpperCase()
  }

  const cityQuery = supabase
    .from('cities')
    .select('city, city_slug, state_code, provider_count')
    .ilike('city', `%${cityQ}%`)
    .order('provider_count', { ascending: false })
    .limit(stateFilter ? 5 : 8)

  if (stateFilter) {
    cityQuery.eq('state_code', stateFilter)
  }

  const { data: cities } = await cityQuery

  for (const c of cities ?? []) {
    const stateName = STATE_NAMES[c.state_code] ?? c.state_code
    results.push({
      type: 'city',
      label: c.city,
      sublabel: `${c.state_code} · ${stateName}`,
      href: `/${c.state_code.toLowerCase()}/${c.city_slug}`,
      count: c.provider_count,
    })
  }

  return NextResponse.json(results.slice(0, 8), {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
