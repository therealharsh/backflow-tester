'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Props {
  page: number
  hasMore: boolean
  total: number
  perPage: number
}

export default function Pagination({ page, hasMore, total, perPage }: Props) {
  const router   = useRouter()
  const pathname = usePathname()

  function goTo(p: number) {
    const params = new URLSearchParams(window.location.search)
    if (p <= 1) {
      params.delete('page')
    } else {
      params.set('page', String(p))
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const totalPages = Math.ceil(total / perPage)
  const start      = (page - 1) * perPage + 1
  const end        = Math.min(page * perPage, total)

  return (
    <div className="flex items-center justify-between py-4">
      <p className="text-sm text-gray-500">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()} providers
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← Previous
        </button>

        <span className="text-sm text-gray-600 px-2">
          Page {page} of {totalPages}
        </span>

        <button
          onClick={() => goTo(page + 1)}
          disabled={!hasMore}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
