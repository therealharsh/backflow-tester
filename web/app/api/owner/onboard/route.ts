import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import { slugify } from '@/lib/geo-utils'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/onboard
 * Called after the approved owner clicks the magic link and lands on /owner/onboard.
 * Creates the provider_owners link + provider_subscriptions row.
 *
 * Body: { requestId: string }
 * Auth: Bearer token (Supabase session)
 */
export async function POST(request: Request) {
  try {
    // ── Authenticate the user ────────────────────────────────
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
    const { requestId } = body as { requestId: string }

    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── Load and validate the claim request ──────────────────
    const { data: claimReq } = await supabase
      .from('provider_claim_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!claimReq) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (claimReq.status !== 'approved') {
      return NextResponse.json({ error: 'Request is not approved' }, { status: 400 })
    }

    if (claimReq.contact_email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Email does not match' }, { status: 403 })
    }

    let providerPlaceId: string

    if (claimReq.type === 'claim') {
      // ── Claim: link to existing provider ─────────────────
      providerPlaceId = claimReq.provider_place_id!

      // Verify not already owned
      const { data: existingOwner } = await supabase
        .from('provider_owners')
        .select('id')
        .eq('provider_place_id', providerPlaceId)
        .limit(1)

      if (existingOwner && existingOwner.length > 0) {
        return NextResponse.json({
          error: 'already_onboarded',
          providerPlaceId,
          message: 'This provider already has an owner',
        }, { status: 409 })
      }
    } else {
      // ── Register: create a new provider row ──────────────
      const sl = claimReq.submitted_listing as Record<string, string> | null
      if (!sl?.name || !sl?.city || !sl?.state) {
        return NextResponse.json({ error: 'Incomplete submitted listing data' }, { status: 400 })
      }

      const citySlug = slugify(sl.city)
      const stateCode = sl.state.toUpperCase()
      const baseSlug = slugify(`${sl.name} ${sl.city} ${stateCode}`)
      providerPlaceId = `reg_${crypto.randomBytes(12).toString('hex')}`

      // Ensure slug uniqueness
      let providerSlug = baseSlug
      const { data: slugCheck } = await supabase
        .from('providers')
        .select('provider_slug')
        .eq('provider_slug', baseSlug)
        .limit(1)

      if (slugCheck && slugCheck.length > 0) {
        providerSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`
      }

      // Geocode
      let latitude: number | null = null
      let longitude: number | null = null
      const geoKey = process.env.GOOGLE_PLACES_API_KEY
      if (geoKey) {
        try {
          const geoAddr = sl.address
            ? `${sl.address}, ${sl.city}, ${stateCode} ${sl.postalCode || ''}`
            : `${sl.city}, ${stateCode}`
          const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geoAddr)}&key=${geoKey}`,
            { cache: 'no-store' },
          )
          const geoData = await geoRes.json()
          if (geoData.results?.[0]?.geometry?.location) {
            latitude = geoData.results[0].geometry.location.lat
            longitude = geoData.results[0].geometry.location.lng
          }
        } catch (geoErr) {
          console.error('[owner/onboard] Geocoding failed (non-fatal):', geoErr)
        }
      }

      const { error: provError } = await supabase.from('providers').insert({
        place_id: providerPlaceId,
        name: sl.name,
        phone: sl.phone || null,
        website: sl.website || null,
        address: sl.address || null,
        city: sl.city,
        city_slug: citySlug,
        state_code: stateCode,
        postal_code: sl.postalCode || null,
        latitude,
        longitude,
        tier: null,
        backflow_score: 0,
        reviews: 0,
        provider_slug: providerSlug,
        image_urls: '[]',
        claimed: true,
        claim_status: 'approved',
        claim_email: user.email.toLowerCase(),
        is_premium: false,
        premium_rank: 0,
      })

      if (provError) {
        console.error('[owner/onboard] Provider insert error:', provError)
        return NextResponse.json({ error: 'Failed to create provider listing' }, { status: 500 })
      }

      // Update the claim request with the new provider_place_id
      await supabase
        .from('provider_claim_requests')
        .update({ provider_place_id: providerPlaceId })
        .eq('id', requestId)
    }

    // ── Create provider_owners row ───────────────────────────
    const { error: ownerError } = await supabase.from('provider_owners').upsert(
      {
        provider_place_id: providerPlaceId,
        owner_user_id: user.id,
        owner_email: user.email.toLowerCase(),
      },
      { onConflict: 'provider_place_id' },
    )

    if (ownerError) {
      console.error('[owner/onboard] Owner insert error:', ownerError)
      return NextResponse.json({ error: 'Failed to link owner' }, { status: 500 })
    }

    // ── Create/ensure provider_subscriptions row ─────────────
    const { error: subError } = await supabase.from('provider_subscriptions').upsert(
      {
        provider_place_id: providerPlaceId,
        tier: 'free',
        status: 'inactive',
      },
      { onConflict: 'provider_place_id' },
    )

    if (subError) {
      console.error('[owner/onboard] Subscription insert error:', subError)
      // Non-fatal — owner link was created
    }

    console.log('[owner/onboard] Onboarded', {
      requestId,
      providerPlaceId,
      userId: user.id,
      email: user.email,
    })

    return NextResponse.json({
      ok: true,
      providerPlaceId,
      desiredTier: claimReq.desired_tier,
    })
  } catch (err) {
    console.error('[owner/onboard] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
