import { NextResponse } from 'next/server'
import { BASE, buildUrlset, type SitemapEntry } from '@/lib/sitemap-helpers'

/**
 * GET /sitemaps/static.xml
 *
 * Homepage, blog index, and utility pages.
 * Does NOT include search, admin, or API routes.
 */
export async function GET() {
  const entries: SitemapEntry[] = [
    { url: BASE, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/learn`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/faqs`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/contact`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  return new NextResponse(buildUrlset(entries), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
