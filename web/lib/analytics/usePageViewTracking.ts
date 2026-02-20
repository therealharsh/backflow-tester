'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { track } from './client'

/**
 * Tracks page views on every route change.
 * Mount once in a layout-level client component.
 */
export function usePageViewTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return

    // Derive a page type from the path
    let pageType = 'other'
    if (pathname === '/') pageType = 'home'
    else if (pathname === '/search') pageType = 'search'
    else if (pathname === '/blog') pageType = 'blog_listing'
    else if (pathname.startsWith('/blog/')) pageType = 'blog_post'
    else if (pathname.startsWith('/providers/')) pageType = 'provider'
    else if (pathname.startsWith('/admin')) pageType = 'admin'
    else if (/^\/[a-z]{2}\/[^/]+$/.test(pathname)) pageType = 'city'
    else if (/^\/[a-z]{2}$/.test(pathname)) pageType = 'state'

    track('$pageview', {
      $current_url: window.location.href,
      path: pathname,
      page_type: pageType,
      search: searchParams?.toString() || '',
    })
  }, [pathname, searchParams])
}
