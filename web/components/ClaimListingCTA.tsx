import Link from 'next/link'

interface Props {
  providerId: string
  providerName: string
  claimed?: boolean
  ownerVerified?: boolean
}

export default function ClaimListingCTA({ providerId, providerName, claimed, ownerVerified }: Props) {
  if (ownerVerified || claimed) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">
          {ownerVerified ? 'Owner Verified Listing' : 'Claimed Listing'}
        </span>
      </div>
    )
  }

  const claimUrl = `/claim?q=${encodeURIComponent(providerName)}&provider=${encodeURIComponent(providerId)}`

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-900 text-sm">Own this business?</p>
        <p className="text-xs text-gray-500 mt-1">
          Claim this listing to update details, respond to reviews, and get more leads.
        </p>
      </div>
      <Link
        href={claimUrl}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        Claim this listing
      </Link>
      <Link
        href="/claim?tab=register"
        className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Are you a tester? Register your listing
      </Link>
    </div>
  )
}
