import { NextResponse } from 'next/server'
import {
  BASE,
  buildUrlset,
  fetchBlogSlugs,
  type SitemapEntry,
} from '@/lib/sitemap-helpers'

/**
 * GET /sitemaps/blog.xml
 *
 * One entry per published blog post.
 */
export async function GET() {
  const posts = await fetchBlogSlugs()

  const entries: SitemapEntry[] = posts.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    ...(p.lastUpdated ? { lastModified: p.lastUpdated } : {}),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return new NextResponse(buildUrlset(entries), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
