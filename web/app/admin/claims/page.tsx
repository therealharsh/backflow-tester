'use client'

import { useEffect, useState } from 'react'
import { useAdmin } from '../AdminContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Claim {
  id: string
  provider_id: string
  claimant_email: string
  claimant_name: string | null
  claimant_phone: string | null
  status: string
  verified_at: string | null
  created_at: string
  provider: {
    place_id: string
    name: string
    city: string
    state_code: string
    provider_slug: string
  } | null
}

export default function AdminClaimsPage() {
  const { session, loading: authLoading } = useAdmin()
  const router = useRouter()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      router.push('/admin/login')
      return
    }

    fetch('/api/admin/claims', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setClaims(data.claims ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, authLoading, router])

  async function handleAction(claimId: string, action: 'approve' | 'reject') {
    if (!session) return
    setActionLoading(claimId)

    try {
      const res = await fetch('/api/admin/claims', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ claimId, action }),
      })

      if (res.ok) {
        setClaims((prev) =>
          prev.map((c) =>
            c.id === claimId
              ? { ...c, status: action === 'approve' ? 'approved' : 'rejected' }
              : c,
          ),
        )
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (authLoading || loading) {
    return <p className="text-gray-500">Loading...</p>
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    verified: 'bg-blue-100 text-blue-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Listing Claims</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back to Admin
        </Link>
      </div>

      {claims.length === 0 ? (
        <p className="text-gray-500">No claims yet.</p>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[claim.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {claim.status}
                  </span>
                  {claim.provider ? (
                    <Link
                      href={`/providers/${claim.provider.provider_slug}`}
                      className="text-sm font-semibold text-gray-900 hover:text-blue-600 truncate"
                    >
                      {claim.provider.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-500">Unknown provider</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1 space-x-3">
                  <span>{claim.claimant_email}</span>
                  {claim.claimant_name && <span>{claim.claimant_name}</span>}
                  {claim.claimant_phone && <span>{claim.claimant_phone}</span>}
                  <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {(claim.status === 'pending' || claim.status === 'verified') && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(claim.id, 'approve')}
                    disabled={actionLoading === claim.id}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(claim.id, 'reject')}
                    disabled={actionLoading === claim.id}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
