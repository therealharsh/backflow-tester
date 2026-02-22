import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/owner/dashboard
 * Returns dashboard data for the authenticated owner.
 * Auth: Bearer token
 */
export async function GET(request: Request) {
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
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const supabase = createServiceClient()

    // Find owned provider
    const { data: ownership } = await supabase
      .from('provider_owners')
      .select('provider_place_id, owner_email, verified_at')
      .eq('owner_user_id', user.id)
      .limit(1)
      .single()

    if (!ownership) {
      return NextResponse.json({ error: 'no_provider', message: 'No owned provider found' }, { status: 404 })
    }

    const placeId = ownership.provider_place_id

    // Fetch provider, subscription, and overrides in parallel
    const [providerRes, subRes, overridesRes] = await Promise.all([
      supabase
        .from('providers')
        .select('place_id, name, phone, website, address, city, state_code, provider_slug, latitude, longitude, service_lat, service_lng, claim_email, image_urls, rating, reviews')
        .eq('place_id', placeId)
        .single(),
      supabase
        .from('provider_subscriptions')
        .select('tier, status, stripe_subscription_id, current_period_end')
        .eq('provider_place_id', placeId)
        .single(),
      supabase
        .from('provider_overrides')
        .select('*')
        .eq('provider_place_id', placeId)
        .single(),
    ])

    console.log('[owner/dashboard] placeId:', placeId)
    console.log('[owner/dashboard] subscription query:', { data: subRes.data, error: subRes.error?.message })

    const response = NextResponse.json({
      provider: providerRes.data,
      subscription: subRes.data ?? { tier: 'free', status: 'inactive' },
      overrides: overridesRes.data ?? null,
      ownership,
    })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  } catch (err) {
    console.error('[owner/dashboard] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
