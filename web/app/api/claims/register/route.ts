import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/admin'
import { slugify } from '@/lib/geo-utils'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      businessName, contactName, email, phone,
      address, city, state, postalCode, website,
    } = body as {
      businessName: string
      contactName: string
      email: string
      phone?: string
      address?: string
      city: string
      state: string
      postalCode?: string
      website?: string
    }

    // Validate required fields
    if (!businessName?.trim() || !contactName?.trim() || !email?.trim() || !city?.trim() || !state?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const stateCode = state.toUpperCase().trim()
    if (!VALID_STATES.has(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Generate a unique place_id and provider_slug for this new listing
    const citySlug = slugify(city.trim())
    const baseSlug = slugify(`${businessName.trim()} ${city.trim()} ${stateCode}`)
    const placeId = `reg_${crypto.randomBytes(12).toString('hex')}`

    // Ensure slug is unique
    let providerSlug = baseSlug
    const { data: existing } = await supabase
      .from('providers')
      .select('provider_slug')
      .eq('provider_slug', baseSlug)
      .limit(1)

    if (existing && existing.length > 0) {
      providerSlug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`
    }

    // Create the provider record
    const { error: providerError } = await supabase.from('providers').insert({
      place_id: placeId,
      name: businessName.trim(),
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      address: address?.trim() || null,
      city: city.trim(),
      city_slug: citySlug,
      state_code: stateCode,
      postal_code: postalCode?.trim() || null,
      tier: null,
      backflow_score: 0,
      reviews: 0,
      provider_slug: providerSlug,
      image_urls: '[]',
      claimed: false,
      claim_status: 'pending',
      claim_email: email.toLowerCase().trim(),
      is_premium: false,
      premium_rank: 0,
    })

    if (providerError) {
      console.error('[register] Provider insert error:', providerError)
      return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
    }

    // Create the claim
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const { error: claimError } = await supabase.from('provider_claims').insert({
      provider_id: placeId,
      claimant_email: email.toLowerCase().trim(),
      claimant_name: contactName.trim(),
      claimant_phone: phone?.trim() || null,
      verification_token: token,
      verification_expires_at: expiresAt.toISOString(),
      status: 'pending',
    })

    if (claimError) {
      console.error('[register] Claim insert error:', claimError)
      // Clean up the provider we just created
      await supabase.from('providers').delete().eq('place_id', placeId)
      return NextResponse.json({ error: 'Failed to create claim' }, { status: 500 })
    }

    // Send verification email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
    const verifyUrl = `${siteUrl}/claim/verify?token=${token}`
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@findbackflowtesters.com'

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: fromEmail,
      to: [email.toLowerCase().trim()],
      subject: 'Verify your listing on FindBackflowTesters.com',
      html: `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1d4ed8">Verify Your New Listing</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${businessName.trim()}</p>
  </div>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Hi ${contactName.trim()},<br><br>
    Your listing for <strong>${businessName.trim()}</strong> in ${city.trim()}, ${stateCode} has been created
    on FindBackflowTesters.com. Click the button below to verify your email and activate your listing.
  </p>

  <div style="text-align:center;margin:32px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none">
      Verify My Email
    </a>
  </div>

  <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px">
    After verifying, you can upgrade to a premium plan for higher placement in search results.<br>
    FindBackflowTesters.com
  </p>
</body></html>`.trim(),
      text: `Verify your new listing for ${businessName.trim()}\n\nClick this link to verify: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    })

    console.log('[register] New listing + verification email sent', {
      business: businessName.trim(),
      city: city.trim(),
      state: stateCode,
      email: email.toLowerCase().trim(),
    })

    return NextResponse.json({ ok: true, providerSlug })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[register] Error:', message, err)
    return NextResponse.json({ error: `Internal server error: ${message}` }, { status: 500 })
  }
}
