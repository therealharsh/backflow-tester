'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics/client'

interface Props {
  providerSlug: string
  providerName: string
  city: string
  stateCode: string
  isPremium: boolean
  rating: number | null
  reviews: number
}

/**
 * Client component mounted on provider detail pages.
 * Tracks the provider page view event and attaches click handlers to CTA links
 * via event delegation.
 */
export default function ProviderPageTracker({
  providerSlug,
  providerName,
  city,
  stateCode,
  isPremium,
  rating,
  reviews,
}: Props) {
  useEffect(() => {
    track('provider_viewed', {
      provider_slug: providerSlug,
      provider_name: providerName,
      city,
      state: stateCode,
      is_premium: isPremium,
      rating,
      reviews,
    })
  }, [providerSlug, providerName, city, stateCode, isPremium, rating, reviews])

  // We use event delegation from the page container via data attributes
  // instead of wrapping every link. See the data-track-* attributes added
  // to CTA elements in the provider page.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null
      if (!el) return
      const event = el.getAttribute('data-track')
      if (!event) return
      track(event, {
        provider_slug: providerSlug,
        provider_name: providerName,
      })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [providerSlug, providerName])

  return null
}
