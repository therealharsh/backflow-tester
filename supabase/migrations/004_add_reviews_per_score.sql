-- ============================================================
-- Migration 004: Add reviews_per_score column
--
-- Stores the star-rating distribution scraped from Google,
-- e.g. {"1": 12, "2": 8, "3": 45, "4": 200, "5": 1500}
-- ============================================================

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS reviews_per_score jsonb DEFAULT NULL;
