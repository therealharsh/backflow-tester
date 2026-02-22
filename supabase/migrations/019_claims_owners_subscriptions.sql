-- 019: Claims/register flow, owner linking, subscriptions, overrides, effective view
-- Implements the full claim/register → approve → owner → subscription pipeline.
-- Replaces the old provider_subscriptions table (010) with an expanded schema.

-- ═══════════════════════════════════════════════════════════════════════
-- 1) provider_claim_requests  (claim existing OR register new listing)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.provider_claim_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        NOT NULL CHECK (type IN ('claim','register')),
  provider_place_id text       NULL,            -- for 'claim'; matches providers.place_id
  submitted_listing jsonb      NULL,            -- for 'register': name, phone, email, address, etc.
  contact_name     text        NOT NULL,
  contact_email    text        NOT NULL,
  contact_phone    text        NULL,
  desired_tier     text        NOT NULL DEFAULT 'free'
                               CHECK (desired_tier IN ('free','starter','premium','pro')),
  message          text        NULL,            -- optional notes / proof of ownership
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      text        NULL,
  reviewed_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_requests_status_created
  ON public.provider_claim_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_claim_requests_place_id
  ON public.provider_claim_requests (provider_place_id);

CREATE INDEX IF NOT EXISTS idx_claim_requests_email
  ON public.provider_claim_requests (contact_email);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) provider_owners  (approved owner ↔ listing link)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.provider_owners (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_place_id text        NOT NULL,
  owner_user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_email       text        NOT NULL,
  verified_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_place_id),
  UNIQUE (provider_place_id, owner_user_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3) provider_subscriptions  (replace old 010 version with expanded schema)
-- ═══════════════════════════════════════════════════════════════════════
-- Drop the old table from migration 010 (different column set, not in production use).
DROP TABLE IF EXISTS public.provider_subscriptions CASCADE;

CREATE TABLE public.provider_subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_place_id      text        NOT NULL UNIQUE,
  tier                   text        NOT NULL DEFAULT 'free'
                                     CHECK (tier IN ('free','starter','premium','pro')),
  status                 text        NOT NULL DEFAULT 'inactive'
                                     CHECK (status IN ('inactive','active','past_due','canceled')),
  stripe_customer_id     text        NULL,
  stripe_subscription_id text        NULL,
  current_period_end     timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tier_status
  ON public.provider_subscriptions (tier, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.provider_subscriptions (stripe_subscription_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 4) provider_overrides  (owner edits without overwriting base data)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.provider_overrides (
  provider_place_id text        PRIMARY KEY,
  name              text        NULL,
  phone             text        NULL,
  email             text        NULL,
  website           text        NULL,
  description       text        NULL,
  cover_image_url   text        NULL,
  gallery_image_urls text[]     NOT NULL DEFAULT '{}'::text[],
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5) Add service_lat / service_lng to providers (geo center for promo radius)
-- ═══════════════════════════════════════════════════════════════════════
-- providers already have latitude/longitude; these are an optional override
-- for the "service area center" used in promoted-provider radius queries.
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS service_lat double precision NULL,
  ADD COLUMN IF NOT EXISTS service_lng double precision NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 6) providers_effective view  (coalesces overrides onto base data)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.providers_effective AS
SELECT
  p.place_id,
  p.google_id,
  COALESCE(o.name,    p.name)    AS effective_name,
  COALESCE(o.phone,   p.phone)   AS effective_phone,
  COALESCE(o.email,   p.claim_email) AS effective_email,
  COALESCE(o.website, p.website) AS effective_website,
  o.description                  AS effective_description,
  o.cover_image_url              AS effective_cover_image_url,
  CASE
    WHEN o.gallery_image_urls IS NOT NULL AND array_length(o.gallery_image_urls, 1) > 0
      THEN o.gallery_image_urls
    ELSE ARRAY[]::text[]
  END                            AS effective_gallery_image_urls,
  p.image_urls,
  p.address,
  p.city,
  p.city_slug,
  p.state_code,
  p.postal_code,
  p.latitude,
  p.longitude,
  COALESCE(p.service_lat, p.latitude)  AS service_lat,
  COALESCE(p.service_lng, p.longitude) AS service_lng,
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
  p.reviews_per_score,
  p.service_tags,
  p.top_review_excerpt,
  p.provider_slug,
  p.is_premium,
  p.premium_plan,
  p.premium_rank,
  p.claimed,
  p.claim_status,
  p.claim_email,
  p.created_at,
  p.updated_at,
  -- Subscription fields from join
  s.tier          AS subscription_tier,
  s.status        AS subscription_status,
  -- Owner link
  ow.owner_user_id,
  ow.owner_email
FROM public.providers p
LEFT JOIN public.provider_overrides o  ON o.provider_place_id = p.place_id
LEFT JOIN public.provider_subscriptions s ON s.provider_place_id = p.place_id
LEFT JOIN public.provider_owners ow    ON ow.provider_place_id = p.place_id;

-- ═══════════════════════════════════════════════════════════════════════
-- 7) RLS policies
-- ═══════════════════════════════════════════════════════════════════════

-- provider_claim_requests: anyone can insert, only service role can read/update
ALTER TABLE public.provider_claim_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a claim request"
  ON public.provider_claim_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Service role manages claim requests"
  ON public.provider_claim_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- provider_owners: service role only
ALTER TABLE public.provider_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages owners"
  ON public.provider_owners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- provider_subscriptions: service role only
ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subscriptions"
  ON public.provider_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- provider_overrides: service role only
ALTER TABLE public.provider_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages overrides"
  ON public.provider_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
