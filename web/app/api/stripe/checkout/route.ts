import { NextResponse } from 'next/server'
import { getStripe, getPriceId, PLAN_CONFIG, type PlanKey } from '@/lib/stripe'
import { createServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { providerId, claimId, plan, email } = body as {
      providerId: string
      claimId: string
      plan: string
      email: string
    }

    if (!providerId || !claimId || !plan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['starter', 'pro', 'featured'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const planKey = plan as PlanKey

    const supabase = createServiceClient()

    // Verify the claim exists and is verified
    const { data: claim } = await supabase
      .from('provider_claims')
      .select('id, provider_id, claimant_email, status')
      .eq('id', claimId)
      .eq('provider_id', providerId)
      .single()

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    if (claim.status !== 'verified') {
      return NextResponse.json({ error: 'Claim must be verified first' }, { status: 400 })
    }

    // Use email from claim record, fall back to request body
    const customerEmail = email || claim.claimant_email

    // Get provider name for checkout description
    const { data: provider } = await supabase
      .from('providers')
      .select('name')
      .eq('place_id', providerId)
      .single()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

    // Create Stripe checkout session
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer_email: customerEmail,
      line_items: [
        {
          price: getPriceId(planKey),
          quantity: 1,
        },
      ],
      metadata: {
        provider_id: providerId,
        claim_id: claimId,
        plan: planKey,
      },
      subscription_data: {
        metadata: {
          provider_id: providerId,
          claim_id: claimId,
          plan: planKey,
        },
      },
      success_url: `${siteUrl}/claim/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/claim/pricing?provider=${providerId}&claim=${claimId}`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/checkout] Error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
