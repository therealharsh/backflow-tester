'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Props {
  minRating: string
  minReviews: string
  testing: boolean
  sort: string
}

export default function Filters({ minRating, minReviews, testing, sort }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(window.location.search)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
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
          <option value="">Most reviewed</option>
          <option value="rating">Highest rated</option>
          <option value="score">Best match</option>
        </select>
      </div>

      {/* Divider */}
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
          <option value="4.0">⭐ 4.0+</option>
          <option value="4.5">⭐ 4.5+</option>
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
      {(minRating || minReviews || testing || sort) && (
        <button
          onClick={() => router.push(pathname)}
          className="text-sm text-gray-400 hover:text-gray-600 underline ml-auto"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
