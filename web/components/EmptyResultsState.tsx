'use client'

import Link from 'next/link'

interface EmptyResultsStateProps {
  scope: 'state' | 'city'
  location: string
  stateCode?: string
  suggestedLinks?: { label: string; href: string }[]
}

export default function EmptyResultsState({
  scope,
  location,
  stateCode,
  suggestedLinks,
}: EmptyResultsStateProps) {
  function handleQuote() {
    const navBtn = document.querySelector<HTMLButtonElement>('[data-nav-quote]')
    if (navBtn) navBtn.click()
  }

  return (
    <div className="text-center py-16 px-4">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto bg-blue-50 rounded-full flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 0115 0z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          No Backflow Testers Found Yet
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed mb-6">
          {scope === 'state'
            ? `We don't have any backflow testing providers listed in ${location} yet, but we're growing fast. Request a free quote and we'll connect you with a certified tester.`
            : `We don't have any backflow testing providers listed near ${location} yet. Request a free quote and we'll help you find a certified tester in your area.`}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <button
            onClick={handleQuote}
            className="px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
          >
            Get a Free Quote
          </button>
          <Link
            href="/claim?tab=register"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            Are you a tester? Register your listing
          </Link>
        </div>

        <Link
          href="/#states"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Browse all states &rarr;
        </Link>
      </div>

      {suggestedLinks && suggestedLinks.length > 0 && (
        <div className="mt-10 max-w-lg mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {scope === 'state' ? 'Nearby states with providers' : 'Nearby cities with providers'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestedLinks.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:border-blue-600 hover:text-blue-700 transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
