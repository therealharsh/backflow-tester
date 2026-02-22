import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient, verifyAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/** Verify admin access via Bearer token (Supabase admin session) or ADMIN_SECRET. */
async function verifyRequest(request: NextRequest): Promise<boolean> {
  // Check Bearer token for admin user (primary method)
  const admin = await verifyAdmin(request)
  if (admin) return true

  // Fallback: ADMIN_SECRET from query param or header
  const secret = process.env.ADMIN_SECRET
  if (secret) {
    const keyParam = request.nextUrl.searchParams.get('key')
    if (keyParam === secret) return true

    const header = request.headers.get('x-admin-key')
    if (header === secret) return true
  }

  return false
}

/* ── GET: list pending claim requests ─────────────────────────── */

export async function GET(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: requests, error } = await supabase
    .from('provider_claim_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[admin/claim-requests] Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }

  // Enrich claim-type requests with provider info
  const placeIds = requests
    .filter((r) => r.type === 'claim' && r.provider_place_id)
    .map((r) => r.provider_place_id!)

  let providerMap = new Map<string, { name: string; city: string; state_code: string; provider_slug: string }>()
  if (placeIds.length > 0) {
    const { data: providers } = await supabase
      .from('providers')
      .select('place_id, name, city, state_code, provider_slug')
      .in('place_id', placeIds)

    providerMap = new Map(
      (providers ?? []).map((p) => [p.place_id, p]),
    )
  }

  const enriched = requests.map((r) => ({
    ...r,
    provider: r.provider_place_id ? providerMap.get(r.provider_place_id) ?? null : null,
  }))

  return NextResponse.json({ requests: enriched })
}

/* ── PATCH: approve or reject a claim request ─────────────────── */

export async function PATCH(request: NextRequest) {
  if (!(await verifyRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { requestId, action } = body as {
    requestId: string
    action: 'approve' | 'reject'
  }

  if (!requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch the claim request
  const { data: claimReq } = await supabase
    .from('provider_claim_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (!claimReq) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (claimReq.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${claimReq.status}` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  // Update the claim request
  const { error: updateError } = await supabase
    .from('provider_claim_requests')
    .update({
      status: newStatus,
      reviewed_at: now,
      reviewed_by: 'admin',
      updated_at: now,
    })
    .eq('id', requestId)

  if (updateError) {
    console.error('[admin/claim-requests] Update error:', updateError)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }

  // Determine listing name for emails
  let listingName = 'your listing'
  let listingLocation = ''

  if (claimReq.type === 'claim' && claimReq.provider_place_id) {
    const { data: provider } = await supabase
      .from('providers')
      .select('name, city, state_code')
      .eq('place_id', claimReq.provider_place_id)
      .single()

    if (provider) {
      listingName = provider.name
      listingLocation = `${provider.city}, ${provider.state_code}`
    }
  } else if (claimReq.submitted_listing) {
    const sl = claimReq.submitted_listing as Record<string, string>
    listingName = sl.name ?? 'your listing'
    listingLocation = [sl.city, sl.state].filter(Boolean).join(', ')
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@findbackflowtesters.com'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'

  if (action === 'approve') {
    // Build the signup URL (user creates their own account)
    const signupUrl = `${siteUrl}/owner/signup?email=${encodeURIComponent(claimReq.contact_email)}&request=${requestId}`

    // Also mark the provider as claimed if it's a claim-type request
    if (claimReq.type === 'claim' && claimReq.provider_place_id) {
      await supabase
        .from('providers')
        .update({
          claimed: true,
          claim_status: 'approved',
          claim_email: claimReq.contact_email,
        })
        .eq('place_id', claimReq.provider_place_id)
    }

    // ── Send approval email ────────────────────────────────────
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: [claimReq.contact_email],
        subject: `Approved — set up your owner account for ${listingName}`,
        html: buildApprovalHtml({
          contactName: claimReq.contact_name,
          listingName,
          listingLocation,
          signupUrl,
          siteUrl,
        }),
        text: buildApprovalText({
          contactName: claimReq.contact_name,
          listingName,
          listingLocation,
          signupUrl,
          siteUrl,
        }),
      })

      if (sendError) {
        console.error('[admin/claim-requests] Approval email send error:', sendError)
        return NextResponse.json({
          ok: false,
          status: newStatus,
          error: `Request approved but email failed to send: ${sendError.message}. Email: ${claimReq.contact_email}`,
        }, { status: 500 })
      }
    } catch (emailErr) {
      console.error('[admin/claim-requests] Approval email error:', emailErr)
      return NextResponse.json({
        ok: false,
        status: newStatus,
        error: `Request approved but email failed to send. Email: ${claimReq.contact_email}. Check server logs.`,
      }, { status: 500 })
    }

    console.log('[admin/claim-requests] Approved:', {
      id: requestId,
      listing: listingName,
      email: claimReq.contact_email,
    })

    return NextResponse.json({
      ok: true,
      status: newStatus,
    })
  } else {
    // ── Send rejection email ───────────────────────────────────
    if (claimReq.type === 'claim' && claimReq.provider_place_id) {
      await supabase
        .from('providers')
        .update({ claim_status: 'rejected', claim_email: null })
        .eq('place_id', claimReq.provider_place_id)
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: [claimReq.contact_email],
        subject: `Update on your listing request for ${listingName}`,
        html: buildRejectionHtml({
          contactName: claimReq.contact_name,
          listingName,
          listingLocation,
          siteUrl,
        }),
        text: buildRejectionText({
          contactName: claimReq.contact_name,
          listingName,
          listingLocation,
          siteUrl,
        }),
      })

      if (sendError) {
        console.error('[admin/claim-requests] Rejection email send error:', sendError)
      }
    } catch (emailErr) {
      console.error('[admin/claim-requests] Rejection email error (non-fatal):', emailErr)
    }

    console.log('[admin/claim-requests] Rejected:', {
      id: requestId,
      listing: listingName,
      email: claimReq.contact_email,
    })
  }

  return NextResponse.json({ ok: true, status: newStatus })
}

