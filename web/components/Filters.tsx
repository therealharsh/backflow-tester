'use client'

import { useRouter, usePathname } from 'next/navigation'

const SERVICE_CHIPS = [
  { key: 'svc_rpz', label: 'RPZ Testing' },
  { key: 'svc_install', label: 'Installation' },
  { key: 'svc_repair', label: 'Repair' },
  { key: 'svc_cc', label: 'Cross-Connection' },
] as const

interface Props {
  minRating: string
  minReviews: string
  testing: boolean
  sort: string
  activeServices: string[]
}

export default function Filters({ minRating, minReviews, testing, sort, activeServices }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(window.location.search)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleService(key: string) {
    const params = new URLSearchParams(window.location.search)
    if (params.get(key) === '1') {
      params.delete(key)
    } else {
      params.set(key, '1')
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasFilters = minRating || minReviews || testing || sort || activeServices.length > 0

  return (
    <div className="space-y-3">
      {/* Primary filters row */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => update('sort', e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            <option value="">Nearest</option>
            <option value="reviews">Most reviewed</option>
            <option value="rating">Highest rated</option>
            <option value="score">Best match</option>
          </select>
        </div>

        <div className="w-px h-5 bg-gray-200 hidden sm:block" />

        {/* Min Rating */}
        <div className="flex items-center gap-2">
          <label htmlFor="min_rating" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Min Rating
          </label>
          <select
            id="min_rating"
            value={minRating}
            onChange={(e) => update('min_rating', e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            <option value="">Any</option>
            <option value="4.0">4.0+</option>
            <option value="4.5">4.5+</option>
          </select>
        </div>

        {/* Min Reviews */}
        <div className="flex items-center gap-2">
          <label htmlFor="min_reviews" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Min Reviews
          </label>
          <select
            id="min_reviews"
            value={minReviews}
            onChange={(e) => update('min_reviews', e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            <option value="">Any</option>
            <option value="10">10+</option>
            <option value="50">50+</option>
            <option value="100">100+</option>
          </select>
        </div>

        {/* Testing toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={testing}
            onChange={(e) => update('testing', e.target.checked ? '1' : null)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Testing-focused only
          </span>
        </label>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search)
              params.delete('sort')
              params.delete('min_rating')
              params.delete('min_reviews')
              params.delete('testing')
              params.delete('page')
              for (const c of SERVICE_CHIPS) params.delete(c.key)
              const qs = params.toString()
              router.push(qs ? `${pathname}?${qs}` : pathname)
            }}
            className="text-sm text-gray-400 hover:text-gray-600 underline ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Service filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Services:</span>
        {SERVICE_CHIPS.map((chip) => {
          const active = activeServices.includes(chip.key)
          return (
            <button
              key={chip.key}
              onClick={() => toggleService(chip.key)}
              className={`inline-flex items-center text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
              }`}
            >
              {active && (
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
