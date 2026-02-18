import { NextRequest, NextResponse } from 'next/server'
import { autocomplete } from '@/lib/google-places'
import { createRateLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  if (!limiter(ip).allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const sessionToken = req.nextUrl.searchParams.get('sessionToken') ?? ''

  if (q.length < 2) return NextResponse.json([])
  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken required' }, { status: 400 })
  }

  const predictions = await autocomplete(q, sessionToken)
  return NextResponse.json(predictions, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
