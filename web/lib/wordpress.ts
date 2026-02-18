/**
 * WordPress headless CMS client via WPGraphQL.
 *
 * Fetches blog posts from a WordPress instance using GraphQL.
 * Supports optional Yoast SEO fields (auto-detected).
 * All fetches use ISR revalidation for performance.
 */

const GRAPHQL_URL = process.env.WORDPRESS_GRAPHQL_URL ?? ''
const REVALIDATE = parseInt(process.env.BLOG_REVALIDATE_SECONDS ?? '3600', 10)

// ── Types ────────────────────────────────────────────────────────────────

export interface WPPost {
  slug: string
  title: string
  excerpt: string
  date: string
  content?: string
  featuredImage?: { sourceUrl: string; altText: string }
  author: string
  categories: { name: string; id: number }[]
  tags: string[]
  seo?: {
    title?: string
    description?: string
    ogImage?: string
  }
}

export interface WPPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// ── Internal helpers ─────────────────────────────────────────────────────

async function fetchGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | null> {
  if (!GRAPHQL_URL) return null

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: REVALIDATE },
    })
    if (!res.ok) return null

    const json = await res.json()
    if (json.errors) {
      console.error('[WP GraphQL]', json.errors)
      return null
    }
    return json.data as T
  } catch (err) {
    console.error('[WP GraphQL] Fetch failed:', err)
    return null
  }
}

function normalizePost(raw: Record<string, unknown>): WPPost {
  const r = raw as Record<string, any>
  return {
    slug: r.slug ?? '',
    title: r.title ?? '',
    excerpt: r.excerpt ?? '',
    date: r.date ?? '',
    content: r.content,
    featuredImage: r.featuredImage?.node
      ? {
          sourceUrl: r.featuredImage.node.sourceUrl,
          altText: r.featuredImage.node.altText ?? '',
        }
      : undefined,
    author: r.author?.node?.name ?? 'Staff Writer',
    categories: (r.categories?.nodes ?? []).map((c: any) => ({
      name: c.name,
      id: c.databaseId,
    })),
    tags: (r.tags?.nodes ?? []).map((t: any) => t.name),
    seo: r.seo
      ? {
          title: r.seo.title || undefined,
          description: r.seo.metaDesc || undefined,
          ogImage: r.seo.opengraphImage?.sourceUrl || undefined,
        }
      : undefined,
  }
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

export function estimateReadingTime(html: string): number {
  const words = stripHtml(html).split(/\s+/).length
  return Math.max(1, Math.ceil(words / 250))
}

// ── Yoast SEO detection ──────────────────────────────────────────────────

let _hasYoast: boolean | null = null

async function detectYoast(): Promise<boolean> {
  if (_hasYoast !== null) return _hasYoast

  const data = await fetchGraphQL<{
    __type: { fields: { name: string }[] } | null
  }>(`{ __type(name: "Post") { fields { name } } }`)

  _hasYoast =
    data?.__type?.fields?.some((f) => f.name === 'seo') ?? false
  return _hasYoast
}

// ── GraphQL fragments ────────────────────────────────────────────────────

const POST_SUMMARY = `
  slug
  title
  excerpt
  date
  featuredImage { node { sourceUrl altText } }
  author { node { name } }
  categories { nodes { name databaseId } }
  tags { nodes { name } }
`

const SEO_FRAGMENT = `seo { title metaDesc opengraphImage { sourceUrl } }`

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetch published posts (summaries only, no content).
 */
export async function getPosts(opts?: {
  first?: number
  after?: string
}): Promise<{ posts: WPPost[]; pageInfo: WPPageInfo }> {
  const empty = { posts: [], pageInfo: { hasNextPage: false, endCursor: null } }
  if (!GRAPHQL_URL) return empty

  const first = opts?.first ?? 100
  const yoast = await detectYoast()
  const seo = yoast ? SEO_FRAGMENT : ''

  const data = await fetchGraphQL<{
    posts: {
      nodes: Record<string, unknown>[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }>(
    `query GetPosts($first: Int!, $after: String) {
      posts(first: $first, after: $after, where: { status: PUBLISH }) {
        pageInfo { hasNextPage endCursor }
        nodes { ${POST_SUMMARY} ${seo} }
      }
    }`,
    { first, after: opts?.after ?? null },
  )

  if (!data?.posts) return empty

  return {
    posts: data.posts.nodes.map(normalizePost),
    pageInfo: data.posts.pageInfo,
  }
}

/**
 * Fetch a single post by slug (includes full content).
 */
export async function getPostBySlug(slug: string): Promise<WPPost | null> {
  if (!GRAPHQL_URL) return null

  const yoast = await detectYoast()
  const seo = yoast ? SEO_FRAGMENT : ''

  const data = await fetchGraphQL<{ post: Record<string, unknown> | null }>(
    `query GetPost($slug: ID!) {
      post(id: $slug, idType: SLUG) {
        ${POST_SUMMARY}
        content
        ${seo}
      }
    }`,
    { slug },
  )

  if (!data?.post) return null
  return normalizePost(data.post)
}

/**
 * Fetch all published post slugs (for sitemap / static params).
 */
export async function getAllPostSlugs(): Promise<string[]> {
  if (!GRAPHQL_URL) return []

  const data = await fetchGraphQL<{
    posts: { nodes: { slug: string }[] }
  }>(
    `query GetAllSlugs {
      posts(first: 1000, where: { status: PUBLISH }) {
        nodes { slug }
      }
    }`,
  )

  return data?.posts?.nodes?.map((n) => n.slug) ?? []
}

/**
 * Fetch recent posts, optionally excluding one (for "Related" sections).
 */
export async function getRecentPosts(opts?: {
  first?: number
  excludeSlug?: string
}): Promise<WPPost[]> {
  const limit = (opts?.first ?? 3) + 1
  const { posts } = await getPosts({ first: limit })

  const filtered = opts?.excludeSlug
    ? posts.filter((p) => p.slug !== opts.excludeSlug)
    : posts

  return filtered.slice(0, opts?.first ?? 3)
}
