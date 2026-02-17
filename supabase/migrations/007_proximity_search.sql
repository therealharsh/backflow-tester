-- Migration: Add proximity search RPC using Haversine formula
-- Run once in Supabase SQL editor

-- Ensure lat/lon index exists for fast bounding-box pre-filter
CREATE INDEX IF NOT EXISTS idx_providers_lat_lon
  ON providers (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- RPC: providers_near_point
-- Returns providers within `radius_miles` of the given lat/lon,
-- ordered by distance ascending, limited to `max_results`.
CREATE OR REPLACE FUNCTION providers_near_point(
  lat          double precision,
  lon          double precision,
  radius_miles double precision DEFAULT 25,
  max_results  integer          DEFAULT 30
)
RETURNS TABLE (
  place_id             text,
  google_id            text,
  name                 text,
  phone                text,
  website              text,
  address              text,
  city                 text,
  city_slug            text,
  state_code           text,
  postal_code          text,
  latitude             double precision,
  longitude            double precision,
  type                 text,
  subtypes             text,
  category             text,
  rating               double precision,
  reviews              integer,
  backflow_score       integer,
  tier                 text,
  best_evidence_url    text,
  location_link        text,
  reviews_link         text,
  image_urls           jsonb,
  provider_slug        text,
  created_at           timestamptz,
  updated_at           timestamptz,
  reviews_per_score    jsonb,
  service_tags         text[],
  top_review_excerpt   text,
  distance_miles       double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.place_id,
    p.google_id,
    p.name,
    p.phone,
    p.website,
    p.address,
    p.city,
    p.city_slug,
    p.state_code,
    p.postal_code,
    p.latitude,
    p.longitude,
    p.type,
    p.subtypes,
    p.category,
    p.rating,
    p.reviews,
    p.backflow_score,
    p.tier,
    p.best_evidence_url,
    p.location_link,
    p.reviews_link,
    p.image_urls,
    p.provider_slug,
    p.created_at,
    p.updated_at,
    p.reviews_per_score,
    p.service_tags,
    p.top_review_excerpt,
    -- Haversine distance in miles
    3959 * acos(
      least(1.0,
        cos(radians(lat)) * cos(radians(p.latitude))
        * cos(radians(p.longitude) - radians(lon))
        + sin(radians(lat)) * sin(radians(p.latitude))
      )
    ) AS distance_miles
  FROM providers p
  WHERE
    p.latitude  IS NOT NULL
    AND p.longitude IS NOT NULL
    -- Cheap bounding box pre-filter (~1 degree lat ≈ 69 miles)
    AND p.latitude  BETWEEN lat  - (radius_miles / 69.0)
                        AND lat  + (radius_miles / 69.0)
    AND p.longitude BETWEEN lon  - (radius_miles / (69.0 * cos(radians(lat))))
                        AND lon  + (radius_miles / (69.0 * cos(radians(lat))))
    -- Exact Haversine filter
    AND 3959 * acos(
      least(1.0,
        cos(radians(lat)) * cos(radians(p.latitude))
        * cos(radians(p.longitude) - radians(lon))
        + sin(radians(lat)) * sin(radians(p.latitude))
      )
    ) <= radius_miles
  ORDER BY distance_miles ASC
  LIMIT max_results;
$$;

-- Grant anon (public) access so the web frontend can call it
GRANT EXECUTE ON FUNCTION providers_near_point(double precision, double precision, double precision, integer)
  TO anon, authenticated;
