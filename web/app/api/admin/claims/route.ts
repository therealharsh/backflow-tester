import { NextResponse } from 'next/server'
import { verifyAdmin, createServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: claims, error } = await supabase
    .from('provider_claims')
    .select(`
      id,
      provider_id,
      claimant_email,
      claimant_name,
      claimant_phone,
      status,
      verified_at,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
  }

  // Enrich with provider names
  const providerIds = [...new Set(claims.map((c) => c.provider_id))]
  const { data: providers } = await supabase
    .from('providers')
    .select('place_id, name, city, state_code, provider_slug')
    .in('place_id', providerIds)

  const providerMap = new Map(
    (providers ?? []).map((p) => [p.place_id, p]),
  )

  const enriched = claims.map((c) => ({
    ...c,
    provider: providerMap.get(c.provider_id) ?? null,
  }))

  return NextResponse.json({ claims: enriched })
}

export async function PATCH(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { claimId, action } = body as { claimId: string; action: 'approve' | 'reject' }

  if (!claimId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('provider_claims')
    .select('id, provider_id, status')
    .eq('id', claimId)
    .single()

  if (!claim) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  await supabase
    .from('provider_claims')
    .update({ status: newStatus })
    .eq('id', claimId)

  if (action === 'approve') {
    await supabase
      .from('providers')
      .update({ claimed: true, claim_status: 'approved' })
      .eq('place_id', claim.provider_id)
  } else {
    await supabase
      .from('providers')
      .update({ claim_status: 'rejected', claim_email: null })
      .eq('place_id', claim.provider_id)
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
