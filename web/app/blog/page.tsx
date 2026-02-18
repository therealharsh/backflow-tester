import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedPosts } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Tips, guides, and news about backflow testing, cross-connection control, and water safety.',
}

export const revalidate = 600 // refresh every 10 min

export default async function BlogPage() {
  const posts = await getPublishedPosts()

  return (
    <div className="section py-12">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-gray-500 mb-10 max-w-xl">
        Tips, guides, and news about backflow testing, cross-connection control,
        and water safety.
      </p>

      {posts.length === 0 && (
        <p className="text-gray-400 italic">No posts yet — check back soon!</p>
      )}

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.slug}`}
            className="card overflow-hidden group"
          >
            {post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-5">
              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <h2 className="font-semibold text-lg mb-1 group-hover:text-blue-700 transition-colors">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="text-gray-500 text-sm line-clamp-3">
                  {post.excerpt}
                </p>
              )}
              {post.published_at && (
                <p className="text-xs text-gray-400 mt-3">
                  {new Date(post.published_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
