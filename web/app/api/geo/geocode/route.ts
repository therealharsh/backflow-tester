import { NextRequest, NextResponse } from 'next/server'
import { getPlaceDetails } from '@/lib/google-places'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  if (!limiter(ip).allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const placeId = req.nextUrl.searchParams.get('placeId') ?? ''
  const sessionToken = req.nextUrl.searchParams.get('sessionToken') ?? ''

  if (!placeId) {
    return NextResponse.json({ error: 'placeId required' }, { status: 400 })
  }

  const place = await getPlaceDetails(placeId, sessionToken)
  if (!place) {
    return NextResponse.json({ error: 'Place not found' }, { status: 404 })
  }

  return NextResponse.json(place, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  })
}
