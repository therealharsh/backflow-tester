-- ============================================================
-- Migration 002: Performance indexes
-- ============================================================

-- Primary lookup: city landing pages
create index if not exists idx_providers_state_city
  on providers (state_code, city_slug);

-- Provider detail pages
create index if not exists idx_providers_slug
  on providers (provider_slug);

-- Sorting / filtering
create index if not exists idx_providers_reviews
  on providers (reviews desc);

create index if not exists idx_providers_rating
  on providers (rating desc);

create index if not exists idx_providers_backflow_score
  on providers (backflow_score desc);

create index if not exists idx_providers_tier
  on providers (tier)
  where tier is not null;

-- City hub pages: state + count ranking
create index if not exists idx_cities_state_count
  on cities (state_code, provider_count desc);

-- Sitemap generation
create index if not exists idx_cities_slug
  on cities (city_slug, state_code);

-- Optional: GIN index on image_urls for JSON queries
create index if not exists idx_providers_image_urls
  on providers using gin (image_urls);
