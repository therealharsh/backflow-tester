'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import Link from 'next/link'

type Phase = 'signup' | 'creating' | 'plan-select' | 'done' | 'error'

const PLANS: {
  tier: string
  label: string
  price: string
  priceNote: string
  features: string[]
  cta: string
  popular?: boolean
}[] = [
  {
    tier: 'free',
    label: 'Free',
    price: '',
    priceNote: '',
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
    popular: true,
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

export default function OwnerSignupPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </Shell>
      }
    >
      <SignupInner />
    </Suspense>
  )
}

function SignupInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') ?? ''
  const requestId = searchParams.get('request') ?? ''

  const [phase, setPhase] = useState<Phase>('signup')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [providerPlaceId, setProviderPlaceId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [existingAccount, setExistingAccount] = useState(false)

  // ── Missing params ─────────────────────────────────────────────
  if (!email || !requestId) {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto mb-4">
            This link is missing required information. Please use the link from your approval email.
          </p>
          <Link href="/owner/login" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Sign in to your account &rarr;
          </Link>
        </div>
      </Shell>
    )
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setPhase('creating')

    try {
      // Step 1: Create the account server-side
      const createRes = await fetch('/api/owner/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, requestId }),
      })

      const createData = await createRes.json()

      if (!createRes.ok) {
        setError(createData.error ?? 'Failed to create account')
        setPhase('signup')
        return
      }

      if (createData.existing) {
        setExistingAccount(true)
      }

      // Step 2: Sign in client-side
      const supabase = getBrowserClient()
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError || !signInData.session) {
        if (createData.existing) {
          // Account exists but password doesn't match — they set a different password before
          setError('An account with this email already exists. Please sign in with your existing password.')
          setExistingAccount(true)
          setPhase('signup')
          return
        }
        setError('Account created but sign-in failed. Please try signing in.')
        setPhase('error')
        return
      }

      const token = signInData.session.access_token
      setAccessToken(token)

      // Step 3: Run onboarding
      const onboardRes = await fetch('/api/owner/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId }),
      })

      const onboardData = await onboardRes.json()

      if (!onboardRes.ok && onboardData.error !== 'already_onboarded') {
        setError(onboardData.error ?? 'Onboarding failed')
        setPhase('error')
        return
      }

      setProviderPlaceId(onboardData.providerPlaceId)
      setPhase('plan-select')
    } catch {
      setError('Something went wrong. Please try again.')
      setPhase('signup')
    }
  }

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
        setActivating(false)
        return
      }

      setPhase('done')
    } catch {
      setError('Network error')
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

      window.location.href = data.url
    } catch {
      setError('Network error')
      setActivating(false)
    }
  }

  // ── Creating account ───────────────────────────────────────────
  if (phase === 'creating') {
    return (
      <Shell>
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Setting up your account...</p>
        </div>
      </Shell>
    )
  }

  // ── Error ──────────────────────────────────────────────────────
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
          <Link href="/owner/login" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Try signing in &rarr;
          </Link>
        </div>
      </Shell>
    )
  }

  // ── Done (free plan activated) ─────────────────────────────────
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
            Your account has been created and your listing is now verified.
            You can sign in anytime with your email and password.
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

  // ── Plan selection ─────────────────────────────────────────────
  if (phase === 'plan-select') {
    return (
      <Shell>
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Account Created! Choose Your Plan</h2>
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
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative p-5 rounded-xl border-2 transition-colors ${
                plan.popular
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-blue-600 px-2.5 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}

              <div className="mb-3">
                <h3 className="text-base font-bold text-gray-900">{plan.label}</h3>
                {plan.price ? (
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {plan.price}
                    <span className="text-sm font-normal text-gray-500">{plan.priceNote}</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">Free forever</p>
                )}
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
                  plan.popular
                    ? 'bg-blue-700 text-white hover:bg-blue-800'
                    : plan.tier === 'free'
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-blue-700 text-white hover:bg-blue-800'
                }`}
              >
                {activating ? 'Processing...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          Paid plans are billed monthly via Stripe. Cancel anytime from your dashboard.
        </p>
      </Shell>
    )
  }

  // ── Signup form ────────────────────────────────────────────────
  return (
    <Shell>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Create Your Owner Account</h2>
          <p className="text-sm text-gray-600">
            Set up a password so you can sign in anytime to manage your listing.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors"
          >
            Create Account & Continue
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href={existingAccount ? `/owner/login` : `/owner/login`} className="text-blue-600 hover:text-blue-800 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-2">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">
          Owner Account Setup
        </p>
      </div>
      {children}
    </div>
  )
}
