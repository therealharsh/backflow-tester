import Link from 'next/link'
import type { Provider } from '@/types'
import { chooseBestImage, getInitials } from '@/lib/image-utils'

interface Props {
  provider: Provider
}

function Stars({ rating, reviews }: { rating: number; reviews: number }) {
  const rounded = Math.round(rating)
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-3.5 h-3.5 ${i <= rounded ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm font-semibold text-gray-700">{rating.toFixed(1)}</span>
      <span className="text-xs text-gray-400 ml-0.5">({reviews.toLocaleString()})</span>
    </div>
  )
}

function PlaceholderImage({ name }: { name: string }) {
  const initials = getInitials(name)
  return (
    <div className="w-full aspect-[4/3] bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
      <span className="text-4xl font-bold text-blue-200">{initials}</span>
    </div>
  )
}

export default function ProviderCard({ provider: p }: Props) {
  const heroImage = chooseBestImage(p.image_urls)
  const chips = (p.service_tags ?? []).slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200 flex flex-col group">
      {/* Image — 4:3 aspect ratio */}
      <Link href={`/providers/${p.provider_slug}`} className="block overflow-hidden relative">
        {heroImage ? (
          <div className="aspect-[4/3] overflow-hidden">
            <img
              src={heroImage}
              alt={`${p.name} backflow testing`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        ) : (
          <PlaceholderImage name={p.name} />
        )}
        {/* Verified badge overlaid on image */}
        {p.tier === 'testing' && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-white/90 backdrop-blur-sm border border-emerald-200 rounded-full px-2 py-0.5 shadow-sm">
            ✓ Testing Verified
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        {/* Name */}
        <Link href={`/providers/${p.provider_slug}`}>
          <h3 className="font-semibold text-gray-900 leading-snug hover:text-blue-700 transition-colors line-clamp-2">
            {p.name}
          </h3>
        </Link>

        {/* Location */}
        <p className="text-sm text-gray-500 mt-1">
          {p.city}, {p.state_code}
        </p>

        {/* Rating */}
        {p.rating ? (
          <div className="mt-2">
            <Stars rating={p.rating} reviews={p.reviews} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400">No reviews yet</p>
        )}

        {/* Service chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {chips.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Top review excerpt */}
        {p.top_review_excerpt && (
          <p className="mt-2.5 text-xs text-gray-500 italic leading-relaxed line-clamp-2">
            "{p.top_review_excerpt}"
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          {p.phone ? (
            <a
              href={`tel:${p.phone}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              Call
            </a>
          ) : null}
          {p.website ? (
            <a
              href={p.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:border-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Website
            </a>
          ) : null}
          {!p.phone && !p.website && (
            <Link
              href={`/providers/${p.provider_slug}`}
              className="flex-1 flex items-center justify-center py-2 px-3 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              View Details →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
