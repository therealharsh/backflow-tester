import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.findbackflowtesters.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin/', '/search', '/api/'] }],
    sitemap: [
      `${BASE}/sitemap-index.xml`,
      `${BASE}/sitemap.xml`,
    ],
  }
}
