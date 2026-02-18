import { NextResponse } from 'next/server'
import { verifyAdmin, createServiceClient } from '@/lib/admin'

interface Ctx {
  params: Promise<{ id: string }>
}

/** GET /api/admin/blog/:id — single post with full content */
export async function GET(request: Request, ctx: Ctx) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

/** PUT /api/admin/blog/:id — update a post */
export async function PUT(request: Request, ctx: Ctx) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await request.json()
  const supabase = createServiceClient()

  // If publishing for the first time, set published_at
  const updates: Record<string, unknown> = {
    slug: body.slug,
    title: body.title,
    excerpt: body.excerpt ?? null,
    content: body.content ?? '',
    cover_image_url: body.cover_image_url ?? null,
    tags: body.tags ?? [],
    status: body.status ?? 'draft',
    seo_title: body.seo_title ?? null,
    seo_description: body.seo_description ?? null,
    updated_at: new Date().toISOString(),
  }

  if (body.status === 'published' && !body.published_at) {
    updates.published_at = new Date().toISOString()
  } else if (body.status === 'published' && body.published_at) {
    updates.published_at = body.published_at
  } else if (body.status === 'draft') {
    updates.published_at = null
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** DELETE /api/admin/blog/:id — delete a post */
export async function DELETE(request: Request, ctx: Ctx) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const supabase = createServiceClient()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
