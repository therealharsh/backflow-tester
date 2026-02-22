'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'

/**
 * Catches Supabase magic-link tokens that land on the wrong page
 * (e.g. root "/") because the redirect URL wasn't in Supabase's allowlist.
 *
 * When it detects #access_token=...&type=magiclink in the URL hash,
 * it lets the Supabase client establish the session, then looks up
 * the user's approved claim request via API and redirects to /owner/onboard.
 */
export default function AuthCallbackHandler() {
  const router = useRouter()

  useEffect(() => {
    // Only run if the hash looks like a magic link callback
    const hash = window.location.hash
    if (!hash || !hash.includes('type=magiclink')) return

    const supabase = getBrowserClient()

    // Supabase client auto-detects hash fragments and establishes the session.
    // Listen for the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session) return

      // Clean the hash from the URL immediately
      window.history.replaceState(null, '', window.location.pathname)

      try {
        // Look up the user's most recent approved claim request via API
        // (RLS blocks direct SELECT on provider_claim_requests for authenticated users)
        const res = await fetch('/api/auth/pending-onboard', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        const data = await res.json()

        if (data.requestId) {
          router.push(`/owner/onboard?request=${data.requestId}`)
        } else {
          router.push('/owner/dashboard')
        }
      } catch {
        router.push('/owner/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return null
}
