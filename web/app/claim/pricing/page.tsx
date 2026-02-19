'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: 49,
    features: [
      'Appear higher in search results',
      'Highlighted listing card',
      '"Premium" badge on your listing',
      'Priority quote leads',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 99,
    popular: true,
    features: [
      'Everything in Starter',
      'Higher placement than Starter',
      '"Top Rated" badge (if 4.7+ rating)',
      'Prominent "Get Quote" button',
      'Priority in nearby city results',
    ],
  },
  {
    key: 'featured',
    name: 'Featured',
    price: 149,
    features: [
      'Everything in Pro',
      'Highest placement in results',
      '"Featured" badge on your listing',
      'Prominent card styling',
      'Maximum visibility across all pages',
    ],
  },
]

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <PricingInner />
    </Suspense>
  )
}

function PricingInner() {
  const searchParams = useSearchParams()
  const providerId = searchParams.get('provider')
  const claimId = searchParams.get('claim')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleChoosePlan(plan: string) {
    if (!providerId || !claimId) {
      setError('Missing claim information. Please go back and verify your email first.')
      return
    }

    setError('')
    setLoading(plan)

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, claimId, plan }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to start checkout')
        return
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  if (!providerId || !claimId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-600 mb-6">This page requires a verified claim. Please start from your provider listing.</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            Go to Homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Upgrade Your Listing</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          Choose Your Plan
        </h1>
        <p className="text-gray-600 max-w-lg mx-auto">
          Get more visibility, more leads, and premium placement in search results.
          Cancel anytime.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-8 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className={`relative rounded-2xl border-2 p-6 flex flex-col ${
              plan.popular
                ? 'border-blue-600 bg-blue-50/30 shadow-lg'
                : 'border-gray-200 bg-white'
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                <span className="text-gray-500 text-sm">/mo</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleChoosePlan(plan.key)}
              disabled={loading !== null}
              className={`w-full py-3 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                plan.popular
                  ? 'bg-blue-700 text-white hover:bg-blue-800'
                  : 'bg-white text-blue-700 border-2 border-blue-600 hover:bg-blue-50'
              }`}
            >
              {loading === plan.key ? 'Redirecting...' : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-8">
        All plans are billed monthly. Cancel anytime from your Stripe dashboard.
        No long-term contracts.
      </p>
    </div>
  )
}
