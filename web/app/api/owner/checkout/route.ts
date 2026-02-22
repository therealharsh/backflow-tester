import { NextResponse } from 'next/server'
import { getStripe, getTierPriceId, TIER_CONFIG, type PaidTier } from '@/lib/stripe'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/checkout
 * Creates a Stripe Checkout Session for a paid tier upgrade.
 *
 * Body: { providerPlaceId: string, tier: 'starter' | 'premium' | 'pro' }
 * Auth: Bearer token (Supabase session)
 */
export async function POST(request: Request) {
  try {
    // ── Authenticate ──────────────────────────────────────────
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
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { providerPlaceId, tier } = body as {
      providerPlaceId: string
      tier: string
    }

    if (!providerPlaceId || !tier) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['starter', 'premium', 'pro'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const paidTier = tier as PaidTier

    const supabase = createServiceClient()

    // ── Verify the user owns this provider ────────────────────
    const { data: owner } = await supabase
      .from('provider_owners')
      .select('id')
      .eq('provider_place_id', providerPlaceId)
      .eq('owner_user_id', user.id)
      .single()

    if (!owner) {
      return NextResponse.json({ error: 'Not authorized for this provider' }, { status: 403 })
    }

    // Get provider name for checkout description
    const { data: provider } = await supabase
      .from('providers')
      .select('name')
      .eq('place_id', providerPlaceId)
      .single()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

    // ── Create Stripe Checkout Session ─────────────────────────
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [
        {
          price: getTierPriceId(paidTier),
          quantity: 1,
        },
      ],
      metadata: {
        provider_place_id: providerPlaceId,
        tier: paidTier,
      },
      subscription_data: {
        metadata: {
          provider_place_id: providerPlaceId,
          tier: paidTier,
        },
      },
      success_url: `${siteUrl}/owner/dashboard?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/owner/onboard?request=cancel`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[owner/checkout] Error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