/* ── Email builders ────────────────────────────────────────────── */

function buildApprovalHtml(p: {
  contactName: string
  listingName: string
  listingLocation: string
  signupUrl: string
  siteUrl: string
}) {
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#ecfdf5;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#059669">Your Listing Has Been Approved!</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${p.listingName}${p.listingLocation ? ` &mdash; ${p.listingLocation}` : ''}</p>
  </div>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Hi ${p.contactName},<br><br>
    Great news! Your request for <strong>${p.listingName}</strong> has been approved.
    Click the button below to create your owner account, choose a plan, and start managing your listing.
  </p>

  <div style="text-align:center;margin:32px 0">
    <a href="${p.signupUrl}" style="display:inline-block;background:#059669;color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none">
      Set Up My Account
    </a>
  </div>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:24px 0">
    <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827">What happens next?</p>
    <ol style="margin:0;padding-left:20px;font-size:14px;color:#374151;line-height:1.8">
      <li>Click the button above to create your account with a password</li>
      <li>Choose a plan (free or paid) to activate your listing</li>
      <li>Start managing your listing from your owner dashboard</li>
    </ol>
  </div>

  <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px">
    Already have an account? Visit
    <a href="${p.siteUrl}/owner/login" style="color:#2563eb">FindBackflowTesters.com/owner/login</a>
    to sign in.<br><br>
    Questions? Reply to this email or contact us at support@findbackflowtesters.com.<br>
    FindBackflowTesters.com
  </p>
</body></html>`.trim()
}

function buildApprovalText(p: {
  contactName: string
  listingName: string
  listingLocation: string
  signupUrl: string
  siteUrl: string
}) {
  return [
    `Hi ${p.contactName},`,
    '',
    `Great news! Your request for ${p.listingName} has been approved.`,
    '',
    'Click the link below to create your owner account, choose a plan, and start managing your listing:',
    p.signupUrl,
    '',
    'What happens next?',
    '1. Click the link above to create your account with a password',
    '2. Choose a plan (free or paid) to activate your listing',
    '3. Start managing your listing from your owner dashboard',
    '',
    `Already have an account? Sign in at ${p.siteUrl}/owner/login`,
    '',
    'Questions? Reply to this email or contact us at support@findbackflowtesters.com.',
    'FindBackflowTesters.com',
  ].join('\n')
}

function buildRejectionHtml(p: {
  contactName: string
  listingName: string
  listingLocation: string
  siteUrl: string
}) {
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#374151">Listing Request Update</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${p.listingName}${p.listingLocation ? ` &mdash; ${p.listingLocation}` : ''}</p>
  </div>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Hi ${p.contactName},<br><br>
    Thank you for your interest in claiming <strong>${p.listingName}</strong> on FindBackflowTesters.com.
  </p>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Unfortunately, we were not able to verify your business at this time. This may be due to
    incomplete information, a mismatch with our records, or other verification requirements.
  </p>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    If you believe this was made in error or if you have additional documentation that may help,
    feel free to contact us by replying to this email or via the
    <a href="${p.siteUrl}/contact" style="color:#2563eb">contact form on our website</a>.
    We&rsquo;re happy to take another look.
  </p>

  <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px">
    FindBackflowTesters.com
  </p>
</body></html>`.trim()
}

function buildRejectionText(p: {
  contactName: string
  listingName: string
  listingLocation: string
  siteUrl: string
}) {
  return [
    `Hi ${p.contactName},`,
    '',
    `Thank you for your interest in claiming ${p.listingName} on FindBackflowTesters.com.`,
    '',
    'Unfortunately, we were not able to verify your business at this time. This may be due to',
    'incomplete information, a mismatch with our records, or other verification requirements.',
    '',
    'If you believe this was made in error or if you have additional documentation that may help,',
    'feel free to contact us by replying to this email or via the contact form on our website:',
    `${p.siteUrl}/contact`,
    '',
    "We're happy to take another look.",
    '',
    'FindBackflowTesters.com',
  ].join('\n')
}
