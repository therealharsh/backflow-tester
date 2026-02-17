-- ============================================================
-- Migration 006: Add website_clean and related columns to providers
-- These are produced by the cleaning pipeline (02_clean_places.py)
-- and used by enrichment scripts.
-- ============================================================

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS website_clean    text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_domain   text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website_missing  boolean DEFAULT NULL;

-- Index on website_clean for enrichment queries that filter non-null websites
CREATE INDEX IF NOT EXISTS idx_providers_website_clean
  ON providers (website_clean) WHERE website_clean IS NOT NULL;

COMMENT ON COLUMN providers.website_clean   IS 'Normalized URL: https, no tracking params, no trailing slash';
COMMENT ON COLUMN providers.website_domain  IS 'Extracted domain from website_clean (e.g. acmeplumbing.com)';
COMMENT ON COLUMN providers.website_missing IS 'True if no usable website was found during cleaning';
