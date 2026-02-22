'use client'

import { useState } from 'react'

interface Props {
  providerId: string
  providerName: string
  onClose: () => void
}

export default function ClaimListingModal({ providerId, providerName, onClose }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'claim',
          providerPlaceId: providerId,
          contactName: name,
          contactEmail: email,
          contactPhone: phone || undefined,
          message: message || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          <SubmittedConfirmation
            providerName={providerName}
            email={email}
            onClose={onClose}
          />
        ) : (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Claim This Listing</h3>
            <p className="text-sm text-gray-500 mb-5">
              Submit a claim for <strong>{providerName}</strong>. We&apos;ll review within 2 business days.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="claim-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="claim-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="John Smith"
                />
              </div>

              <div>
                <label htmlFor="claim-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Business Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="claim-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="you@yourbusiness.com"
                />
              </div>

              <div>
                <label htmlFor="claim-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  id="claim-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="claim-message" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes / Proof <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="claim-message"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  placeholder="Any details to help verify ownership..."
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
                {submitting ? 'Submitting...' : 'Submit Claim Request'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Confirmation after submit ──────────────────────────────────── */

function SubmittedConfirmation({
  providerName,
  email,
  onClose,
}: {
  providerName: string
  email: string
  onClose: () => void
}) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <h3 className="text-lg font-bold text-gray-900 mb-2">Submitted for Approval</h3>

      <p className="text-sm text-gray-600 leading-relaxed mb-4">
        Your claim for <strong>{providerName}</strong> has been received.
        We&apos;ll review it and get back to <strong>{email}</strong> within{' '}
        <strong>2 business days</strong>.
      </p>

      {/* Plan cards — matches /claim/pricing layout */}
      <div className="text-left mb-5">
        <h4 className="text-xs font-bold text-gray-900 mb-2">Available Plans After Approval</h4>
        <div className="grid grid-cols-2 gap-2">
          {/* Free */}
          <div className="p-3 rounded-lg border-2 border-gray-200 bg-white">
            <span className="text-xs font-bold text-gray-900">Free</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Verified owner badge</p>
          </div>
          {/* Starter */}
          <div className="p-3 rounded-lg border-2 border-gray-200 bg-white">
            <span className="text-xs font-bold text-gray-900">Starter</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <span className="text-sm font-extrabold text-gray-900">$49</span>
              <span className="text-[10px] text-gray-500">/mo</span>
            </div>
          </div>
          {/* Pro */}
          <div className="relative p-3 rounded-lg border-2 border-blue-600 bg-blue-50/30">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold px-2 py-0.5 rounded-full">
              Popular
            </span>
            <span className="text-xs font-bold text-gray-900">Pro</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <span className="text-sm font-extrabold text-gray-900">$99</span>
              <span className="text-[10px] text-gray-500">/mo</span>
            </div>
          </div>
          {/* Featured */}
          <div className="p-3 rounded-lg border-2 border-gray-200 bg-white">
            <span className="text-xs font-bold text-gray-900">Featured</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <span className="text-sm font-extrabold text-gray-900">$149</span>
              <span className="text-[10px] text-gray-500">/mo</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 text-center">
          You&apos;ll choose and pay after approval &mdash; no charge until then.
        </p>
      </div>

      <p className="text-xs text-gray-400 mb-5">
        Check your email for a confirmation with all the details.
      </p>

      <button
        onClick={onClose}
        className="px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
      >
        Got It
      </button>
    </div>
  )
}
