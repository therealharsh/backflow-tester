import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Returns the most recent approved claim request ID for the authenticated user.
 * Used by the AuthCallbackHandler to redirect magic link sign-ins to onboarding.
 */
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user's token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user?.email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Use service client to read claim requests (RLS blocks anon/authenticated SELECT)
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: claimReq } = await serviceClient
    .from('provider_claim_requests')
    .select('id')
    .eq('contact_email', user.email.toLowerCase())
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!claimReq) {
    return NextResponse.json({ requestId: null })
  }

  return NextResponse.json({ requestId: claimReq.id })
}
