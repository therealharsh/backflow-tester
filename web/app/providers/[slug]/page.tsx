import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { STATE_NAMES } from '@/lib/geo-utils'
import { parseImageUrls, isJunkImageUrl } from '@/lib/image-utils'
import type { Provider, ProviderEffective, ProviderService, ProviderReview } from '@/types'
import GetQuoteButton from '@/components/GetQuoteButton'
import ClaimListingCTA from '@/components/ClaimListingCTA'
import PremiumBadge from '@/components/PremiumBadge'
import OwnerVerifiedBadge from '@/components/OwnerVerifiedBadge'
import ProviderPageTracker from '@/components/ProviderPageTracker'

interface Props {
  params: { slug: string }
}

// ── Metadata ──────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerClient()
  const { data: p } = await supabase
    .from('providers')
    .select('name, city, state_code, rating, reviews, service_tags, image_urls')
    .eq('provider_slug', params.slug)
    .single()

  if (!p) return { title: 'Provider Not Found' }

  const stateName = STATE_NAMES[p.state_code] ?? p.state_code
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
  const pageUrl = `${siteUrl}/providers/${params.slug}`

  const serviceSummary = (p.service_tags ?? []).slice(0, 3).join(', ')
  const ratingText = p.rating ? `Rated ${p.rating.toFixed(1)} with ${p.reviews?.toLocaleString() ?? 0} reviews. ` : ''
  const servicesText = serviceSummary ? `Services: ${serviceSummary}. ` : ''

  const images = parseImageUrls(p.image_urls)
  const ogImage = images.find((u) => !isJunkImageUrl(u)) ?? `${siteUrl}/og-default.png`

  return {
    title: `${p.name} — Backflow Testing in ${p.city}, ${stateName} | FindBackflowTesters.com`,
    description:
      `${p.name} offers backflow testing services in ${p.city}, ${stateName}. ` +
      ratingText + servicesText +
      `Get a free quote today.`,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: `${p.name} — Backflow Testing in ${p.city}, ${stateName}`,
      description: `${ratingText}${servicesText}Get a free quote from ${p.name}.`,
      url: pageUrl,
      type: 'website',
      images: [{ url: ogImage }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${p.name} — Backflow Testing in ${p.city}, ${stateName}`,
      description: `${ratingText}Get a free quote from ${p.name}.`,
      images: [ogImage],
    },
  }
}

export async function generateStaticParams() {
  const supabase = createServerClient()
  let from = 0
  const slugs: { slug: string }[] = []

  while (true) {
    const { data } = await supabase
      .from('providers')
      .select('provider_slug')
      .range(from, from + 999)
    if (!data || data.length === 0) break
    slugs.push(...data.map((p) => ({ slug: p.provider_slug })))
    if (data.length < 1000) break
    from += 1000
  }
  return slugs
}

// ── Helpers ───────────────────────────────────────────────────────────

function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`${cls} ${i <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────

export default async function ProviderPage({ params }: Props) {
  const supabase = createServerClient()
  const { data: provider } = await supabase
    .from('providers_effective')
    .select('*')
    .eq('provider_slug', params.slug)
    .single()

  if (!provider) notFound()

  const p = provider as ProviderEffective
  const ownerVerified = !!p.owner_user_id

  // Fetch services, reviews, and nearby providers in parallel
  const [servicesRes, reviewsRes, nearbyRes] = await Promise.all([
    supabase.from('provider_services').select('*').eq('place_id', p.place_id).single(),
    supabase.from('provider_reviews').select('*').eq('place_id', p.place_id).order('rating', { ascending: false }).limit(4),
    // Nearby providers: same state, exclude self, ordered by proximity if geo available
    p.latitude && p.longitude
      ? supabase.rpc('providers_near_point', {
          lat: p.latitude,
          lon: p.longitude,
          radius_miles: 50,
          max_results: 7,
          state_filter: p.state_code,
        })
      : supabase
          .from('providers')
          .select('name, city, state_code, rating, reviews, provider_slug, city_slug, is_premium')
          .eq('state_code', p.state_code)
          .neq('place_id', p.place_id)
          .order('reviews', { ascending: false })
          .limit(6),
  ])

  const services = servicesRes.data as ProviderService | null
  const reviews  = (reviewsRes.data ?? []) as ProviderReview[]
  const nearbyRaw = (nearbyRes.data ?? []) as any[]
  const nearbyProviders = nearbyRaw
    .filter((n: any) => n.provider_slug !== p.provider_slug)
    .slice(0, 6)

  // Use owner override images if available, otherwise fall back to scraped images
  const overrideCover = p.effective_cover_image_url ?? null
  const overrideGallery = (p.effective_gallery_image_urls ?? []).filter(Boolean)
  const allUrls = parseImageUrls(p.image_urls)
  const goodImages = allUrls.filter((u) => !isJunkImageUrl(u)).slice(0, 6)
  const heroImage = overrideCover ?? goodImages[0] ?? null
  const thumbs = overrideGallery.length > 0
    ? overrideGallery.slice(0, 5)
    : goodImages.slice(1)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
  const stateSlug = p.state_code.toLowerCase()
  const stateName = STATE_NAMES[p.state_code] ?? p.state_code
  const pageUrl = `${siteUrl}/providers/${p.provider_slug}`

  // ── JSON-LD: BreadcrumbList ───────────────────────────────────────
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: stateName, item: `${siteUrl}/${stateSlug}` },
      { '@type': 'ListItem', position: 3, name: p.city, item: `${siteUrl}/${stateSlug}/${p.city_slug ?? ''}` },
      { '@type': 'ListItem', position: 4, name: p.effective_name, item: pageUrl },
    ],
  }

  // ── JSON-LD: LocalBusiness ────────────────────────────────────────
  const localBusinessSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Plumber',
    '@id': pageUrl,
    name: p.effective_name,
    ...(p.effective_phone && { telephone: p.effective_phone }),
    ...(p.effective_website && { url: p.effective_website }),
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address ?? '',
      addressLocality: p.city,
      addressRegion: p.state_code,
      postalCode: p.postal_code ?? '',
      addressCountry: 'US',
    },
    ...(p.latitude && p.longitude && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: p.latitude,
        longitude: p.longitude,
      },
    }),
    ...(p.rating && p.reviews > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: p.rating.toFixed(1),
        reviewCount: p.reviews,
        bestRating: '5',
        worstRating: '1',
      },
    }),
    ...(goodImages.length > 0 && { image: goodImages }),
    areaServed: {
      '@type': 'City',
      name: p.city,
      containedInPlace: { '@type': 'State', name: stateName },
    },
    ...(p.location_link && { sameAs: [p.location_link] }),
  }

  // Service tags for the SEO section
  const serviceTags = services
    ? Object.entries(services.services_json)
        .filter(([, v]) => v === true)
        .map(([k]) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    : (p.service_tags ?? [])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Analytics */}
      <ProviderPageTracker
        providerSlug={p.provider_slug}
        providerName={p.effective_name}
        city={p.city}
        stateCode={p.state_code}
        isPremium={!!p.is_premium}
        rating={p.rating}
        reviews={p.reviews ?? 0}
      />

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-blue-600 transition-colors">Home</Link>
        <span>/</span>
        <Link href={`/${stateSlug}`} className="hover:text-blue-600 transition-colors">{stateName}</Link>
        <span>/</span>
        <Link href={`/${stateSlug}/${p.city_slug ?? ''}`} className="hover:text-blue-600 transition-colors">
          {p.city}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate max-w-[200px]">{p.effective_name}</span>
      </nav>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Image gallery */}
          {heroImage ? (
            <div className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm aspect-video bg-gray-50">
                <img
                  src={heroImage}
                  alt={`${p.effective_name} — backflow testing service`}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              </div>
              {thumbs.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {thumbs.map((url, i) => (
                    <div key={i} className="shrink-0 w-24 h-18 rounded-lg overflow-hidden border border-gray-100 shadow-sm">
                      <img
                        src={url}
                        alt={`${p.effective_name} photo ${i + 2}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-gray-100 aspect-video bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl font-bold text-blue-200 mb-1">
                  {p.effective_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                </div>
                <p className="text-sm text-blue-300">No photos available</p>
              </div>
            </div>
          )}

          {/* Provider header */}
          <div>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{p.effective_name}</h1>
              <div className="flex items-center gap-2 shrink-0">
                {ownerVerified && <OwnerVerifiedBadge size="md" />}
                {p.tier === 'testing' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-full border border-emerald-200">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Backflow Testing Verified
                  </span>
                )}
              </div>
            </div>
            {(p.type || p.category) && (
              <p className="text-gray-500 text-sm">{p.type ?? p.category}</p>
            )}
          </div>

          {/* Rating + distribution */}
          {p.rating ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-start gap-6 flex-wrap">
                {/* Score summary */}
                <div className="text-center shrink-0">
                  <div className="text-5xl font-bold text-gray-900 leading-none">{p.rating.toFixed(1)}</div>
                  <div className="mt-1.5">
                    <StarRating rating={p.rating} size="md" />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{p.reviews?.toLocaleString()} reviews</div>
                </div>

                {/* Distribution bars */}
                {p.reviews_per_score && (() => {
                  const dist = p.reviews_per_score!
                  const max = Math.max(...Object.values(dist))
                  return (
                    <div className="flex-1 min-w-[160px] space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = dist[String(star)] ?? 0
                        const pct = max > 0 ? Math.round((count / max) * 100) : 0
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-3 shrink-0">{star}</span>
                            <svg className="w-3 h-3 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-yellow-400 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                              {count.toLocaleString()}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {p.reviews_link && (
                <a
                  href={p.reviews_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Read all {p.reviews?.toLocaleString()} reviews on Google &rarr;
                </a>
              )}
            </div>
          ) : null}

          {/* Owner description */}
          {p.effective_description && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">About</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{p.effective_description}</p>
            </div>
          )}

          {/* Business details card */}
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
            <div className="px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Business Details</h2>
            </div>
            {p.address && (
              <div className="flex items-start gap-3 px-5 py-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-gray-700">{p.address}</span>
              </div>
            )}
            {p.effective_phone && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                <a href={`tel:${p.effective_phone}`} data-track="call_clicked" className="text-blue-600 hover:underline font-medium">{p.effective_phone}</a>
              </div>
            )}
            {p.effective_website && (
              <div className="flex items-center gap-3 px-5 py-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <a
                  href={p.effective_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-track="website_clicked"
                  className="text-blue-600 hover:underline truncate"
                >
                  {p.effective_website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </div>
            )}
            {p.best_evidence_url && (
              <div className="flex items-start gap-3 px-5 py-3 text-sm">
                <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <a
                  href={p.best_evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline"
                >
                  Backflow testing verified on their website &rarr;
                </a>
              </div>
            )}
            {p.subtypes && (
              <div className="px-5 py-3 text-xs text-gray-500">
                {p.subtypes.split(',').slice(0, 5).map((s: string) => s.trim()).filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {/* Map */}
          {p.latitude && p.longitude && (
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Location</span>
                {p.location_link && (
                  <a
                    href={p.location_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-track="directions_clicked"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Open in Google Maps
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
              <iframe
                title={`Map showing location of ${p.effective_name}`}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${p.longitude - 0.008},${p.latitude - 0.005},${p.longitude + 0.008},${p.latitude + 0.005}&layer=mapnik&marker=${p.latitude},${p.longitude}`}
                className="w-full h-64 border-0"
                loading="lazy"
              />
            </div>
          )}

          {/* Services Offered */}
          {services && (() => {
            const trueTags = Object.entries(services.services_json)
              .filter(([, v]) => v === true)
              .map(([k]) => k)
            if (trueTags.length === 0) return null
            return (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Services Offered</h2>
                </div>
                <div className="p-4 flex flex-wrap gap-2">
                  {trueTags.map((tag) => {
                    const evidence = services.evidence_json?.[tag]?.[0]
                    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                    return (
                      <span
                        key={tag}
                        title={evidence?.snippet ?? ''}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 cursor-default"
                      >
                        <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {label}
                      </span>
                    )
                  })}
                </div>
                <p className="px-5 pb-3 text-xs text-gray-400">Based on website text analysis</p>
              </div>
            )
          })()}

          {/* Google Reviews */}
          {reviews.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Customer Reviews</h2>
                {p.reviews_link && (
                  <a
                    href={p.reviews_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    All {p.reviews?.toLocaleString()} reviews &rarr;
                  </a>
                )}
              </div>
              {reviews.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-blue-600">{r.author_initials ?? '?'}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{r.author_initials ?? 'Anonymous'}</span>
                        {r.relative_time && (
                          <span className="text-xs text-gray-400 ml-1.5">{r.relative_time}</span>
                        )}
                      </div>
                    </div>
                    {r.rating && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[1,2,3,4,5].map((i) => (
                          <svg key={i} className={`w-3.5 h-3.5 ${i <= r.rating! ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{r.text_excerpt}</p>
                  {r.review_url && (
                    <a
                      href={r.review_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Read on Google &rarr;
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SEO: Backflow Testing in City, State */}
          <div className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-3">
            <h2 className="font-semibold text-gray-800 text-base">
              Backflow Testing in {p.city}, {stateName}
            </h2>
            <p>
              {p.effective_name} provides professional backflow prevention testing and certification services in {p.city}, {stateName}.
              Annual backflow testing is required by most water utilities to protect public water supplies
              from contamination through cross-connection control compliance.
              {serviceTags.length > 0 && (
                <> Their services include {serviceTags.slice(0, 4).join(', ').toLowerCase()}, serving
                both residential and commercial properties throughout the {p.city} area.</>
              )}
            </p>
            <p>
              Whether you need a routine RPZ valve inspection, backflow prevention device testing,
              or a certified tester to file compliance reports with your local water authority,
              {p.effective_name} can help. Homeowners, HOAs, and property managers can request a free quote
              using the form on this page.
            </p>
          </div>

          {/* SEO: Service Area */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Service Area</h2>
            <p className="text-sm text-gray-600 mb-3">
              Serving {p.city}, {stateName} and surrounding areas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${stateSlug}/${p.city_slug ?? ''}`}
                className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Backflow testers in {p.city}
              </Link>
              <Link
                href={`/${stateSlug}`}
                className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                All cities in {stateName}
              </Link>
              <Link
                href="/#states"
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Browse all states
              </Link>
            </div>
          </div>

          {/* Nearby Certified Testers */}
          {nearbyProviders.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Nearby Certified Testers in {stateName}
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {nearbyProviders.map((n: any) => (
                  <Link
                    key={n.provider_slug}
                    href={`/providers/${n.provider_slug}`}
                    className="block p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
                    <p className="font-semibold text-gray-900 group-hover:text-blue-700 text-sm leading-tight truncate">
                      {n.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {n.city}, {n.state_code}
                      {n.distance_miles != null && (
                        <> &middot; {n.distance_miles.toFixed(1)} mi away</>
                      )}
                    </p>
                    {n.rating && n.reviews > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-xs font-medium text-gray-700">{n.rating.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({n.reviews})</span>
                      </div>
                    )}
                    <span className="inline-block mt-2 text-xs font-medium text-blue-600 group-hover:text-blue-800">
                      View profile &rarr;
                    </span>
                  </Link>
                ))}
              </div>
              <div className="mt-4">
                <Link
                  href={`/${stateSlug}/${p.city_slug ?? ''}`}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View all providers in {p.city} &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky sidebar ── */}
        <div className="lg:sticky lg:top-24 space-y-4">
          {/* CTA card */}
          <div className={`rounded-2xl border shadow-sm p-5 space-y-3 ${
            p.is_premium ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-white'
          }`}>
            <div className="mb-1">
              {p.is_premium && p.premium_plan && (
                <div className="mb-2">
                  <PremiumBadge plan={p.premium_plan} rating={p.rating} reviews={p.reviews} size="md" />
                </div>
              )}
              <p className="font-semibold text-gray-900 text-lg leading-tight">{p.effective_name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{p.city}, {p.state_code}</p>
            </div>

            {p.rating ? (
              <div className="flex items-center gap-1.5">
                <StarRating rating={p.rating} size="sm" />
                <span className="text-sm font-semibold text-gray-700">{p.rating.toFixed(1)}</span>
                <span className="text-xs text-gray-400">({p.reviews?.toLocaleString()})</span>
              </div>
            ) : null}

            <GetQuoteButton
              variant="sidebar"
              provider={{
                name: p.effective_name,
                phone: p.effective_phone,
                website: p.effective_website,
                address: p.address,
                city: p.city,
                stateCode: p.state_code,
                postalCode: p.postal_code,
                locationLink: p.location_link,
                placeId: p.place_id,
                googleId: p.google_id,
              }}
            />

            {p.effective_website && (
              <a
                href={p.effective_website}
                target="_blank"
                rel="noopener noreferrer"
                data-track="website_clicked"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border-2 border-blue-700 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Visit Website
              </a>
            )}

            {p.location_link && (
              <a
                href={p.location_link}
                target="_blank"
                rel="noopener noreferrer"
                data-track="directions_clicked"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:border-gray-300 transition-colors text-sm"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                View on Google Maps
              </a>
            )}
          </div>

          {/* Info card */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-sm space-y-2 text-gray-600">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Quick Facts</p>
            {p.city && <p className="flex justify-between"><span>Location</span><span className="font-medium text-gray-800">{p.city}, {p.state_code}</span></p>}
            {p.backflow_score > 0 && (
              <p className="flex justify-between">
                <span>Match score</span>
                <span className="font-medium text-gray-800">{p.backflow_score}/10</span>
              </p>
            )}
            {p.tier === 'testing' && (
              <p className="flex justify-between">
                <span>Verified</span>
                <span className="font-medium text-emerald-700">Yes</span>
              </p>
            )}
          </div>

          {/* Claim CTA */}
          <ClaimListingCTA
            providerId={p.place_id}
            providerName={p.effective_name}
            claimed={p.claimed}
            ownerVerified={ownerVerified}
          />

          <p className="text-xs text-gray-400 text-center px-2">
            Always verify licensing with your local water authority before hiring.
          </p>
        </div>
      </div>
    </div>
  )
}
