'use client'

import { useState } from 'react'
import ClaimListingModal from './ClaimListingModal'

interface Props {
  providerId: string
  providerName: string
  claimed?: boolean
}

export default function ClaimListingCTA({ providerId, providerName, claimed }: Props) {
  const [showModal, setShowModal] = useState(false)

  if (claimed) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">Claimed Listing</span>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-100 hover:border-gray-300 transition-colors"
      >
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        Is this your business? Claim it
      </button>

      {showModal && (
        <ClaimListingModal
          providerId={providerId}
          providerName={providerName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
