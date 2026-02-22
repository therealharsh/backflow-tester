import { NextResponse } from 'next/server'
import {
  BASE,
  buildUrlset,
  fetchCitiesPaginated,
  fetchProviderSlugsPaginated,
  cityPageCount,
  providerPageCount,
  type SitemapEntry,
} from '@/lib/sitemap-helpers'

/**
 * GET /sitemaps/cities-{page}.xml
 * GET /sitemaps/providers-{page}.xml
 *
 * Dynamic handler for paginated city and provider sitemaps.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Match cities-N.xml
  const cityMatch = slug.match(/^cities-(\d+)\.xml$/)
  if (cityMatch) {
    const page = parseInt(cityMatch[1], 10)
    const maxPages = await cityPageCount()
    if (page < 0 || page >= maxPages) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const cities = await fetchCitiesPaginated(page)
    const entries: SitemapEntry[] = cities.map((c) => ({
      url: `${BASE}/${c.stateCode}/${c.citySlug}`,
      ...(c.lastUpdated ? { lastModified: c.lastUpdated } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

    return new NextResponse(buildUrlset(entries), {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    })
  }

  // Match providers-N.xml
  const providerMatch = slug.match(/^providers-(\d+)\.xml$/)
  if (providerMatch) {
    const page = parseInt(providerMatch[1], 10)
    const maxPages = await providerPageCount()
    if (page < 0 || page >= maxPages) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const providers = await fetchProviderSlugsPaginated(page)
    const entries: SitemapEntry[] = providers.map((p) => ({
      url: `${BASE}/providers/${p.slug}`,
      ...(p.lastUpdated ? { lastModified: p.lastUpdated } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))

    return new NextResponse(buildUrlset(entries), {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    })
  }

  return new NextResponse('Not Found', { status: 404 })
}
