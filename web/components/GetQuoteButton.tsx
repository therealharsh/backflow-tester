'use client'

import { useState } from 'react'
import QuoteModal from './QuoteModal'
import type { QuoteProviderInfo } from '@/lib/quote-schema'

interface Props {
  provider: QuoteProviderInfo
  /** 'card' = compact for listing cards, 'sidebar' = full-width for provider detail sidebar */
  variant?: 'card' | 'sidebar'
}

export default function GetQuoteButton({ provider, variant = 'card' }: Props) {
  const [open, setOpen] = useState(false)

  const cls =
    variant === 'sidebar'
      ? 'flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors'
      : 'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors'

  return (
    <>
      <button onClick={() => setOpen(true)} className={cls}>
        <svg className={variant === 'sidebar' ? 'w-4 h-4' : 'w-3.5 h-3.5'} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Get Quote
      </button>
      {open && (
        <QuoteModal
          provider={provider}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
