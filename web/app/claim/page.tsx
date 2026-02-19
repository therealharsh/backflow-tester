'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ClaimListingModal from '@/components/ClaimListingModal'

interface SearchResult {
  place_id: string
  name: string
  city: string
  state_code: string
  provider_slug: string
  rating: number | null
  reviews: number
  claimed: boolean
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center text-gray-500">Loading...</div>}>
      <ClaimPageInner />
    </Suspense>
  )
}

function ClaimPageInner() {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'search'
  const [tab, setTab] = useState<'search' | 'register'>(initialTab)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">For Backflow Professionals</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Claim or Register Your Listing</h1>
        <p className="text-gray-600">
          Already in our directory? Search and claim it. New here? Register your business to get listed.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-8">
        <button
          onClick={() => setTab('search')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'search'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Find My Listing
        </button>
        <button
          onClick={() => setTab('register')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'register'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Register New Listing
        </button>
      </div>

      {tab === 'search' ? <SearchTab onSwitchToRegister={() => setTab('register')} /> : <RegisterTab />}
    </div>
  )
}

/* ── Search Tab ────────────────────────────────────────────────── */

function SearchTab({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [claimTarget, setClaimTarget] = useState<SearchResult | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(false)

    try {
      const res = await fetch(`/api/claims/search?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setResults(data.providers ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  return (
    <>
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by business name..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-gray-600 mb-2">No listings found for &ldquo;{query}&rdquo;</p>
          <p className="text-sm text-gray-500">
            Not in our directory yet?{' '}
            <button
              onClick={onSwitchToRegister}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Register your business
            </button>
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((p) => (
            <div
              key={p.place_id}
              className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-200 transition-colors"
            >
              <div className="min-w-0">
                <Link
                  href={`/providers/${p.provider_slug}`}
                  className="font-semibold text-gray-900 hover:text-blue-600 transition-colors text-sm truncate block"
                >
                  {p.name}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.city}, {p.state_code}
                  {p.rating ? ` · ${p.rating.toFixed(1)} stars (${p.reviews})` : ''}
                </p>
              </div>

              {p.claimed ? (
                <span className="shrink-0 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                  Claimed
                </span>
              ) : (
                <button
                  onClick={() => setClaimTarget(p)}
                  className="shrink-0 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  Claim
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {claimTarget && (
        <ClaimListingModal
          providerId={claimTarget.place_id}
          providerName={claimTarget.name}
          onClose={() => setClaimTarget(null)}
        />
      )}
    </>
  )
}

/* ── Register Tab ──────────────────────────────────────────────── */

function RegisterTab() {
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    website: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/claims/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-10">
        <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Check Your Email</h3>
        <p className="text-sm text-gray-600 max-w-sm mx-auto">
          We sent a verification link to <strong>{form.email}</strong>.
          Click it to verify your listing and choose a premium plan.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Business Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.businessName}
          onChange={(e) => update('businessName', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="ABC Backflow Testing LLC"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.contactName}
            onChange={(e) => update('contactName', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="you@yourbusiness.com"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Website <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="https://yourbusiness.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Street Address <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => update('address', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="123 Main St"
        />
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Miami"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={2}
            value={form.state}
            onChange={(e) => update('state', e.target.value.toUpperCase())}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase"
            placeholder="FL"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ZIP <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            maxLength={10}
            value={form.postalCode}
            onChange={(e) => update('postalCode', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="33101"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Registering...' : 'Register & Send Verification Email'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        We&apos;ll create your listing and send a verification email. After verifying, you can upgrade to a premium plan.
      </p>
    </form>
  )
}
