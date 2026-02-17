-- ============================================================
-- Migration 003: Clean postal_code values stored as floats
--
-- Problem: pandas reads integer ZIP codes as float when the
-- column has NaN rows, so 10019 → "10019.0" in the CSV and
-- gets loaded as "10019.0" into Supabase.
--
-- Fix: strip the ".0" suffix and zero-pad to 5 digits.
-- ============================================================

UPDATE providers
SET postal_code =
  CASE
    -- Has a decimal point → strip it and left-pad to 5 digits
    WHEN postal_code LIKE '%.%'
      THEN LPAD(SPLIT_PART(postal_code, '.', 1), 5, '0')
    -- Pure digit string shorter than 5 (e.g. leading-zero ZIP stored wrong)
    WHEN postal_code ~ '^\d{1,4}$'
      THEN LPAD(postal_code, 5, '0')
    ELSE postal_code
  END
WHERE
  postal_code IS NOT NULL
  AND (postal_code LIKE '%.%' OR postal_code ~ '^\d{1,4}$');
