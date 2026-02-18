/**
 * JSON-LD structured data helpers for SEO.
 */
import type { Provider } from '@/types'

export interface FAQItem {
  question: string
  answer: string
}

export function generateFAQSchema(items: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export function generateItemListSchema(
  providers: Provider[],
  pageUrl: string,
  cityName: string,
  stateName: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Backflow Testing Services in ${cityName}, ${stateName}`,
    url: pageUrl,
    numberOfItems: providers.length,
    itemListElement: providers.slice(0, 10).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: generateLocalBusinessSchema(p),
    })),
  }
}

export function generateLocalBusinessSchema(p: Provider) {
  const schema: Record<string, unknown> = {
    '@type': 'LocalBusiness',
    '@id': `provider-${p.place_id}`,
    name: p.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: p.city,
      addressRegion: p.state_code,
      ...(p.postal_code ? { postalCode: p.postal_code.replace('.0', '') } : {}),
      ...(p.address ? { streetAddress: p.address } : {}),
    },
  }

  if (p.phone) schema.telephone = p.phone
  if (p.website) schema.url = p.website
  if (p.latitude && p.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: p.latitude,
      longitude: p.longitude,
    }
  }
  if (p.rating && p.reviews > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: p.rating.toFixed(1),
      reviewCount: p.reviews,
      bestRating: '5',
    }
  }

  return schema
}
