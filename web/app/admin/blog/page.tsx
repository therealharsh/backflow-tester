'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAdmin } from '../AdminContext'
import { getBrowserClient } from '@/lib/supabase'

interface PostRow {
  id: string
  slug: string
  title: string
  status: string
  published_at: string | null
  created_at: string
  tags: string[]
}

export default function AdminBlogListPage() {
  const { session, loading } = useAdmin()
  const router = useRouter()
  const [posts, setPosts] = useState<PostRow[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/admin/login')
      return
    }
    fetchPosts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading])

  async function fetchPosts() {
    const res = await fetch('/api/admin/blog', {
      headers: { Authorization: `Bearer ${session!.access_token}` },
    })
    if (res.ok) {
      setPosts(await res.json())
    }
    setFetching(false)
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return
    await fetch(`/api/admin/blog/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session!.access_token}` },
    })
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleLogout() {
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  if (loading || fetching) return <p className="text-gray-400">Loading…</p>
  if (!session) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Blog Posts</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/blog/new" className="btn-primary text-sm">
            + New Post
          </Link>
          <button onClick={handleLogout} className="btn-ghost text-sm">
            Logout
          </button>
        </div>
      </div>

      {posts.length === 0 && (
        <p className="text-gray-400 italic">No posts yet.</p>
      )}

      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="card p-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    post.status === 'published'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {post.status}
                </span>
                <h2 className="font-semibold truncate">{post.title}</h2>
              </div>
              <p className="text-xs text-gray-400">
                /{post.slug} · Created{' '}
                {new Date(post.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/admin/blog/${post.id}/edit`}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(post.id, post.title)}
                className="text-sm text-red-500 hover:text-red-700 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
