'use client'

import { useState, useEffect } from 'react'

export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)

  // Only show after scrolling past the hero
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 500)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleQuote() {
    // Click the nav Get Quote button if it exists
    const navBtn = document.querySelector<HTMLButtonElement>('[data-nav-quote]')
    if (navBtn) {
      navBtn.click()
    }
  }

  function handleSearch() {
    const input = document.querySelector<HTMLInputElement>('input[aria-label*="Search"]')
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => input.focus(), 400)
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 py-3 flex gap-3">
      <button
        onClick={handleQuote}
        className="flex-1 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
      >
        Get Free Quote
      </button>
      <button
        onClick={handleSearch}
        className="flex-1 py-2.5 bg-white text-blue-700 text-sm font-semibold rounded-lg border-2 border-blue-600 hover:bg-blue-50 transition-colors"
      >
        Search
      </button>
    </div>
  )
}
