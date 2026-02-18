import { getPosts, stripHtml } from '@/lib/wordpress'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export async function GET() {
  const { posts } = await getPosts({ first: 50 })

  const items = posts
    .map(
      (post) => `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <description><![CDATA[${stripHtml(post.excerpt)}]]></description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
    </item>`,
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>FindBackflowTesters.com Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Backflow testing resources, guides, and industry news.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
    },
  })
}
