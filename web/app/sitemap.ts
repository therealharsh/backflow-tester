import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase'
import { getPublishedPosts } from '@/lib/blog'
import { STATE_NAMES } from '@/lib/geo-utils'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient()
  const urls: MetadataRoute.Sitemap = []

  // Homepage
  urls.push({ url: BASE, changeFrequency: 'weekly', priority: 1.0 })

  // All 50 states + DC — always included even if no providers
  for (const code of Object.keys(STATE_NAMES)) {
    urls.push({
      url: `${BASE}/${code.toLowerCase()}`,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  // City pages from DB
  const { data: cities } = await supabase
    .from('cities')
    .select('city_slug, state_code, updated_at')
    .order('provider_count', { ascending: false })

  for (const c of cities ?? []) {
    urls.push({
      url: `${BASE}/${c.state_code.toLowerCase()}/${c.city_slug}`,
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
