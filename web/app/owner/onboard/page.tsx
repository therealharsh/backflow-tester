'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import type { SubscriptionTier } from '@/types'
import Link from 'next/link'

type Phase = 'loading' | 'no-auth' | 'onboarding' | 'plan-select' | 'error' | 'done'

const PLANS: {
  tier: SubscriptionTier
  label: string
  price: string
  priceNote: string
  features: string[]
  cta: string
}[] = [
  {
    tier: 'free',
    label: 'Free',
    price: '$0',
    priceNote: 'forever',
    features: ['Verified owner badge on your listing'],
    cta: 'Activate Free Plan',
  },
  {
    tier: 'starter',
    label: 'Starter',
    price: '$49',
    priceNote: '/mo',
    features: ['Verified owner badge', 'Edit your listing details'],
    cta: 'Subscribe — $49/mo',
  },
  {
    tier: 'premium',
    label: 'Premium',
    price: '$99',
    priceNote: '/mo',
    features: ['Everything in Starter', 'Promoted within 20 miles of your location'],
    cta: 'Subscribe — $99/mo',
  },
  {
    tier: 'pro',
    label: 'Pro',
    price: '$149',
    priceNote: '/mo',
    features: ['Everything in Premium', 'Lead highlights in admin alerts'],
    cta: 'Subscribe — $149/mo',
  },
]

export default function OwnerOnboardPage() {
  return (
    <Suspense fallback={<Shell><div className="text-center py-16"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div></Shell>}>
      <OwnerOnboardInner />
    </Suspense>
  )
}

function OwnerOnboardInner() {
  const searchParams = useSearchParams()
  const requestId = searchParams.get('request')

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [providerPlaceId, setProviderPlaceId] = useState<string | null>(null)
  const [desiredTier, setDesiredTier] = useState<SubscriptionTier>('free')
  const [activating, setActivating] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const runOnboard = useCallback(async (token: string, reqId: string) => {
    setPhase('onboarding')

    const res = await fetch('/api/owner/onboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId: reqId }),
    })

    const data = await res.json()

    if (!res.ok) {
      // Already onboarded is fine — proceed to plan selection
      if (data.error === 'already_onboarded' && data.providerPlaceId) {
        setProviderPlaceId(data.providerPlaceId)
        setPhase('plan-select')
        return
      }
      setError(data.error ?? 'Onboarding failed')
      setPhase('error')
      return
    }

    setProviderPlaceId(data.providerPlaceId)
    setDesiredTier(data.desiredTier ?? 'free')
    setPhase('plan-select')
  }, [])

  useEffect(() => {
    if (!requestId) {
      setError('Missing request ID in URL')
      setPhase('error')
      return
    }

    const supabase = getBrowserClient()

    // Check current session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        setAccessToken(data.session.access_token)
        runOnboard(data.session.access_token, requestId)
      } else {
        setPhase('no-auth')
      }
    })

    // Listen for auth state changes (magic link sign-in)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        setAccessToken(session.access_token)
        runOnboard(session.access_token, requestId)
      }
    })

    return () => subscription.unsubscribe()
  }, [requestId, runOnboard])

  async function handleFreePlan() {
    if (!providerPlaceId || !accessToken) return
    setActivating(true)

    try {
      const res = await fetch('/api/owner/activate-free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ providerPlaceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to activate')
        return
      }

      setPhase('done')
    } catch {
      setError('Network error')
    } finally {
      setActivating(false)
    }
  }

  async function handlePaidPlan(tier: 'starter' | 'premium' | 'pro') {
    if (!providerPlaceId || !accessToken) return
    setActivating(true)

    try {
      const res = await fetch('/api/owner/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ providerPlaceId, tier }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to create checkout')
        setActivating(false)
        return
      }

      // Redirect to Stripe checkout
      window.location.href = data.url
    } catch {
      setError('Network error')
      setActivating(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'onboarding') {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">
            {phase === 'loading' ? 'Checking your session...' : 'Setting up your account...'}
          </p>
        </div>
      </Shell>
    )
  }

  // ── Not authenticated ────────────────────────────────────────
  if (phase === 'no-auth') {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto mb-4">
            Please sign in to continue with onboarding.
          </p>
          <Link
            href="/owner/login"
            className="inline-block px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </Shell>
    )
  }

  // ── Error ────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something Went Wrong</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto mb-4">{error}</p>
          <Link
            href="/claim"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Back to Claim Page
          </Link>
        </div>
      </Shell>
    )
  }

  // ── Done (free plan activated) ───────────────────────────────
  if (phase === 'done') {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re All Set!</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">
            Your listing is now verified. The owner badge will appear on your listing page.
          </p>
          <Link
            href="/owner/dashboard"
            className="inline-block px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </Shell>
    )
  }

  // ── Plan selection ───────────────────────────────────────────
  return (
    <Shell>
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome! Choose Your Plan</h2>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          Your listing has been verified. Select a plan to get started.
          You can always upgrade later from your dashboard.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-6 text-center">
          {error}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {PLANS.map((plan) => {
          const isDesired = plan.tier === desiredTier
          return (
            <div
              key={plan.tier}
              className={`relative p-5 rounded-xl border-2 transition-colors ${
                isDesired
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {isDesired && (
                <span className="absolute -top-2.5 left-4 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  Your Selection
                </span>
              )}

              <div className="mb-3">
                <h3 className="text-base font-bold text-gray-900">{plan.label}</h3>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {plan.price}
                  <span className="text-sm font-normal text-gray-500">{plan.priceNote}</span>
                </p>
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => {
                  setError('')
                  if (plan.tier === 'free') {
                    handleFreePlan()
                  } else {
                    handlePaidPlan(plan.tier as 'starter' | 'premium' | 'pro')
                  }
                }}
                disabled={activating}
                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  plan.tier === 'free'
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-blue-700 text-white hover:bg-blue-800'
                }`}
              >
                {activating ? 'Processing...' : plan.cta}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center mt-6">
        Paid plans are billed monthly via Stripe. Cancel anytime from your dashboard.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-2">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">
          Owner Onboarding
        </p>
      </div>
      {children}
    </div>
  )
}
