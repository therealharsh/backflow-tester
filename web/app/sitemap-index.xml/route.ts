import { NextResponse } from 'next/server'
import {
  BASE,
  buildSitemapIndex,
  cityPageCount,
  providerPageCount,
} from '@/lib/sitemap-helpers'

/**
 * GET /sitemap-index.xml
 *
 * Returns a <sitemapindex> pointing to all child sitemaps:
 *   /sitemaps/static.xml
 *   /sitemaps/states.xml
 *   /sitemaps/cities-0.xml, cities-1.xml, …
 *   /sitemaps/providers-0.xml, providers-1.xml, …
 *   /sitemaps/blog.xml
 */
export async function GET() {
  const cityPages = await cityPageCount()
  const providerPages = await providerPageCount()

  const urls: string[] = [
    `${BASE}/sitemaps/static.xml`,
    `${BASE}/sitemaps/states.xml`,
  ]

  for (let i = 0; i < cityPages; i++) {
    urls.push(`${BASE}/sitemaps/cities-${i}.xml`)
  }

  for (let i = 0; i < providerPages; i++) {
    urls.push(`${BASE}/sitemaps/providers-${i}.xml`)
  }

  urls.push(`${BASE}/sitemaps/blog.xml`)

  const xml = buildSitemapIndex(urls)

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
    },
  })
}
