import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

/**
 * POST /api/owner/upload
 * Uploads images to Supabase storage under provider-images/{place_id}/.
 *
 * FormData: providerPlaceId + files[]
 * Auth: Bearer token (Supabase session)
 */
export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const formData = await request.formData()
    const providerPlaceId = formData.get('providerPlaceId') as string
    const files = formData.getAll('files') as File[]

    if (!providerPlaceId) {
      return NextResponse.json({ error: 'Missing providerPlaceId' }, { status: 400 })
    }

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify ownership
    const { data: owner } = await supabase
      .from('provider_owners')
      .select('id')
      .eq('provider_place_id', providerPlaceId)
      .eq('owner_user_id', user.id)
      .single()

    if (!owner) {
      return NextResponse.json({ error: 'Not authorized for this provider' }, { status: 403 })
    }

    // Verify paid tier
    const { data: sub } = await supabase
      .from('provider_subscriptions')
      .select('tier, status')
      .eq('provider_place_id', providerPlaceId)
      .single()

    if (!sub || sub.status !== 'active' || sub.tier === 'free') {
      return NextResponse.json({ error: 'Paid subscription required to upload images' }, { status: 403 })
    }

    const uploaded: { filename: string; url: string }[] = []
    const errors: string[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        errors.push(`${file.name}: unsupported file type`)
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: exceeds 5 MB limit`)
        continue
      }

      const sanitized = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '-')
        .replace(/-+/g, '-')

      const storagePath = `${providerPlaceId}/${Date.now()}-${sanitized}`
      const buffer = Buffer.from(await file.arrayBuffer())

      const { error: uploadError } = await supabase.storage
        .from('provider-images')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        errors.push(`${file.name}: upload failed`)
        console.error('[owner/upload] Upload error:', uploadError)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('provider-images')
        .getPublicUrl(storagePath)

      uploaded.push({ filename: file.name, url: urlData.publicUrl })
    }

    return NextResponse.json({ uploaded, errors })
  } catch (err) {
    console.error('[owner/upload] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
