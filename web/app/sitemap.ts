import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient()
  const urls: MetadataRoute.Sitemap = []

  // Homepage
  urls.push({ url: BASE, changeFrequency: 'weekly', priority: 1.0 })

  // Cities (includes state info)
  const { data: cities } = await supabase
    .from('cities')
    .select('city_slug, state_code')
    .order('provider_count', { ascending: false })

  const stateSet = new Set<string>()
  for (const c of cities ?? []) {
    const state = c.state_code.toLowerCase()
    stateSet.add(state)
    urls.push({
      url: `${BASE}/${state}/${c.city_slug}`,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  // State pages
  for (const state of stateSet) {
    urls.push({
      url: `${BASE}/${state}`,
      changeFrequency: 'weekly',
      priority: 0.9,
    })
  }

  // Provider pages (paginated)
  let from = 0
  while (true) {
    const { data: providers } = await supabase
      .from('providers')
      .select('provider_slug')
      .range(from, from + 999)

    if (!providers || providers.length === 0) break

    for (const p of providers) {
      urls.push({
        url: `${BASE}/providers/${p.provider_slug}`,
        changeFrequency: 'monthly',
        priority: 0.7,
      })
    }

    if (providers.length < 1000) break
    from += 1000
  }

  return urls
}
