'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '../AdminContext'
import AdminClaimsClient from './AdminClaimsClient'

export default function AdminClaimsPage() {
  const { session, loading } = useAdmin()
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [requests, setRequests] = useState<any[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!session) {
      router.replace('/admin/login')
      return
    }

    fetch('/api/admin/claim-requests', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        } else {
          setRequests(data.requests ?? [])
        }
      })
      .catch(() => setError('Failed to load claim requests'))
  }, [session, loading, router])

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!session) return null

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!requests) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Loading claim requests...</p>
      </div>
    )
  }

  return (
    <AdminClaimsClient
      initialRequests={requests}
      accessToken={session.access_token}
    />
  )
}
