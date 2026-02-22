import type { Metadata } from 'next'
import Link from 'next/link'
import ClaimClient from './ClaimClient'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

export const metadata: Metadata = {
  title: 'Claim or Register Your Listing',
  description:
    'Claim your existing listing or register your backflow testing business on FindBackflowTesters.com. Manage your profile, respond to reviews, and reach more customers.',
  robots: { index: false, follow: true },
  alternates: { canonical: `${BASE}/claim` },
  openGraph: {
    title: 'Claim or Register Your Listing',
    description:
      'Claim your backflow testing business listing to manage your profile and reach more customers.',
    url: `${BASE}/claim`,
    type: 'website',
  },
}

export default function ClaimPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string; provider?: string }
}) {
  const initialQuery = searchParams.q ?? ''

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      {/* SSR shell — always visible, even without JS */}
      <div className="text-center mb-6">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">
          For Backflow Professionals
        </p>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Claim or Register Your Listing
        </h1>
        <p className="text-gray-600">
          Already in our directory? Search and claim it. New here? Register your
          business to get listed.
        </p>
      </div>

      {/* How it works — SSR step list */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-900 mb-4">How It Works</h2>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span>
              <strong>Find your listing</strong> &mdash; search by business name
              to see if you&rsquo;re already in our directory.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>
              <strong>Verify ownership</strong> &mdash; we&rsquo;ll send a
              verification link to your business email.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span>
              <strong>Manage your profile</strong> &mdash; update your info,
              respond to reviews, and upgrade to a premium listing.
            </span>
          </li>
        </ol>
      </div>

      {/* No-JS fallback: plain HTML form + browse link (hidden when JS loads) */}
      <noscript>
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-bold text-gray-900 mb-4">
            Search for Your Listing
          </h2>
          <form
            action="/api/claims/search"
            method="GET"
            className="flex gap-3 mb-4"
          >
            <input
              type="text"
              name="q"
              required
              placeholder="Search by business name..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              Search
            </button>
          </form>
          <p className="text-sm text-gray-500">
            Or{' '}
            <Link
              href="/contact"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              contact us
            </Link>{' '}
            and we&rsquo;ll help you claim or register your listing.
          </p>
        </div>
      </noscript>

      {/* Interactive client component — progressive enhancement */}
      <ClaimClient initialQuery={initialQuery} />
    </div>
  )
}
