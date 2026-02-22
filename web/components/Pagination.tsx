import Link from 'next/link'

interface Props {
  page: number
  totalPages: number
  total: number
  perPage: number
  /** Base pathname, e.g. "/ca/san-diego" */
  basePath: string
  /** Current search params (filters etc.) — page param is managed internally */
  searchParams: Record<string, string>
}

/**
 * Build an href for a given page number, preserving all other query params.
 * Page 1 omits the `page` param for a clean canonical URL.
 */
function pageHref(basePath: string, params: Record<string, string>, p: number): string {
  const qs = new URLSearchParams(params)
  if (p <= 1) {
    qs.delete('page')
  } else {
    qs.set('page', String(p))
  }
  const str = qs.toString()
  return str ? `${basePath}?${str}` : basePath
}

export default function Pagination({ page, totalPages, total, perPage, basePath, searchParams }: Props) {
  const start = (page - 1) * perPage + 1
  const end   = Math.min(page * perPage, total)

  const hasPrev = page > 1
  const hasNext = page < totalPages

  // Build a short list of page numbers to display: current +/- 2, clamped
  const pageNumbers: number[] = []
  const lo = Math.max(1, page - 2)
  const hi = Math.min(totalPages, page + 2)
  for (let i = lo; i <= hi; i++) pageNumbers.push(i)

  return (
    <nav aria-label="Pagination" className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
      <p className="text-sm text-gray-500">
        Showing {start.toLocaleString()}&ndash;{end.toLocaleString()} of {total.toLocaleString()} providers
      </p>

      <div className="flex items-center gap-1">
        {/* Previous */}
        {hasPrev ? (
          <Link
            href={pageHref(basePath, searchParams, page - 1)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
            rel="prev"
          >
            &larr; Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 opacity-40 cursor-not-allowed"
          >
            &larr; Previous
          </span>
        )}

        {/* Numbered page links */}
        <div className="hidden sm:flex items-center gap-1 mx-1">
          {lo > 1 && (
            <>
              <Link
                href={pageHref(basePath, searchParams, 1)}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
              >
                1
              </Link>
              {lo > 2 && <span className="px-1 text-gray-400">&hellip;</span>}
            </>
          )}
          {pageNumbers.map((p) =>
            p === page ? (
              <span
                key={p}
                aria-current="page"
                className="px-3 py-2 text-sm font-medium rounded-lg border border-blue-600 bg-blue-600 text-white"
              >
                {p}
              </span>
            ) : (
              <Link
                key={p}
                href={pageHref(basePath, searchParams, p)}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
              >
                {p}
              </Link>
            ),
          )}
          {hi < totalPages && (
            <>
              {hi < totalPages - 1 && <span className="px-1 text-gray-400">&hellip;</span>}
              <Link
                href={pageHref(basePath, searchParams, totalPages)}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
              >
                {totalPages}
              </Link>
            </>
          )}
        </div>

        {/* Mobile: simple page indicator */}
        <span className="sm:hidden text-sm text-gray-600 px-2">
          {page} / {totalPages}
        </span>

        {/* Next */}
        {hasNext ? (
          <Link
            href={pageHref(basePath, searchParams, page + 1)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
            rel="next"
          >
            Next &rarr;
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 opacity-40 cursor-not-allowed"
          >
            Next &rarr;
          </span>
        )}
      </div>
    </nav>
  )
}
