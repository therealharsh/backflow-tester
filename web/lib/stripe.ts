import Stripe from 'stripe'

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
