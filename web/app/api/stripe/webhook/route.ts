import { NextResponse } from 'next/server'
import { getStripe, TIER_CONFIG, tierFromPriceId, type PaidTier } from '@/lib/stripe'
import { createServiceClient } from '@/lib/admin'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

/** Extract current_period_end from a subscription's first item. */
function getPeriodEnd(sub: Stripe.Subscription): string | null {
  const ts = sub.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

/** Resolve tier from metadata or price ID. */
function resolveTier(sub: Stripe.Subscription): PaidTier | null {
  const metaTier = sub.metadata?.tier as PaidTier | undefined
  if (metaTier && metaTier in TIER_CONFIG) return metaTier

  // Fallback: lookup by price ID
  const priceId = sub.items?.data?.[0]?.price?.id
  if (priceId) return tierFromPriceId(priceId)

  return null
}

/** Resolve provider_place_id from metadata (supports both old and new key). */
function resolveProviderPlaceId(
  metadata: Record<string, string> | null | undefined,
): string | null {
  if (!metadata) return null
  return metadata.provider_place_id ?? metadata.provider_id ?? null
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  try {
    switch (event.type) {
      /* ── Checkout completed ─────────────────────────────── */
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const providerPlaceId = resolveProviderPlaceId(session.metadata as Record<string, string>)
        if (!providerPlaceId) {
          console.error('[webhook] Missing provider_place_id in checkout session metadata')
          break
        }

        const subscriptionId = session.subscription as string
        const sub = await getStripe().subscriptions.retrieve(subscriptionId)
        const tier = resolveTier(sub)
        const periodEnd = getPeriodEnd(sub)

        if (!tier) {
          console.error('[webhook] Could not resolve tier for subscription', subscriptionId)
          break
        }

        console.log('[webhook] Checkout completed', { providerPlaceId, tier })

        // Use explicit UPDATE/INSERT instead of upsert (avoids PgBouncer issues)
        const { data: existingSub } = await supabase
          .from('provider_subscriptions')
          .select('id')
          .eq('provider_place_id', providerPlaceId)
          .single()

        if (existingSub) {
          const { error: updateSubErr } = await supabase
            .from('provider_subscriptions')
            .update({
              tier,
              status: 'active',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId,
              current_period_end: periodEnd,
              updated_at: now,
            })
            .eq('provider_place_id', providerPlaceId)

          if (updateSubErr) {
            console.error('[webhook] Subscription UPDATE failed:', updateSubErr)
          }
        } else {
          const { error: insertErr } = await supabase
            .from('provider_subscriptions')
            .insert({
              provider_place_id: providerPlaceId,
              tier,
              status: 'active',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId,
              current_period_end: periodEnd,
              updated_at: now,
            })

          if (insertErr) {
            console.error('[webhook] Subscription INSERT failed:', insertErr)
          }
        }

        // Activate premium on provider
        const { error: providerErr } = await supabase
          .from('providers')
          .update({
            is_premium: true,
            premium_plan: tier,
            premium_rank: TIER_CONFIG[tier].rank,
            claimed: true,
            claim_status: 'approved',
          })
          .eq('place_id', providerPlaceId)

        if (providerErr) {
          console.error('[webhook] Provider update failed:', providerErr)
        }

        break
      }

      /* ── Subscription updated ───────────────────────────── */
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const providerPlaceId = resolveProviderPlaceId(sub.metadata as Record<string, string>)
        if (!providerPlaceId) break

        const tier = resolveTier(sub)
        const periodEnd = getPeriodEnd(sub)

        // Map Stripe status to our status
        let dbStatus: string
        if (['active', 'trialing'].includes(sub.status)) {
          dbStatus = 'active'
        } else if (sub.status === 'past_due') {
          dbStatus = 'past_due'
        } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
          dbStatus = 'canceled'
        } else {
          dbStatus = 'inactive'
        }

        // Update subscription record
        await supabase
          .from('provider_subscriptions')
          .update({
            status: dbStatus,
            ...(tier ? { tier } : {}),
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            updated_at: now,
          })
          .eq('stripe_subscription_id', sub.id)

        // Update premium flags on provider
        if (dbStatus === 'active' && tier) {
          await supabase
            .from('providers')
            .update({
              is_premium: true,
              premium_plan: tier,
              premium_rank: TIER_CONFIG[tier].rank,
            })
            .eq('place_id', providerPlaceId)
        } else if (['canceled', 'past_due'].includes(dbStatus)) {
          await supabase
            .from('providers')
            .update({
              is_premium: false,
              premium_plan: null,
              premium_rank: 0,
            })
            .eq('place_id', providerPlaceId)
        }

        break
      }

      /* ── Subscription deleted ───────────────────────────── */
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const providerPlaceId = resolveProviderPlaceId(sub.metadata as Record<string, string>)
        if (!providerPlaceId) break

        console.log('[webhook] Subscription canceled', { providerPlaceId })

        await supabase
          .from('provider_subscriptions')
          .update({ status: 'canceled', updated_at: now })
          .eq('stripe_subscription_id', sub.id)

        await supabase
          .from('providers')
          .update({
            is_premium: false,
            premium_plan: null,
            premium_rank: 0,
          })
          .eq('place_id', providerPlaceId)

        break
      }

      default:
        break
    }
  } catch (err) {
    console.error(`[webhook] Error processing ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
