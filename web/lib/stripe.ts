import Stripe from 'stripe'
import type { SubscriptionTier } from '@/types'

let _stripe: Stripe | null = null

/** Lazily initialize Stripe — only throws when actually called at runtime, not at build time. */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

/* ── Tier config (new prompt-09 tiers) ──────────────────────────── */

export const TIER_CONFIG: Record<Exclude<SubscriptionTier, 'free'>, { rank: number; label: string; price: number }> = {
  starter:  { rank: 1, label: 'Starter',  price: 49 },
  premium:  { rank: 2, label: 'Premium',  price: 99 },
  pro:      { rank: 3, label: 'Pro',      price: 149 },
}

export type PaidTier = keyof typeof TIER_CONFIG

/** Get Stripe price ID for a paid tier. Supports both new and legacy env var names. */
export function getTierPriceId(tier: PaidTier): string {
  const map: Record<PaidTier, string | undefined> = {
    starter:  process.env.STRIPE_PRICE_STARTER_MONTHLY ?? process.env.STRIPE_PRICE_STARTER,
    premium:  process.env.STRIPE_PRICE_PREMIUM_MONTHLY ?? process.env.STRIPE_PRICE_PRO,
    pro:      process.env.STRIPE_PRICE_PRO_MONTHLY     ?? process.env.STRIPE_PRICE_FEATURED,
  }
  const id = map[tier]
  if (!id) throw new Error(`Missing Stripe price env var for tier "${tier}"`)
  return id
}

/** Reverse-lookup: Stripe price ID → tier name. */
export function tierFromPriceId(priceId: string): PaidTier | null {
  for (const tier of Object.keys(TIER_CONFIG) as PaidTier[]) {
    try {
      if (getTierPriceId(tier) === priceId) return tier
    } catch {
      // env var missing — skip
    }
  }
  return null
}

/* ── Legacy exports (keep existing code working) ────────────────── */

export const PLAN_CONFIG = {
  starter:  { rank: 1, label: 'Starter',  price: 49 },
  pro:      { rank: 2, label: 'Pro',      price: 99 },
  featured: { rank: 3, label: 'Featured', price: 149 },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

export function getPriceId(plan: PlanKey): string {
  const map: Record<PlanKey, string | undefined> = {
    starter:  process.env.STRIPE_PRICE_STARTER,
    pro:      process.env.STRIPE_PRICE_PRO,
    featured: process.env.STRIPE_PRICE_FEATURED,
  }
  const id = map[plan]
  if (!id) throw new Error(`Missing STRIPE_PRICE_${plan.toUpperCase()} env var`)
  return id
}
