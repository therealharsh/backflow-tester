'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function VerifyClaimPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <VerifyClaimInner />
    </Suspense>
  )
}

function VerifyClaimInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [providerId, setProviderId] = useState<string | null>(null)
  const [claimId, setClaimId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('No verification token provided.')
      return
    }

    fetch(`/api/claims/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) {
          setStatus('success')
          setProviderId(data.providerId)
          setClaimId(data.claimId)
        } else {
          setStatus('error')
          setErrorMsg(data.error ?? 'Verification failed')
          // If already processed, still show provider link
          if (data.providerId) setProviderId(data.providerId)
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMsg('Network error. Please try again.')
      })
  }, [token])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verifying your email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
            <p className="text-gray-600 mb-8">
              Your claim has been verified. Choose a plan to upgrade your listing
              and start appearing at the top of search results.
            </p>
            <Link
              href={`/claim/pricing?provider=${providerId}&claim=${claimId}`}
              className="inline-flex items-center gap-2 px-8 py-3 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              Choose a Plan
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h1>
            <p className="text-gray-600 mb-6">{errorMsg}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Go to Homepage
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
