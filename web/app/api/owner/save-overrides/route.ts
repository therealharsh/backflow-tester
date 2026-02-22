import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/save-overrides
 * Upserts provider_overrides for the owner's listing.
 *
 * Body: { providerPlaceId, overrides: { name?, phone?, email?, website?, description?, cover_image_url?, gallery_image_urls?, service_lat?, service_lng? } }
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
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { providerPlaceId, overrides, serviceLat, serviceLng } = body as {
      providerPlaceId: string
      overrides: Record<string, unknown>
      serviceLat?: number | null
      serviceLng?: number | null
    }

    if (!providerPlaceId || !overrides) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify ownership
    const { data: owner } = await supabase
      .from('provider_owners')
      .select('id')
      .eq('provider_place_id', providerPlaceId)
      .eq('owner_user_id', user.id)
      .single()

    if (!owner) {
      return NextResponse.json({ error: 'Not authorized for this provider' }, { status: 403 })
    }

    // Verify paid tier
    const { data: sub } = await supabase
      .from('provider_subscriptions')
      .select('tier, status')
      .eq('provider_place_id', providerPlaceId)
      .single()

    if (!sub || sub.status !== 'active' || sub.tier === 'free') {
      return NextResponse.json({ error: 'Paid subscription required to edit listing' }, { status: 403 })
    }

    // Sanitize overrides — only allow known fields
    const allowed = ['name', 'phone', 'email', 'website', 'description', 'cover_image_url', 'gallery_image_urls']
    const clean: Record<string, unknown> = { provider_place_id: providerPlaceId }
    for (const key of allowed) {
      if (key in overrides) {
        clean[key] = overrides[key] ?? null
      }
    }
    clean.updated_at = new Date().toISOString()

    // Upsert overrides
    const { error: upsertError } = await supabase
      .from('provider_overrides')
      .upsert(clean, { onConflict: 'provider_place_id' })

    if (upsertError) {
      console.error('[owner/save-overrides] Upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 })
    }

    // Update service_lat/service_lng on providers if provided
    if (serviceLat !== undefined || serviceLng !== undefined) {
      const geoUpdate: Record<string, unknown> = {}
      if (serviceLat !== undefined) geoUpdate.service_lat = serviceLat
      if (serviceLng !== undefined) geoUpdate.service_lng = serviceLng

      await supabase
        .from('providers')
        .update(geoUpdate)
        .eq('place_id', providerPlaceId)
    }

    console.log('[owner/save-overrides] Saved', { providerPlaceId, userId: user.id })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[owner/save-overrides] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
