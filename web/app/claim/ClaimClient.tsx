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

export default function ClaimClient({ initialQuery = '' }: { initialQuery?: string }) {
  return (
    <Suspense fallback={null}>
      <ClaimClientInner initialQuery={initialQuery} />
    </Suspense>
  )
}

function ClaimClientInner({ initialQuery }: { initialQuery: string }) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'register' ? 'register' : 'search'
  const [tab, setTab] = useState<'search' | 'register'>(initialTab)

  return (
    <div className="mt-10">
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

      {tab === 'search' ? <SearchTab initialQuery={initialQuery} onSwitchToRegister={() => setTab('register')} /> : <RegisterTab />}
    </div>
  )
}

/* ── Search Tab ────────────────────────────────────────────────── */

function SearchTab({ initialQuery, onSwitchToRegister }: { initialQuery: string; onSwitchToRegister: () => void }) {
  const [query, setQuery] = useState(initialQuery)
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

interface SubmitResult {
  listingName: string
  listingLocation: string
}

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
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState('')

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'register',
          businessName: form.businessName,
          contactName: form.contactName,
          contactEmail: form.email,
          contactPhone: form.phone || undefined,
          address: form.address || undefined,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode || undefined,
          website: form.website || undefined,
          message: form.message || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setResult({
        listingName: data.listingName ?? form.businessName,
        listingLocation: data.listingLocation ?? `${form.city}, ${form.state}`,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return <RegisterConfirmation email={form.email} result={result} />
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional Notes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          rows={2}
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          placeholder="Anything else we should know..."
        />
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
        {submitting ? 'Submitting...' : 'Submit for Approval'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        We&apos;ll review your submission and respond within 2 business days. No login required.
      </p>
    </form>
  )
}

/* ── Register confirmation ──────────────────────────────────────── */

function RegisterConfirmation({ email, result }: { email: string; result: SubmitResult }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-2">Submitted for Approval</h3>

      <p className="text-sm text-gray-600 leading-relaxed mb-2">
        Your registration for <strong>{result.listingName}</strong> ({result.listingLocation}) has been received.
      </p>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">
        We&apos;ll review and get back to <strong>{email}</strong> within{' '}
        <strong>2 business days</strong>. Check your inbox for a confirmation email.
      </p>

      {/* Plan cards — matches /claim/pricing layout */}
      <div className="text-left mb-6">
        <h4 className="text-sm font-bold text-gray-900 mb-3">Available Plans After Approval</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          {/* Free */}
          <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
            <h5 className="text-sm font-bold text-gray-900">Free</h5>
            <p className="text-xs text-gray-500 mt-0.5">Verified owner badge</p>
          </div>
          {/* Starter */}
          <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
            <h5 className="text-sm font-bold text-gray-900">Starter</h5>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-gray-900">$49</span>
              <span className="text-xs text-gray-500">/mo</span>
            </div>
            <ul className="mt-2 space-y-1">
              {['Appear higher in search results', 'Highlighted listing card', '"Premium" badge on your listing', 'Priority quote leads'].map((f) => (
                <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          {/* Pro */}
          <div className="relative p-4 rounded-xl border-2 border-blue-600 bg-blue-50/30 shadow-md">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              Most Popular
            </span>
            <h5 className="text-sm font-bold text-gray-900">Pro</h5>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-gray-900">$99</span>
              <span className="text-xs text-gray-500">/mo</span>
            </div>
            <ul className="mt-2 space-y-1">
              {['Everything in Starter', 'Higher placement than Starter', '"Top Rated" badge (if 4.7+ rating)', 'Prominent "Get Quote" button', 'Priority in nearby city results'].map((f) => (
                <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          {/* Featured */}
          <div className="p-4 rounded-xl border-2 border-gray-200 bg-white">
            <h5 className="text-sm font-bold text-gray-900">Featured</h5>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-extrabold text-gray-900">$149</span>
              <span className="text-xs text-gray-500">/mo</span>
            </div>
            <ul className="mt-2 space-y-1">
              {['Everything in Pro', 'Highest placement in results', '"Featured" badge on your listing', 'Prominent card styling', 'Maximum visibility across all pages'].map((f) => (
                <li key={f} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">
          You&apos;ll choose and pay after approval &mdash; no charge until then.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
        <p className="text-xs font-semibold text-amber-800 mb-0.5">Verification SLA</p>
        <p className="text-xs text-amber-700">
          Our team reviews all submissions within 2 business days. You&apos;ll receive an email once your listing is approved.
        </p>
      </div>
    </div>
  )
}
