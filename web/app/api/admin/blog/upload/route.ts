import { NextResponse } from 'next/server'
import { verifyAdmin, createServiceClient } from '@/lib/admin'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]

/** POST /api/admin/blog/upload — upload images to blog-images bucket */
export async function POST(request: Request) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  for (const file of files) {
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file in upload' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 5MB limit` },
        { status: 400 },
      )
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File "${file.name}" has unsupported type: ${file.type}` },
        { status: 400 },
      )
    }
  }

  const supabase = createServiceClient()
  const results: { filename: string; url: string }[] = []
  const errors: string[] = []

  for (const file of files) {
    const sanitized = file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
    const storagePath = `${Date.now()}-${sanitized}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from('blog-images')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      errors.push(`Failed to upload "${file.name}": ${error.message}`)
      continue
    }

    const { data: urlData } = supabase.storage
      .from('blog-images')
      .getPublicUrl(storagePath)

    results.push({ filename: file.name, url: urlData.publicUrl })
  }

  if (results.length === 0 && errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({ uploaded: results, errors })
}
