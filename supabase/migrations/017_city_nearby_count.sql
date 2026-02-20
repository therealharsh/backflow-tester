-- Migration: Add RPC to return cities with 20-mile radius provider counts
-- Used on state pages to show how many providers are near each city.

CREATE FUNCTION cities_with_nearby_count(p_state_code text)
RETURNS TABLE (
  id             bigint,
  city           text,
  city_slug      text,
  state_code     text,
  latitude       double precision,
  longitude      double precision,
  provider_count integer,
  nearby_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id, c.city, c.city_slug, c.state_code,
    c.latitude, c.longitude, c.provider_count,
    (
      SELECT count(*)
      FROM providers p
      WHERE p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND p.latitude  BETWEEN c.latitude  - (20.0 / 69.0)
                            AND c.latitude  + (20.0 / 69.0)
        AND p.longitude BETWEEN c.longitude - (20.0 / (69.0 * cos(radians(c.latitude))))
                            AND c.longitude + (20.0 / (69.0 * cos(radians(c.latitude))))
        AND 3959 * acos(
          least(1.0,
            cos(radians(c.latitude)) * cos(radians(p.latitude))
            * cos(radians(p.longitude) - radians(c.longitude))
            + sin(radians(c.latitude)) * sin(radians(p.latitude))
          )
        ) <= 20.0
    ) AS nearby_count
  FROM cities c
  WHERE c.state_code = p_state_code
  ORDER BY nearby_count DESC;
$$;

GRANT EXECUTE ON FUNCTION cities_with_nearby_count(text) TO anon, authenticated;
