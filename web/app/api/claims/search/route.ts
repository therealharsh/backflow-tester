import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ providers: [] })
  }

  const supabase = createServerClient()

  const { data } = await supabase
    .from('providers')
    .select('place_id, name, city, state_code, provider_slug, rating, reviews, claimed')
    .ilike('name', `%${q}%`)
    .order('reviews', { ascending: false })
    .limit(20)

  return NextResponse.json({ providers: data ?? [] })
}
