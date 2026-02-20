'use client'

import posthog from 'posthog-js'

let initialized = false

/** Initialize PostHog — call once in the app layout. */
export function initPostHog() {
  if (initialized) return
  if (typeof window === 'undefined') return

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

  if (!key) return

  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: false, // we handle this manually via the hook
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie',
  })

  initialized = true
}

/** Safe event tracker — silently no-ops if PostHog isn't loaded. */
export function track(event: string, properties?: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined' && initialized) {
      posthog.capture(event, properties)
    }
  } catch {
    // Silently ignore — analytics should never break the app
  }
}

/** Get the PostHog instance (for advanced use like identify). */
export function getPostHog() {
  if (typeof window !== 'undefined' && initialized) {
    return posthog
  }
  return null
}
