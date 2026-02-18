import { NextResponse } from 'next/server'
import { verifyAdmin, createServiceClient } from '@/lib/admin'

/** GET /api/admin/blog — list all posts (drafts + published) */
export async function GET(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, status, published_at, created_at, updated_at, tags')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** POST /api/admin/blog — create a new post */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt ?? null,
      content: body.content ?? '',
      cover_image_url: body.cover_image_url ?? null,
      tags: body.tags ?? [],
      status: body.status ?? 'draft',
      published_at: body.status === 'published' ? (body.published_at ?? new Date().toISOString()) : null,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
