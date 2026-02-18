import type { Metadata } from 'next'
import Link from 'next/link'
import { getPosts, stripHtml, type WPPost } from '@/lib/wordpress'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
const POSTS_PER_PAGE = 12

export const metadata: Metadata = {
  title: 'Backflow Testing Resources & Guides',
  description:
    'Expert insights on backflow prevention, RPZ testing requirements, cross-connection control, and water safety compliance.',
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: { 'application/rss+xml': `${SITE_URL}/blog/rss.xml` },
  },
  openGraph: {
    title: 'Backflow Testing Resources & Guides',
    description:
      'Expert insights on backflow prevention, RPZ testing, and water safety compliance.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
}

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

function PostCard({ post }: { post: WPPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group">
      <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200 h-full flex flex-col">
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
          <div className="aspect-[16/9] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-blue-200"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6V7.5z"
              />
            </svg>
          </div>
        )}

        <div className="p-5 flex flex-col flex-1">
          {post.categories.length > 0 && (
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
              {post.categories[0].name}
            </span>
          )}

          <h2 className="mt-1 text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors line-clamp-2 leading-snug">
            {post.title}
          </h2>

          <p className="mt-2 text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {stripHtml(post.excerpt)}
          </p>

          <div className="flex-1" />

          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <span>{post.author}</span>
            <span>&middot;</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
          </div>
        </div>
      </article>
    </Link>
  )
}

interface Props {
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function BlogPage({ searchParams }: Props) {
  const pageParam =
    typeof searchParams.page === 'string' ? searchParams.page : '1'
  const page = Math.max(1, parseInt(pageParam, 10))

  const { posts: allPosts } = await getPosts({ first: 100 })

  const start = (page - 1) * POSTS_PER_PAGE
  const posts = allPosts.slice(start, start + POSTS_PER_PAGE)
  const totalPages = Math.ceil(allPosts.length / POSTS_PER_PAGE)

  // BreadcrumbList JSON-LD
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${SITE_URL}/blog`,
      },
    ],
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
        <span className="text-gray-900 font-medium">Blog</span>
      </nav>

      {/* Header */}
      <h1 className="text-3xl font-bold text-gray-900">
        Backflow Testing Resources &amp; Guides
      </h1>
      <p className="text-gray-600 mt-2 max-w-2xl">
        Stay informed with expert insights on backflow prevention, RPZ testing
        requirements, cross-connection control, and water safety compliance.
      </p>

      {/* Posts */}
      {posts.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="mt-12 text-center py-16 bg-white rounded-2xl border border-gray-100">
          <svg
            className="w-12 h-12 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6V7.5z"
            />
          </svg>
          <p className="text-lg font-medium text-gray-700">Blog coming soon</p>
          <p className="text-sm text-gray-500 mt-1">
            We&apos;re working on helpful guides about backflow testing.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-10">
          {page > 1 && (
            <Link
              href={page === 2 ? '/blog' : `/blog?page=${page - 1}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              &larr; Previous
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/blog?page=${page + 1}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="mt-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8 sm:p-10 text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Find a Certified Backflow Tester Near You
        </h2>
        <p className="text-gray-600 mt-2 mb-6">
          Browse our directory of verified backflow testing professionals across
          the United States.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-sm"
        >
          Search Providers &rarr;
        </Link>
      </div>
    </div>
  )
}
