import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = [
  'get_quote_clicked',
  'call_clicked',
  'website_clicked',
  'directions_clicked',
  'quote_submitted',
  'quote_succeeded',
  'quote_failed',
]

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { event, providerId, providerName, pageUrl, metadata } = body

    if (!event || !ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    const referrer = request.headers.get('referer') ?? ''

    const supabase = createServerClient()
    await supabase.from('lead_events').insert({
      event,
      provider_id: providerId || null,
      provider_name: providerName || null,
      page_url: pageUrl || null,
      referrer: referrer || null,
      ip_address: ip,
      metadata: metadata || {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[lead-event] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
