import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/admin'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { providerId, email, name, phone } = body as {
      providerId: string
      email: string
      name?: string
      phone?: string
    }

    if (!providerId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Check provider exists
    const { data: provider } = await supabase
      .from('providers')
      .select('place_id, name, claimed')
      .eq('place_id', providerId)
      .single()

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    if (provider.claimed) {
      return NextResponse.json({ error: 'This listing has already been claimed' }, { status: 409 })
    }

    // Check for existing pending/verified claim
    const { data: existing } = await supabase
      .from('provider_claims')
      .select('id, status')
      .eq('provider_id', providerId)
      .in('status', ['pending', 'verified'])
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'A claim is already in progress for this listing' },
        { status: 409 },
      )
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    // Create claim
    const { error: insertError } = await supabase.from('provider_claims').insert({
      provider_id: providerId,
      claimant_email: email.toLowerCase().trim(),
      claimant_name: name?.trim() || null,
      claimant_phone: phone?.trim() || null,
      verification_token: token,
      verification_expires_at: expiresAt.toISOString(),
      status: 'pending',
    })

    if (insertError) {
      console.error('[claim] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create claim' }, { status: 500 })
    }

    // Update provider claim tracking
    await supabase
      .from('providers')
      .update({ claim_status: 'pending', claim_email: email.toLowerCase().trim() })
      .eq('place_id', providerId)

    // Send verification email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://findbackflowtesters.com'
    const verifyUrl = `${siteUrl}/claim/verify?token=${token}`
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@findbackflowtesters.com'

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: fromEmail,
      to: [email.toLowerCase().trim()],
      subject: 'Verify your claim on FindBackflowTesters.com',
      html: `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1d4ed8">Verify Your Listing Claim</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${provider.name}</p>
  </div>

  <p style="font-size:15px;line-height:1.6;color:#374151">
    Hi${name ? ` ${name}` : ''},<br><br>
    Click the button below to verify your email and claim your listing on FindBackflowTesters.com.
    This link expires in 24 hours.
  </p>

  <div style="text-align:center;margin:32px 0">
    <a href="${verifyUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;text-decoration:none">
      Verify My Email
    </a>
  </div>

  <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:32px">
    If you didn't request this, you can ignore this email.<br>
    FindBackflowTesters.com
  </p>
</body></html>`.trim(),
      text: `Verify your listing claim for ${provider.name}\n\nClick this link to verify: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    })

    console.log('[claim] Verification email sent', {
      provider: provider.name,
      email: email.toLowerCase().trim(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[claim] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
