'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics/client'

interface Props {
  providerSlug: string
  providerName: string
  position: number
  isPremium: boolean
  pageType: string
  children: React.ReactNode
}

/**
 * Wraps a listing card to track:
 * - listing_impression (IntersectionObserver, fires once when 50% visible)
 * - listing_clicked (delegated click on any <a> inside)
 */
export default function ListingTracker({
  providerSlug,
  providerName,
  position,
  isPremium,
  pageType,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const tracked = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true
          track('listing_impression', {
            provider_slug: providerSlug,
            provider_name: providerName,
            position,
            is_premium: isPremium,
            page_type: pageType,
          })
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [providerSlug, providerName, position, isPremium, pageType])

  function handleClick(e: React.MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a[href^="/providers/"]')
    if (!anchor) return
    track('listing_clicked', {
      provider_slug: providerSlug,
      provider_name: providerName,
      position,
      is_premium: isPremium,
      page_type: pageType,
    })
  }

  return (
    <div ref={ref} onClick={handleClick}>
      {children}
    </div>
  )
}
