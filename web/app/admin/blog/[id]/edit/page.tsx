'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAdmin } from '../../../AdminContext'
import PostForm from '../../_components/PostForm'
import type { BlogPost } from '@/types'

export default function EditPostPage() {
  const { session, loading } = useAdmin()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/admin/login')
      return
    }
    fetch(`/api/admin/blog/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setPost(data)
        setFetching(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading])

  if (loading || fetching) return <p className="text-gray-400">Loading…</p>
  if (!session || !post) return null

  async function handleSave(data: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/admin/blog/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to update post')
      return
    }
    router.push('/admin/blog')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Post</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <PostForm post={post} onSave={handleSave} accessToken={session!.access_token} />
    </div>
  )
}
