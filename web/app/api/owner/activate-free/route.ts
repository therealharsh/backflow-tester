import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/activate-free
 * Sets the provider_subscriptions row to tier='free', status='active'.
 *
 * Body: { providerPlaceId: string }
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { providerPlaceId } = body as { providerPlaceId: string }

    if (!providerPlaceId) {
      return NextResponse.json({ error: 'Missing providerPlaceId' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── Verify ownership ──────────────────────────────────────
    const { data: owner } = await supabase
      .from('provider_owners')
      .select('id')
      .eq('provider_place_id', providerPlaceId)
      .eq('owner_user_id', user.id)
      .single()

    if (!owner) {
      return NextResponse.json({ error: 'Not authorized for this provider' }, { status: 403 })
    }

    // ── Activate free tier ────────────────────────────────────
    await supabase.from('provider_subscriptions').upsert(
      {
        provider_place_id: providerPlaceId,
        tier: 'free',
        status: 'active',
      },
      { onConflict: 'provider_place_id' },
    )

    // Mark provider as claimed/verified (owner badge)
    await supabase
      .from('providers')
      .update({
        claimed: true,
        claim_status: 'approved',
      })
      .eq('place_id', providerPlaceId)

    console.log('[owner/activate-free] Activated', { providerPlaceId, userId: user.id })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[owner/activate-free] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
