import { NextResponse } from 'next/server'
import { getStripe, PLAN_CONFIG, type PlanKey } from '@/lib/stripe'
import { createServiceClient } from '@/lib/admin'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

/** Extract current_period_end from a subscription's first item. */
function getPeriodEnd(sub: Stripe.Subscription): string | null {
  const ts = sub.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const providerId = session.metadata?.provider_id
        const claimId = session.metadata?.claim_id
        const plan = session.metadata?.plan as PlanKey | undefined

        if (!providerId || !plan) {
          console.error('[webhook] Missing metadata on checkout session')
          break
        }

        console.log('[webhook] Checkout completed', { providerId, plan })

        // Upsert subscription record
        const subscriptionId = session.subscription as string
        const sub = await getStripe().subscriptions.retrieve(subscriptionId)
        const periodEnd = getPeriodEnd(sub)

        await supabase.from('provider_subscriptions').upsert(
          {
            provider_id: providerId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: subscriptionId,
            plan,
            status: sub.status,
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
          },
          { onConflict: 'stripe_subscription_id' },
        )

        // Activate premium on provider
        await supabase
          .from('providers')
          .update({
            is_premium: true,
            premium_plan: plan,
            premium_rank: PLAN_CONFIG[plan].rank,
            claimed: true,
            claim_status: 'approved',
          })
          .eq('place_id', providerId)

        // Mark claim as approved
        if (claimId) {
          await supabase
            .from('provider_claims')
            .update({ status: 'approved' })
            .eq('id', claimId)
        }

        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const providerId = sub.metadata?.provider_id
        const plan = sub.metadata?.plan as PlanKey | undefined

        if (!providerId) break

        const periodEnd = getPeriodEnd(sub)

        // Update subscription record
        await supabase
          .from('provider_subscriptions')
          .update({
            status: sub.status,
            ...(periodEnd ? { current_period_end: periodEnd } : {}),
            ...(plan ? { plan } : {}),
          })
          .eq('stripe_subscription_id', sub.id)

        // If active/trialing, keep premium. Otherwise, remove.
        if (['active', 'trialing'].includes(sub.status)) {
          if (plan) {
            await supabase
              .from('providers')
              .update({
                is_premium: true,
                premium_plan: plan,
                premium_rank: PLAN_CONFIG[plan].rank,
              })
              .eq('place_id', providerId)
          }
        } else {
          await supabase
            .from('providers')
            .update({
              is_premium: false,
              premium_plan: null,
              premium_rank: 0,
            })
            .eq('place_id', providerId)
        }

        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const providerId = sub.metadata?.provider_id

        if (!providerId) break

        console.log('[webhook] Subscription canceled', { providerId })

        // Update subscription record
        await supabase
          .from('provider_subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', sub.id)

        // Remove premium
        await supabase
          .from('providers')
          .update({
            is_premium: false,
            premium_plan: null,
            premium_rank: 0,
          })
          .eq('place_id', providerId)

        break
      }

      default:
        // Unhandled event type — ignore
        break
    }
  } catch (err) {
    console.error(`[webhook] Error processing ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
