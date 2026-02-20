'use client'

import { useRef, useState } from 'react'
import type { BlogPost } from '@/types'

function toSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

interface Props {
  post?: BlogPost
  onSave: (data: Record<string, unknown>) => void | Promise<void>
  accessToken: string
}

export default function PostForm({ post, onSave, accessToken }: Props) {
  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [content, setContent] = useState(post?.content ?? '')
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url ?? '')
  const [coverAlt, setCoverAlt] = useState(post?.cover_image_alt ?? '')
  const [tags, setTags] = useState(post?.tags?.join(', ') ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(post?.status ?? 'draft')
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? '')
  const [seoDesc, setSeoDesc] = useState(post?.seo_description ?? '')
  const [saving, setSaving] = useState(false)

  // Image upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadedImages, setUploadedImages] = useState<{ filename: string; url: string }[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const autoSlug = !post // only auto-slug for new posts

  function handleTitleChange(val: string) {
    setTitle(val)
    if (autoSlug) setSlug(toSlug(val))
  }

  async function handleUpload() {
    const files = fileInputRef.current?.files
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError('')

    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append('files', file)
    }

    try {
      const res = await fetch('/api/admin/blog/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed')
      } else {
        setUploadedImages((prev) => [...prev, ...data.uploaded])
        if (data.errors?.length) {
          setUploadError(data.errors.join('; '))
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch {
      setUploadError('Network error during upload')
    } finally {
      setUploading(false)
    }
  }

  async function handleCopy(url: string) {
    const markdown = `![alt](${url})`
    await navigator.clipboard.writeText(markdown)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave({
      title,
      slug,
      excerpt: excerpt || null,
      content,
      cover_image_url: coverUrl || null,
      cover_image_alt: coverAlt || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      status,
      published_at: post?.published_at ?? null,
      seo_title: seoTitle || null,
      seo_description: seoDesc || null,
    })
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
        <input
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
        <textarea
          rows={2}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Content (Markdown)
        </label>
        <textarea
          rows={16}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono leading-relaxed"
        />
      </div>

      {/* Image Upload Section */}
      <fieldset className="border border-gray-100 rounded-xl p-4">
        <legend className="text-sm font-medium text-gray-700 px-1">Upload Images</legend>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}

          {uploadedImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Uploaded Images
              </p>
              {uploadedImages.map((img) => (
                <div
                  key={img.url}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
                >
                  <img
                    src={img.url}
                    alt={img.filename}
                    className="w-10 h-10 object-cover rounded"
                  />
                  <code className="text-xs text-gray-600 flex-1 truncate">
                    ![alt]({img.url})
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(img.url)}
                    className="px-3 py-1 text-xs font-medium rounded bg-gray-200 hover:bg-gray-300 whitespace-nowrap"
                  >
                    {copiedUrl === img.url ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cover Image URL
        </label>
        <input
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cover Image Alt Text
        </label>
        <input
          type="text"
          value={coverAlt}
          onChange={(e) => setCoverAlt(e.target.value)}
          placeholder="Describe the cover image for accessibility"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="backflow, testing, guide"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <fieldset className="border border-gray-100 rounded-xl p-4">
        <legend className="text-sm font-medium text-gray-700 px-1">SEO Overrides</legend>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="SEO Title (optional)"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="text"
            placeholder="SEO Description (optional)"
            value={seoDesc}
            onChange={(e) => setSeoDesc(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
          className="px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : post ? 'Update Post' : 'Create Post'}
        </button>
      </div>
    </form>
  )
}
