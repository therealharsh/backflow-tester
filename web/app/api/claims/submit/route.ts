import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'

const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

interface ClaimBody {
  type: 'claim'
  providerPlaceId: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  message?: string
}

interface RegisterBody {
  type: 'register'
  businessName: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  address?: string
  city: string
  state: string
  postalCode?: string
  website?: string
  message?: string
}

type SubmitBody = ClaimBody | RegisterBody

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitBody

    const { type, contactName, contactEmail, contactPhone, message } = body

    // ── Validate common fields ────────────────────────────────
    if (!type || !['claim', 'register'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    if (!contactName?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!contactEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    let providerPlaceId: string | null = null
    let submittedListing: Record<string, unknown> | null = null
    let listingName = ''
    let listingLocation = ''

    if (type === 'claim') {
      // ── Claim-specific validation ────────────────────────────
      const { providerPlaceId: pid } = body as ClaimBody
      if (!pid?.trim()) {
        return NextResponse.json({ error: 'Provider ID is required for claims' }, { status: 400 })
      }

      // Verify provider exists
      const { data: provider } = await supabase
        .from('providers')
        .select('place_id, name, city, state_code, claimed')
        .eq('place_id', pid.trim())
        .single()

      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
      }

      if (provider.claimed) {
        return NextResponse.json({ error: 'This listing has already been claimed' }, { status: 409 })
      }

      // Check for existing pending claim request
      const { data: existing } = await supabase
        .from('provider_claim_requests')
        .select('id')
        .eq('provider_place_id', pid.trim())
        .eq('status', 'pending')
        .limit(1)

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: 'A claim request is already pending for this listing' },
          { status: 409 },
        )
      }

      providerPlaceId = pid.trim()
      listingName = provider.name
      listingLocation = `${provider.city}, ${provider.state_code}`
    } else {
      // ── Register-specific validation ─────────────────────────
      const reg = body as RegisterBody
      if (!reg.businessName?.trim()) {
        return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
      }
      if (!reg.city?.trim() || !reg.state?.trim()) {
        return NextResponse.json({ error: 'City and state are required' }, { status: 400 })
      }
      const stateCode = reg.state.toUpperCase().trim()
      if (!VALID_STATES.has(stateCode)) {
        return NextResponse.json({ error: 'Invalid state code' }, { status: 400 })
      }

      submittedListing = {
        name: reg.businessName.trim(),
        phone: reg.contactPhone?.trim() || null,
        email: contactEmail.toLowerCase().trim(),
        address: reg.address?.trim() || null,
        city: reg.city.trim(),
        state: stateCode,
        postalCode: reg.postalCode?.trim() || null,
        website: reg.website?.trim() || null,
      }

      listingName = reg.businessName.trim()
      listingLocation = `${reg.city.trim()}, ${stateCode}`
    }

    // ── Insert claim request ──────────────────────────────────
    const { data: claimRequest, error: insertError } = await supabase
      .from('provider_claim_requests')
      .insert({
        type,
        provider_place_id: providerPlaceId,
        submitted_listing: submittedListing,
        contact_name: contactName.trim(),
        contact_email: contactEmail.toLowerCase().trim(),
        contact_phone: contactPhone?.trim() || null,
        desired_tier: 'free',
        message: message?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !claimRequest) {
      console.error('[claims/submit] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 })
    }

    // ── Send confirmation email ───────────────────────────────
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@findbackflowtesters.com'

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: fromEmail,
        to: [contactEmail.toLowerCase().trim()],
        subject: 'Claim request received — review within 2 business days',
        html: buildConfirmationHtml({
          contactName: contactName.trim(),
          listingName,
          listingLocation,
          type,
        }),
        text: buildConfirmationText({
          contactName: contactName.trim(),
          listingName,
          listingLocation,
          type,
        }),
      })
    } catch (emailErr) {
      // Log but don't fail the request — the claim row is already created
      console.error('[claims/submit] Email send error (non-fatal):', emailErr)
    }

    // ── Send admin notification email ─────────────────────────
    const adminEmail = process.env.ADMIN_LEADS_EMAIL
    const adminCc = process.env.ADMIN_LEADS_EMAIL_CC
    if (adminEmail) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
        const reviewUrl = `${siteUrl}/admin/claims`

        await resend.emails.send({
          from: fromEmail,
          to: [adminEmail],
          ...(adminCc ? { cc: [adminCc] } : {}),
          subject: `New ${type === 'claim' ? 'Claim' : 'Registration'}: ${listingName} — ${listingLocation}`,
          html: buildAdminNotificationHtml({
            requestId: claimRequest.id,
            contactName: contactName.trim(),
            contactEmail: contactEmail.toLowerCase().trim(),
            contactPhone: contactPhone?.trim() || null,
            listingName,
            listingLocation,
            type,
            message: message?.trim() || null,
            submittedListing,
            reviewUrl,
          }),
          text: buildAdminNotificationText({
            requestId: claimRequest.id,
            contactName: contactName.trim(),
            contactEmail: contactEmail.toLowerCase().trim(),
            contactPhone: contactPhone?.trim() || null,
            listingName,
            listingLocation,
            type,
            message: message?.trim() || null,
            submittedListing,
            reviewUrl,
          }),
        })
      } catch (adminEmailErr) {
        console.error('[claims/submit] Admin email error (non-fatal):', adminEmailErr)
      }
    }

    console.log('[claims/submit] Request created', {
      id: claimRequest.id,
      type,
      listing: listingName,
      email: contactEmail.toLowerCase().trim(),
    })

    return NextResponse.json({
      ok: true,
      requestId: claimRequest.id,
      listingName,
      listingLocation,
    })
  } catch (err) {
    console.error('[claims/submit] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Email builders ────────────────────────────────────────────────

function buildConfirmationHtml(p: {
  contactName: string
  listingName: string
  listingLocation: string
  type: 'claim' | 'register'
}) {
  const action = p.type === 'claim' ? 'claim' : 'registration'
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1d4ed8">We Received Your ${p.type === 'claim' ? 'Claim' : 'Registration'} Request</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${p.listingName} &mdash; ${p.listingLocation}</p>
  </div>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Hi ${p.contactName},<br><br>
    Thanks for submitting your ${action} request for <strong>${p.listingName}</strong>.
    Our team will review it and get back to you within <strong>2 business days</strong>.
  </p>

  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:24px 0">
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#111827">Request Summary</p>
    <table style="font-size:14px;color:#374151;line-height:1.8">
      <tr><td style="color:#6b7280;padding-right:12px">Listing:</td><td>${p.listingName}</td></tr>
      <tr><td style="color:#6b7280;padding-right:12px">Location:</td><td>${p.listingLocation}</td></tr>
      <tr><td style="color:#6b7280;padding-right:12px">Type:</td><td style="text-transform:capitalize">${p.type}</td></tr>
    </table>
  </div>

  <p style="font-size:14px;line-height:1.6;color:#374151">
    <strong>What happens next?</strong><br>
    Once approved, you&rsquo;ll receive an email with instructions to set up your account
    and choose a plan.
  </p>

  <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px">
    Questions? Reply to this email or contact us at support@findbackflowtesters.com.<br>
    FindBackflowTesters.com
  </p>
</body></html>`.trim()
}

function buildConfirmationText(p: {
  contactName: string
  listingName: string
  listingLocation: string
  type: 'claim' | 'register'
}) {
  const action = p.type === 'claim' ? 'claim' : 'registration'
  return [
    `Hi ${p.contactName},`,
    '',
    `Thanks for submitting your ${action} request for ${p.listingName}.`,
    'Our team will review it and get back to you within 2 business days.',
    '',
    'Request Summary:',
    `  Listing: ${p.listingName}`,
    `  Location: ${p.listingLocation}`,
    `  Type: ${p.type}`,
    '',
    'What happens next?',
    "Once approved, you'll receive an email with instructions to set up your account",
    'and choose a plan.',
    '',
    'Questions? Reply to this email or contact us at support@findbackflowtesters.com.',
    'FindBackflowTesters.com',
  ].join('\n')
}

// ── Admin notification email builders ────────────────────────────

interface AdminNotificationParams {
  requestId: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  listingName: string
  listingLocation: string
  type: 'claim' | 'register'
  message: string | null
  submittedListing: Record<string, unknown> | null
  reviewUrl: string
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildAdminNotificationHtml(p: AdminNotificationParams) {
  const typeLabel = p.type === 'claim' ? 'Claim' : 'New Registration'

  let listingDetails = ''
  if (p.submittedListing) {
    const sl = p.submittedListing
    const rows = [
      sl.name ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Business</td><td>${esc(String(sl.name))}</td></tr>` : '',
      sl.address ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Address</td><td>${esc(String(sl.address))}</td></tr>` : '',
      sl.city ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">City/State</td><td>${esc(String(sl.city))}, ${esc(String(sl.state || ''))}</td></tr>` : '',
      sl.postalCode ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">ZIP</td><td>${esc(String(sl.postalCode))}</td></tr>` : '',
      sl.website ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Website</td><td><a href="${esc(String(sl.website))}" style="color:#2563eb">${esc(String(sl.website))}</a></td></tr>` : '',
      sl.phone ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Phone</td><td>${esc(String(sl.phone))}</td></tr>` : '',
    ].filter(Boolean).join('\n      ')

    listingDetails = `
    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:16px 0 8px">Submitted Listing Details</h3>
    <table style="font-size:14px;border-collapse:collapse">
      ${rows}
    </table>`
  }

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#92400e">New ${esc(typeLabel)} Request</h1>
    <p style="margin:0;color:#78350f;font-size:14px">${esc(p.listingName)} &mdash; ${esc(p.listingLocation)}</p>
  </div>

  <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Request ID</td><td style="font-family:monospace;font-size:12px">${esc(p.requestId)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Type</td><td style="text-transform:capitalize;font-weight:600">${esc(p.type)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Contact</td><td>${esc(p.contactName)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td><a href="mailto:${esc(p.contactEmail)}" style="color:#2563eb">${esc(p.contactEmail)}</a></td></tr>
    ${p.contactPhone ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Phone</td><td>${esc(p.contactPhone)}</td></tr>` : ''}
    ${p.message ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Message</td><td>${esc(p.message)}</td></tr>` : ''}
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Submitted</td><td>${new Date().toISOString()}</td></tr>
  </table>

  ${listingDetails}

  <div style="margin-top:24px">
    <a href="${esc(p.reviewUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none">
      Review &amp; Approve/Reject
    </a>
  </div>

  <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px">
    This notification was generated by FindBackflowTesters.com
  </p>
</body></html>`.trim()
}

function buildAdminNotificationText(p: AdminNotificationParams) {
  const typeLabel = p.type === 'claim' ? 'CLAIM' : 'REGISTRATION'

  const lines: (string | null)[] = [
    `NEW ${typeLabel} REQUEST`,
    `${p.listingName} — ${p.listingLocation}`,
    '',
    `Request ID: ${p.requestId}`,
    `Type: ${p.type}`,
    `Contact: ${p.contactName}`,
    `Email: ${p.contactEmail}`,
    p.contactPhone ? `Phone: ${p.contactPhone}` : null,
    p.message ? `Message: ${p.message}` : null,
    `Submitted: ${new Date().toISOString()}`,
  ]

  if (p.submittedListing) {
    const sl = p.submittedListing
    lines.push('')
    lines.push('SUBMITTED LISTING DETAILS')
    if (sl.name) lines.push(`  Business: ${sl.name}`)
    if (sl.address) lines.push(`  Address: ${sl.address}`)
    if (sl.city) lines.push(`  City/State: ${sl.city}, ${sl.state || ''}`)
    if (sl.postalCode) lines.push(`  ZIP: ${sl.postalCode}`)
    if (sl.website) lines.push(`  Website: ${sl.website}`)
    if (sl.phone) lines.push(`  Phone: ${sl.phone}`)
  }

  lines.push('')
  lines.push(`Review & approve/reject: ${p.reviewUrl}`)

  return lines.filter((l) => l !== null).join('\n')
}
