'use client'

import { useEffect, Suspense } from 'react'
import { initPostHog } from '@/lib/analytics/client'
import { usePageViewTracking } from '@/lib/analytics/usePageViewTracking'

/** Inner component that uses useSearchParams (requires Suspense boundary). */
function PageViewTracker() {
  usePageViewTracking()
  return null
}

/**
 * Initializes PostHog and tracks page views.
 * Mount once in the root layout.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  )
}
