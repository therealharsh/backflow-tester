import { NextResponse } from 'next/server'
import { getStripe, TIER_CONFIG, tierFromPriceId, type PaidTier } from '@/lib/stripe'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/verify-checkout
 * Called when the user returns from Stripe checkout to verify payment
 * and sync the subscription to the database.
 * This acts as a fallback for the webhook (especially useful in local dev).
 *
 * Body: { sessionId: string }
 * Auth: Bearer token (Supabase session)
 */
export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      console.error('[verify-checkout] Auth failed:', authError?.message)
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId } = body as { sessionId: string }

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    // Retrieve the checkout session from Stripe
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    console.log('[verify-checkout] Stripe session:', {
      id: session.id,
      payment_status: session.payment_status,
      status: session.status,
      subscription: session.subscription,
      metadata: session.metadata,
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed', payment_status: session.payment_status },
        { status: 400 },
      )
    }

    const providerPlaceId =
      (session.metadata as Record<string, string>)?.provider_place_id ??
      (session.metadata as Record<string, string>)?.provider_id ??
      null

    if (!providerPlaceId) {
      console.error('[verify-checkout] No provider_place_id in metadata:', session.metadata)
      return NextResponse.json({ error: 'Missing provider in session' }, { status: 400 })
    }

    // Verify the user owns this provider
    const supabase = createServiceClient()

    const { data: owner, error: ownerError } = await supabase
      .from('provider_owners')
      .select('id')
      .eq('provider_place_id', providerPlaceId)
      .eq('owner_user_id', user.id)
      .single()

    if (!owner) {
      console.error('[verify-checkout] Ownership check failed:', { providerPlaceId, userId: user.id, ownerError })
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Retrieve the subscription details
    const subscriptionId = session.subscription as string
    const sub = await stripe.subscriptions.retrieve(subscriptionId)

    console.log('[verify-checkout] Subscription:', {
      id: sub.id,
      status: sub.status,
      metadata: sub.metadata,
      priceId: sub.items?.data?.[0]?.price?.id,
    })

    // Resolve tier — check metadata first, then fall back to price ID lookup
    const metaTier = (sub.metadata?.tier as PaidTier) ?? null
    let tier: PaidTier | null = metaTier && metaTier in TIER_CONFIG ? metaTier : null
    if (!tier) {
      const priceId = sub.items?.data?.[0]?.price?.id
      if (priceId) tier = tierFromPriceId(priceId)
    }

    if (!tier) {
      console.error('[verify-checkout] Could not resolve tier:', {
        metaTier,
        priceId: sub.items?.data?.[0]?.price?.id,
      })
      return NextResponse.json({ error: 'Could not resolve tier' }, { status: 400 })
    }

    // current_period_end lives on the subscription itself in newer Stripe API versions
    const periodEndTs =
      (sub as unknown as Record<string, number>).current_period_end ??
      sub.items?.data?.[0]?.current_period_end
    const periodEnd = periodEndTs
      ? new Date(periodEndTs * 1000).toISOString()
      : null

    const now = new Date().toISOString()

    // Upsert subscription
    const { error: upsertError } = await supabase.from('provider_subscriptions').upsert(
      {
        provider_place_id: providerPlaceId,
        tier,
        status: 'active',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        current_period_end: periodEnd,
        updated_at: now,
      },
      { onConflict: 'provider_place_id' },
    )

    if (upsertError) {
      console.error('[verify-checkout] Upsert failed:', upsertError)
      return NextResponse.json({ error: 'Failed to sync subscription', detail: upsertError.message }, { status: 500 })
    }

    // Activate premium on provider
    const { error: updateError } = await supabase
      .from('providers')
      .update({
        is_premium: true,
        premium_plan: tier,
        premium_rank: TIER_CONFIG[tier].rank,
        claimed: true,
        claim_status: 'approved',
      })
      .eq('place_id', providerPlaceId)

    if (updateError) {
      console.error('[verify-checkout] Provider update failed:', updateError)
    }

    console.log('[verify-checkout] SUCCESS — synced', { providerPlaceId, tier, subscriptionId })

    return NextResponse.json({ ok: true, tier })
  } catch (err) {
    console.error('[verify-checkout] Unhandled error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
