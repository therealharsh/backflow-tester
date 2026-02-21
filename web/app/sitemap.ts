import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase'
import { getPublishedPosts } from '@/lib/blog'
import { STATE_NAMES, haversineDistance } from '@/lib/geo-utils'
import { getAllCities } from '@/lib/city-data'

const BASE = 'https://www.findbackflowtesters.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient()
  const urls: MetadataRoute.Sitemap = []

  // Homepage
  urls.push({ url: BASE, changeFrequency: 'weekly', priority: 1.0 })

  // Static informational pages
  for (const path of ['/about', '/contact', '/faqs', '/learn', '/learn/why-backflow-testing-required', '/learn/choose-the-right-provider']) {
    urls.push({ url: `${BASE}${path}`, changeFrequency: 'monthly', priority: 0.7 })
  }

  // All 50 states + DC — always included even if no providers
  for (const code of Object.keys(STATE_NAMES)) {
    urls.push({
      url: `${BASE}/${code.toLowerCase()}`,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  // ── City pages — only indexable ones (>= 3 same-state providers within 20 mi) ─
  // Fetch all provider coordinates with state code
  const { data: allProviders } = await supabase
    .from('providers')
    .select('latitude, longitude, state_code')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const providerCoords = (allProviders ?? []) as { latitude: number; longitude: number; state_code: string }[]

  // Group providers by state for same-state matching
  const providersByState = new Map<string, { latitude: number; longitude: number }[]>()
  for (const p of providerCoords) {
    const list = providersByState.get(p.state_code) ?? []
    list.push({ latitude: p.latitude, longitude: p.longitude })
    providersByState.set(p.state_code, list)
  }

  const datasetCities = getAllCities()
  const indexedCitySlugs = new Set<string>()

  for (const city of datasetCities) {
    const stateProviders = providersByState.get(city.state_code) ?? []
    let count = 0
    for (const p of stateProviders) {
      if (haversineDistance(city.lat, city.lng, p.latitude, p.longitude) <= 20) {
        count++
        if (count >= 3) break
      }
    }
    if (count >= 3) {
      const key = `${city.state_code.toLowerCase()}/${city.slug}`
      indexedCitySlugs.add(key)
      urls.push({
        url: `${BASE}/${key}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  // Also include DB cities not in dataset that have providers
  const { data: dbCities } = await supabase
    .from('cities')
    .select('city_slug, state_code, updated_at')
    .gt('provider_count', 0)

  for (const c of dbCities ?? []) {
    const key = `${c.state_code.toLowerCase()}/${c.city_slug}`
    if (indexedCitySlugs.has(key)) continue
    indexedCitySlugs.add(key)
    urls.push({
      url: `${BASE}/${key}`,
      changeFrequency: 'weekly',
      priority: 0.7,
      ...(c.updated_at ? { lastModified: new Date(c.updated_at) } : {}),
    })
  }

  // Provider pages (paginated fetch)
  let from = 0
  while (true) {
    const { data: providers } = await supabase
      .from('providers')
      .select('provider_slug, updated_at')
      .range(from, from + 999)

    if (!providers || providers.length === 0) break

    for (const p of providers) {
      urls.push({
        url: `${BASE}/providers/${p.provider_slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
        ...(p.updated_at ? { lastModified: new Date(p.updated_at) } : {}),
      })
    }

    if (providers.length < 1000) break
    from += 1000
  }

  // Blog listing
  urls.push({ url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.6 })

  // Blog posts
  const posts = await getPublishedPosts()
  for (const post of posts) {
    urls.push({
      url: `${BASE}/blog/${post.slug}`,
      changeFrequency: 'monthly',
      priority: 0.5,
      ...(post.updated_at ? { lastModified: new Date(post.updated_at) } : {}),
    })
  }

  return urls
}
