import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getPostBySlug,
  getAllPostSlugs,
  getRecentPosts,
  stripHtml,
  estimateReadingTime,
  type WPPost,
} from '@/lib/wordpress'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
const DEFAULT_OG =
  process.env.DEFAULT_OG_IMAGE_URL ?? `${SITE_URL}/hero-backflow.png`

interface Props {
  params: { slug: string }
}

// ── SEO metadata ─────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostBySlug(params.slug)
  if (!post) return { title: 'Post Not Found' }

  const title = post.seo?.title || post.title
  const description =
    post.seo?.description || stripHtml(post.excerpt).slice(0, 160)
  const image = post.seo?.ogImage || post.featuredImage?.sourceUrl || DEFAULT_OG

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/blog/${post.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export async function generateStaticParams() {
  const slugs = await getAllPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return d
  }
}

function RelatedCard({ post }: { post: WPPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group">
      <article className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all duration-200">
        {post.featuredImage ? (
          <div className="aspect-[16/9] overflow-hidden">
            <img
              src={post.featuredImage.sourceUrl}
              alt={post.featuredImage.altText || post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="aspect-[16/9] bg-gradient-to-br from-blue-50 to-blue-100" />
        )}
        <div className="p-4">
          <h3 className="font-bold text-sm text-gray-900 group-hover:text-blue-700 transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            {formatDate(post.date)}
          </p>
        </div>
      </article>
    </Link>
  )
}

// ── Page component ───────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: Props) {
  const post = await getPostBySlug(params.slug)
  if (!post) notFound()

  const related = await getRecentPosts({
    first: 3,
    excludeSlug: params.slug,
  })

  const readTime = post.content ? estimateReadingTime(post.content) : null

  // JSON-LD: BlogPosting
  const blogPostingLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: stripHtml(post.excerpt).slice(0, 200),
    datePublished: post.date,
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'FindBackflowTesters.com',
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    ...(post.featuredImage
      ? { image: post.featuredImage.sourceUrl }
      : {}),
  }

  // JSON-LD: BreadcrumbList
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${SITE_URL}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${SITE_URL}/blog/${post.slug}`,
      },
    ],
  }

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand-600">
          Home
        </Link>
        {' / '}
        <Link href="/blog" className="hover:text-brand-600">
          Blog
        </Link>
        {' / '}
        <span className="text-gray-900 font-medium line-clamp-1 inline">
          {post.title}
        </span>
      </nav>

      {/* Featured image */}
      {post.featuredImage && (
        <div className="relative aspect-[2/1] rounded-2xl overflow-hidden mb-8">
          <Image
            src={post.featuredImage.sourceUrl}
            alt={post.featuredImage.altText || post.title}
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 896px"
          />
        </div>
      )}

      {/* Categories */}
      {post.categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {post.categories.map((c) => (
            <span
              key={c.id}
              className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5 uppercase tracking-wider"
            >
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
        {post.title}
      </h1>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-4 mb-8">
        <span>{post.author}</span>
        <span>&middot;</span>
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        {readTime && (
          <>
            <span>&middot;</span>
            <span>{readTime} min read</span>
          </>
        )}
      </div>

      {/* Content */}
      <div
        className="blog-content"
        dangerouslySetInnerHTML={{ __html: post.content ?? '' }}
      />

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-gray-200">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-1"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Related posts */}
      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="text-xl font-bold text-gray-900 mb-5">
            More Articles
          </h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {related.map((r) => (
              <RelatedCard key={r.slug} post={r} />
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-14 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8 text-center">
        <h2 className="text-xl font-bold text-gray-900">
          Need a Backflow Tester?
        </h2>
        <p className="text-gray-600 mt-1 mb-5 text-sm">
          Find certified professionals in your area.
        </p>
        <form
          method="GET"
          action="/search"
          className="flex gap-2 max-w-md mx-auto"
        >
          <input
            type="text"
            name="query"
            placeholder="Enter city, ZIP, or state"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm"
          >
            Search
          </button>
        </form>
      </div>
    </article>
  )
}
