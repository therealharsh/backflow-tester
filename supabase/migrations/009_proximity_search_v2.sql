-- Migration: Add optional state_filter to providers_near_point
-- Backward compatible: existing callers that omit state_filter get the same behavior.

CREATE OR REPLACE FUNCTION providers_near_point(
  lat          double precision,
  lon          double precision,
  radius_miles double precision DEFAULT 25,
  max_results  integer          DEFAULT 30,
  state_filter text             DEFAULT NULL
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
    p.place_id, p.google_id, p.name, p.phone, p.website, p.address,
    p.city, p.city_slug, p.state_code, p.postal_code,
    p.latitude, p.longitude, p.type, p.subtypes, p.category,
    p.rating, p.reviews, p.backflow_score, p.tier,
    p.best_evidence_url, p.location_link, p.reviews_link,
    p.image_urls, p.provider_slug, p.created_at, p.updated_at,
    p.reviews_per_score, p.service_tags, p.top_review_excerpt,
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
    AND p.latitude  BETWEEN lat  - (radius_miles / 69.0)
                        AND lat  + (radius_miles / 69.0)
    AND p.longitude BETWEEN lon  - (radius_miles / (69.0 * cos(radians(lat))))
                        AND lon  + (radius_miles / (69.0 * cos(radians(lat))))
    AND 3959 * acos(
      least(1.0,
        cos(radians(lat)) * cos(radians(p.latitude))
        * cos(radians(p.longitude) - radians(lon))
        + sin(radians(lat)) * sin(radians(p.latitude))
      )
    ) <= radius_miles
    AND (state_filter IS NULL OR p.state_code = state_filter)
  ORDER BY distance_miles ASC
  LIMIT max_results;
$$;

-- Re-grant with the new 5-arg signature
GRANT EXECUTE ON FUNCTION providers_near_point(double precision, double precision, double precision, integer, text)
  TO anon, authenticated;
