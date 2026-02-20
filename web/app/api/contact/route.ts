import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { contactFormSchema } from '@/lib/contact-schema'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 })

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      '127.0.0.1'

    if (!limiter(ip).allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = contactFormSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid form data', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Honeypot — silently accept to not tip off bots
    if (data.honeypot) {
      return NextResponse.json({ ok: true })
    }

    // Timing check — reject if submitted < 800ms after form load
    if (Date.now() - data.loadedAt < 800) {
      return NextResponse.json({ ok: true })
    }

    // Store in Supabase
    try {
      const supabase = createServerClient()
      await supabase.from('contact_messages').insert({
        first_name: data.firstName,
        last_name: data.lastName || null,
        email: data.email,
        phone: data.phone || null,
        message: data.message,
        ip_address: ip,
      })
    } catch (dbErr) {
      console.error('[contact] DB insert failed (non-fatal):', dbErr)
    }

    // Send email notification
    const ADMIN_EMAIL = process.env.ADMIN_LEADS_EMAIL
    const CC_EMAIL = process.env.ADMIN_LEADS_EMAIL_CC
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'leads@findbackflowtesters.com'
    const API_KEY = process.env.RESEND_API_KEY

    if (ADMIN_EMAIL && API_KEY) {
      const resend = new Resend(API_KEY)
      const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ')

      await resend.emails.send({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        ...(CC_EMAIL ? { cc: [CC_EMAIL] } : {}),
        subject: `Contact Form: ${fullName}`,
        html: buildHtml(data, ip),
        text: buildText(data, ip),
      })
    } else {
      console.warn('[contact] Email not sent — ADMIN_LEADS_EMAIL or RESEND_API_KEY not configured')
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contact] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(data: ReturnType<typeof contactFormSchema.parse>, ip: string): string {
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ')
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1d4ed8">New Contact Message</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">From ${esc(fullName)} (${esc(data.email)})</p>
  </div>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:24px;width:100%">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">Name</td><td style="padding:4px 0">${esc(fullName)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">Email</td><td style="padding:4px 0">${esc(data.email)}</td></tr>
    ${data.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">Phone</td><td style="padding:4px 0">${esc(data.phone)}</td></tr>` : ''}
  </table>
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Message</h2>
  <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(data.message)}</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px">
    IP: ${esc(ip)} | ${new Date().toISOString()}<br>
    Sent from FindBackflowTesters.com contact form
  </p>
</body></html>`.trim()
}

function buildText(data: ReturnType<typeof contactFormSchema.parse>, ip: string): string {
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ')
  return [
    `NEW CONTACT MESSAGE`,
    ``,
    `Name: ${fullName}`,
    `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : null,
    ``,
    `MESSAGE`,
    data.message,
    ``,
    `---`,
    `IP: ${ip}`,
    `Time: ${new Date().toISOString()}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}
