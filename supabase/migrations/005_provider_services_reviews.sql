-- ============================================================
-- Migration 005: Provider services + reviews enrichment tables
-- Also adds denormalised columns to providers for fast card display.
-- ============================================================

-- ── Denormalised columns on providers (for listing-page cards) ────────────────

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS service_tags    text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS top_review_excerpt text  DEFAULT NULL;

-- ── provider_services ─────────────────────────────────────────────────────────
-- One row per provider; replaced wholesale on each enrichment run.

CREATE TABLE IF NOT EXISTS provider_services (
  place_id       text PRIMARY KEY REFERENCES providers(place_id) ON DELETE CASCADE,
  services_json  jsonb DEFAULT '{}'::jsonb,  -- {tag: true/false, ...}
  evidence_json  jsonb DEFAULT '{}'::jsonb,  -- {tag: [{source, url, snippet}]}
  updated_at     timestamptz DEFAULT now()
);

-- ── provider_reviews ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_reviews (
  id             bigserial PRIMARY KEY,
  place_id       text NOT NULL REFERENCES providers(place_id) ON DELETE CASCADE,
  rating         integer,
  review_text    text,       -- full text (server-side only)
  text_excerpt   text,       -- ≤ 200 chars, safe for public display
  author_initials text,      -- e.g. "J.D." — no full names stored
  relative_time  text,       -- "2 months ago"
  review_url     text,       -- link back to Google Maps review
  sort_key       text DEFAULT 'most_relevant',
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_reviews_place_id
  ON provider_reviews (place_id);

CREATE INDEX IF NOT EXISTS idx_provider_reviews_rating
  ON provider_reviews (place_id, rating DESC);

-- ── RLS policies ──────────────────────────────────────────────────────────────

ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_reviews  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read provider_services"
  ON provider_services FOR SELECT TO anon USING (true);

CREATE POLICY "Public read provider_reviews"
  ON provider_reviews FOR SELECT TO anon USING (true);

CREATE POLICY "Service role full access provider_services"
  ON provider_services FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access provider_reviews"
  ON provider_reviews FOR ALL TO service_role USING (true);
