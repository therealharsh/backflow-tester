'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ClaimRequest {
  id: string
  type: 'claim' | 'register'
  provider_place_id: string | null
  submitted_listing: Record<string, string> | null
  contact_name: string
  contact_email: string
  contact_phone: string | null
  message: string | null
  status: string
  reviewed_at: string | null
  created_at: string
  provider: {
    name: string
    city: string
    state_code: string
    provider_slug: string
  } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function AdminClaimsClient({
  initialRequests,
  accessToken,
}: {
  initialRequests: ClaimRequest[]
  accessToken: string
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)
  const pendingCount = requests.filter((r) => r.status === 'pending').length

  async function handleAction(requestId: string, action: 'approve' | 'reject') {
    const confirmMsg =
      action === 'approve'
        ? 'Approve this request? An approval email with login link will be sent.'
        : 'Reject this request? A rejection email will be sent.'

    if (!confirm(confirmMsg)) return

    setActionLoading(requestId)

    try {
      const res = await fetch('/api/admin/claim-requests', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ requestId, action }),
      })

      const data = await res.json()

      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? { ...r, status: data.status, reviewed_at: new Date().toISOString() }
              : r,
          ),
        )
        if (data.warning) {
          alert(`Warning: ${data.warning}`)
        }
      } else {
        alert(data.error ?? 'Action failed')
      }
    } catch {
      alert('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claim Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendingCount} pending review
          </p>
        </div>
        <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Admin
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize ${
              filter === f
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          No {filter === 'all' ? '' : filter} requests.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              actionLoading={actionLoading}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({
  req,
  actionLoading,
  onAction,
}: {
  req: ClaimRequest
  actionLoading: string | null
  onAction: (id: string, action: 'approve' | 'reject') => void
}) {
  const listingName =
    req.type === 'claim' && req.provider
      ? req.provider.name
      : req.submitted_listing?.name ?? 'Unknown'

  const listingLocation =
    req.type === 'claim' && req.provider
      ? `${req.provider.city}, ${req.provider.state_code}`
      : [req.submitted_listing?.city, req.submitted_listing?.state].filter(Boolean).join(', ')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                STATUS_COLORS[req.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {req.status}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 uppercase tracking-wider">
              {req.type}
            </span>
          </div>

          {/* Listing info */}
          <p className="text-sm font-semibold text-gray-900">
            {req.type === 'claim' && req.provider ? (
              <Link
                href={`/providers/${req.provider.provider_slug}`}
                className="hover:text-blue-600 transition-colors"
              >
                {listingName}
              </Link>
            ) : (
              listingName
            )}
            {listingLocation && (
              <span className="text-gray-500 font-normal"> &mdash; {listingLocation}</span>
            )}
          </p>

          {/* Contact info */}
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{req.contact_email}</span>
            <span>{req.contact_name}</span>
            {req.contact_phone && <span>{req.contact_phone}</span>}
            <span>{new Date(req.created_at).toLocaleDateString()}</span>
          </div>

          {/* Register-specific: show submitted listing details */}
          {req.type === 'register' && req.submitted_listing && (
            <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              <span className="font-medium text-gray-600">Submitted: </span>
              {[
                req.submitted_listing.address,
                req.submitted_listing.phone,
                req.submitted_listing.website,
              ]
                .filter(Boolean)
                .join(' · ') || 'No extra details'}
            </div>
          )}

          {/* Message/proof */}
          {req.message && (
            <p className="mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-2">
              <span className="font-medium">Notes: </span>
              {req.message}
            </p>
          )}
        </div>

        {/* Actions */}
        {req.status === 'pending' && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => onAction(req.id, 'approve')}
              disabled={actionLoading === req.id}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {actionLoading === req.id ? '...' : 'Approve'}
            </button>
            <button
              onClick={() => onAction(req.id, 'reject')}
              disabled={actionLoading === req.id}
              className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
