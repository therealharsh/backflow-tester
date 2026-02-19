import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Find claim by token
  const { data: claim } = await supabase
    .from('provider_claims')
    .select('id, provider_id, status, verification_expires_at')
    .eq('verification_token', token)
    .single()

  if (!claim) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
  }

  if (claim.status !== 'pending') {
    return NextResponse.json({
      error: 'This claim has already been processed',
      status: claim.status,
      providerId: claim.provider_id,
    }, { status: 409 })
  }

  if (new Date(claim.verification_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This verification link has expired' }, { status: 410 })
  }

  // Mark claim as verified
  await supabase
    .from('provider_claims')
    .update({ status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', claim.id)

  // Update provider
  await supabase
    .from('providers')
    .update({ claim_status: 'verified' })
    .eq('place_id', claim.provider_id)

  return NextResponse.json({
    ok: true,
    providerId: claim.provider_id,
    claimId: claim.id,
  })
}
