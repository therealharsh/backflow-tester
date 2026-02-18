import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { marked } from 'marked'
import { getPostBySlug, getPublishedPosts } from '@/lib/blog'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const posts = await getPublishedPosts()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  const title = post.seo_title || post.title
  const description = post.seo_description || post.excerpt || ''

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      ...(post.cover_image_url ? { images: [post.cover_image_url] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

function blogPostingSchema(post: NonNullable<Awaited<ReturnType<typeof getPostBySlug>>>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? '',
    datePublished: post.published_at,
    dateModified: post.updated_at,
    url: `${BASE}/blog/${post.slug}`,
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'FindBackflowTesters.com',
      url: BASE,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const html = marked.parse(post.content) as string

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema(post)) }}
      />

      <article className="section py-12 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-400 mb-6 flex items-center gap-1.5">
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-blue-600 transition-colors">
            Blog
          </Link>
          <span>/</span>
          <span className="text-gray-600 truncate">{post.title}</span>
        </nav>

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full rounded-2xl mb-8 max-h-[400px] object-cover"
          />
        )}

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl font-bold mb-3">{post.title}</h1>

        {post.published_at && (
          <p className="text-sm text-gray-400 mb-8">
            {new Date(post.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        <div
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link
            href="/blog"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
          >
            &larr; Back to all posts
          </Link>
        </div>
      </article>
    </>
  )
}
