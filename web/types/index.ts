export interface Provider {
  place_id: string
  google_id: string | null
  name: string
  phone: string | null
  website: string | null
  address: string | null
  city: string
  city_slug: string | null
  state_code: string
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  type: string | null
  subtypes: string | null
  category: string | null
  rating: number | null
  reviews: number
  backflow_score: number
  tier: 'testing' | 'service' | null
  best_evidence_url: string | null
  location_link: string | null
  reviews_link: string | null
  reviews_per_score: Record<string, number> | null
  service_tags: string[] | null
  top_review_excerpt: string | null
  image_urls: string[]
  provider_slug: string
  created_at: string
}

export interface ProviderService {
  place_id: string
  services_json: Record<string, boolean>
  evidence_json: Record<string, Array<{ source: string; url: string; snippet: string }>>
  updated_at: string
}

export interface ProviderReview {
  id: number
  place_id: string
  rating: number | null
  text_excerpt: string | null
  author_initials: string | null
  relative_time: string | null
  review_url: string | null
  sort_key: string
}

export interface City {
  id: number
  city: string
  city_slug: string
  state_code: string
  provider_count: number
  latitude: number | null
  longitude: number | null
}

export interface Filters {
  min_rating: string
  min_reviews: string
  testing: string
  page: string
}
