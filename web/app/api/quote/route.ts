import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@/lib/supabase'
import { quoteRequestSchema, type QuoteRequest } from '@/lib/quote-schema'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const ADMIN_EMAIL = process.env.ADMIN_LEADS_EMAIL ?? ''
    const CC_EMAIL = process.env.ADMIN_LEADS_EMAIL_CC ?? ''
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'leads@findbackflowtesters.com'
    const body = await request.json()
    const parsed = quoteRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid form data', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Honeypot check — silently accept to not tip off bots
    if (data.honeypot) {
      return NextResponse.json({ ok: true })
    }

    // Timing check — reject if submitted < 800ms after form load
    if (Date.now() - data.loadedAt < 800) {
      return NextResponse.json({ ok: true })
    }

    if (!ADMIN_EMAIL) {
      console.error('[quote] ADMIN_LEADS_EMAIL not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    const userAgent = request.headers.get('user-agent') ?? ''

    const p = data.provider
    const subject = `New Quote Lead: ${p.name} — ${p.city}, ${p.stateCode}`

    const html = buildHtml(data, ip, userAgent)
    const text = buildText(data, ip, userAgent)

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      ...(CC_EMAIL ? { cc: [CC_EMAIL] } : {}),
      subject,
      html,
      text,
    })

    // Store lead in Supabase
    try {
      const supabase = createServerClient()
      await supabase.from('leads').insert({
        provider_id: p.placeId,
        provider_slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        provider_name: p.name,
        first_name: data.firstName,
        last_name: data.lastName || null,
        email: data.email,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        source: 'provider_page',
        page_url: data.pageUrl || null,
        ip_address: ip,
      })
    } catch (dbErr) {
      console.error('[quote] Lead DB insert failed (non-fatal):', dbErr)
    }

    console.log('[quote] Lead sent', {
      provider: p.name,
      city: p.city,
      state: p.stateCode,
      customer: data.email,
      ts: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[quote] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function row(label: string, value: string | null | undefined) {
  if (!value) return ''
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${label}</td><td style="padding:4px 0;color:#111827">${esc(value)}</td></tr>`
}

function linkRow(label: string, url: string | null | undefined, text?: string) {
  if (!url) return ''
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${label}</td><td style="padding:4px 0"><a href="${esc(url)}" style="color:#2563eb">${esc(text ?? url)}</a></td></tr>`
}

function buildHtml(data: QuoteRequest, ip: string, ua: string): string {
  const p = data.provider
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ')

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#eff6ff;border-radius:12px;padding:20px;margin-bottom:24px">
    <h1 style="margin:0 0 4px;font-size:20px;color:#1d4ed8">New Quote Request</h1>
    <p style="margin:0;color:#6b7280;font-size:14px">${esc(p.name)} — ${esc(p.city)}, ${esc(p.stateCode)}</p>
  </div>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Customer</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:24px">
    ${row('Name', fullName)}
    ${row('Email', data.email)}
    ${row('Phone', data.phone || null)}
    ${row('Address', data.address || null)}
    ${row('Notes', data.notes || null)}
  </table>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Provider</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:24px">
    ${row('Name', p.name)}
    ${row('Phone', p.phone)}
    ${linkRow('Website', p.website)}
    ${row('Address', [p.address, p.city, p.stateCode, p.postalCode].filter(Boolean).join(', '))}
    ${linkRow('Google Maps', p.locationLink, 'Open in Maps')}
    ${row('Place ID', p.placeId)}
    ${row('Google ID', p.googleId)}
  </table>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Source</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:24px">
    ${linkRow('Page', data.pageUrl, data.pageUrl)}
    ${row('Timestamp', new Date().toISOString())}
    ${row('IP', ip)}
    ${row('User Agent', ua.slice(0, 120))}
  </table>

  <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:12px">
    This lead was generated on FindBackflowTesters.com
  </p>
</body></html>`.trim()
}

function buildText(data: QuoteRequest, ip: string, ua: string): string {
  const p = data.provider
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ')

  return [
    `NEW QUOTE REQUEST`,
    `${p.name} — ${p.city}, ${p.stateCode}`,
    ``,
    `CUSTOMER`,
    `Name: ${fullName}`,
    `Email: ${data.email}`,
    data.phone ? `Phone: ${data.phone}` : null,
    data.address ? `Address: ${data.address}` : null,
    data.notes ? `Notes: ${data.notes}` : null,
    ``,
    `PROVIDER`,
    `Name: ${p.name}`,
    p.phone ? `Phone: ${p.phone}` : null,
    p.website ? `Website: ${p.website}` : null,
    `Address: ${[p.address, p.city, p.stateCode, p.postalCode].filter(Boolean).join(', ')}`,
    p.locationLink ? `Google Maps: ${p.locationLink}` : null,
    `Place ID: ${p.placeId}`,
    p.googleId ? `Google ID: ${p.googleId}` : null,
    ``,
    `SOURCE`,
    `Page: ${data.pageUrl}`,
    `Time: ${new Date().toISOString()}`,
    `IP: ${ip}`,
    `UA: ${ua.slice(0, 120)}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}
