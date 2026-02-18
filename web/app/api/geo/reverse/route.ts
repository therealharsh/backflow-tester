import { NextRequest, NextResponse } from 'next/server'
import { reverseGeocode } from '@/lib/google-places'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  if (!limiter(ip).allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Valid lat and lng required' }, { status: 400 })
  }

  const place = await reverseGeocode(lat, lng)
  if (!place) {
    return NextResponse.json({ error: 'Could not resolve location' }, { status: 404 })
  }

  return NextResponse.json(place, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
