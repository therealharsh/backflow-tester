import { NextResponse } from 'next/server'
import {
  BASE,
  buildUrlset,
  fetchStatesWithCounts,
  type SitemapEntry,
} from '@/lib/sitemap-helpers'

/**
 * GET /sitemaps/states.xml
 *
 * One entry per US state (e.g. /ca, /tx, /ny).
 */
export async function GET() {
  const states = await fetchStatesWithCounts()

  const entries: SitemapEntry[] = states.map((s) => ({
    url: `${BASE}/${s.code.toLowerCase()}`,
    ...(s.lastUpdated ? { lastModified: s.lastUpdated } : {}),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return new NextResponse(buildUrlset(entries), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
