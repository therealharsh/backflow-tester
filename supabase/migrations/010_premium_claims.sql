-- 010: Premium listings & claim flow
-- Adds provider claiming, Stripe subscriptions, and premium placement support.

-- ── New columns on providers ──────────────────────────────────────────
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS is_premium    boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_plan  text,          -- 'starter' | 'pro' | 'featured'
  ADD COLUMN IF NOT EXISTS premium_rank  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed       boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_status  text,          -- 'pending' | 'verified' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS claim_email   text;

-- ── Indexes for premium sorting ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_providers_premium_sort
  ON providers (is_premium DESC, premium_rank DESC, rating DESC NULLS LAST, reviews DESC NULLS LAST);

-- ── Provider claims table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_claims (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            text        NOT NULL REFERENCES providers(place_id) ON DELETE CASCADE,
  claimant_email         text        NOT NULL,
  claimant_name          text,
  claimant_phone         text,
  status                 text        NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','verified','rejected','approved')),
  verification_token     text        NOT NULL,
  verification_expires_at timestamptz NOT NULL,
  verified_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_provider_status
  ON provider_claims (provider_id, status);

CREATE INDEX IF NOT EXISTS idx_claims_token
  ON provider_claims (verification_token);

-- ── Provider subscriptions table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            text        NOT NULL REFERENCES providers(place_id) ON DELETE CASCADE,
  stripe_customer_id     text        NOT NULL,
  stripe_subscription_id text        NOT NULL UNIQUE,
  plan                   text        NOT NULL CHECK (plan IN ('starter','pro','featured')),
  status                 text        NOT NULL DEFAULT 'incomplete',
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_provider_status
  ON provider_subscriptions (provider_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────
-- Providers: public read already exists. No change needed.
-- Claims + Subscriptions: managed via service role in API routes only.
-- Enable RLS but don't add public policies (service role bypasses RLS).
ALTER TABLE provider_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_subscriptions ENABLE ROW LEVEL SECURITY;
