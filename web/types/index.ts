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
  // Premium / claim fields
  is_premium: boolean
  premium_plan: 'starter' | 'pro' | 'featured' | null
  premium_rank: number
  claimed: boolean
  claim_status: 'pending' | 'verified' | 'approved' | 'rejected' | null
  claim_email: string | null
  service_lat: number | null
  service_lng: number | null
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

// ── Claim / Register ────────────────────────────────────────────────

export type ClaimRequestType = 'claim' | 'register'
export type ClaimRequestStatus = 'pending' | 'approved' | 'rejected'
export type SubscriptionTier = 'free' | 'starter' | 'premium' | 'pro'
export type SubscriptionStatus = 'inactive' | 'active' | 'past_due' | 'canceled'

export interface ProviderClaimRequest {
  id: string
  type: ClaimRequestType
  provider_place_id: string | null
  submitted_listing: Record<string, unknown> | null
  contact_name: string
  contact_email: string
  contact_phone: string | null
  desired_tier: SubscriptionTier
  message: string | null
  status: ClaimRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface ProviderOwner {
  id: string
  provider_place_id: string
  owner_user_id: string
  owner_email: string
  verified_at: string
  created_at: string
}

export interface ProviderSubscription {
  id: string
  provider_place_id: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface ProviderOverride {
  provider_place_id: string
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  description: string | null
  cover_image_url: string | null
  gallery_image_urls: string[]
  updated_at: string
}

export interface ProviderEffective extends Provider {
  effective_name: string
  effective_phone: string | null
  effective_email: string | null
  effective_website: string | null
  effective_description: string | null
  effective_cover_image_url: string | null
  effective_gallery_image_urls: string[]
  subscription_tier: SubscriptionTier | null
  subscription_status: SubscriptionStatus | null
  owner_user_id: string | null
  owner_email: string | null
}

// ── Blog ────────────────────────────────────────────────────────────

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  content: string
  cover_image_url: string | null
  cover_image_alt: string | null
  tags: string[]
  status: 'draft' | 'published'
  published_at: string | null
  seo_title: string | null
  seo_description: string | null
  redirect_from: string[]
  created_at: string
  updated_at: string
}
