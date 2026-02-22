import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/owner/create-account
 * Creates a Supabase user account for an approved claim request owner.
 * Email is pre-confirmed since we've already verified ownership through the approval process.
 *
 * Body: { email: string, password: string, requestId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, requestId } = body as {
      email: string
      password: string
      requestId: string
    }

    if (!email || !password || !requestId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Validate the claim request exists, is approved, and matches the email
    const { data: claimReq } = await supabase
      .from('provider_claim_requests')
      .select('id, contact_email, status')
      .eq('id', requestId)
      .single()

    if (!claimReq) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 404 })
    }

    if (claimReq.status !== 'approved') {
      return NextResponse.json({ error: 'Request is not approved' }, { status: 400 })
    }

    if (claimReq.contact_email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'Email does not match the approved request' }, { status: 403 })
    }

    // Create the user with email pre-confirmed (no verification email needed)
    const { error: createError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    })

    if (createError) {
      // User already exists — that's fine, they can sign in with their password
      if (
        createError.message.includes('already been registered') ||
        createError.message.includes('already exists')
      ) {
        return NextResponse.json({ ok: true, existing: true })
      }
      console.error('[owner/create-account] Error:', createError)
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[owner/create-account] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
