'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '../../AdminContext'
import PostForm from '../_components/PostForm'

export default function NewPostPage() {
  const { session, loading } = useAdmin()
  const router = useRouter()
  const [error, setError] = useState('')

  if (loading) return <p className="text-gray-400">Loading…</p>
  if (!session) {
    router.replace('/admin/login')
    return null
  }

  async function handleSave(data: Record<string, unknown>) {
    setError('')
    const res = await fetch('/api/admin/blog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to create post')
      return
    }
    router.push('/admin/blog')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Post</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <PostForm onSave={handleSave} />
    </div>
  )
}
