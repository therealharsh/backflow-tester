'use client'

import { useState } from 'react'
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
}

export default function PostForm({ post, onSave }: Props) {
  const [title, setTitle] = useState(post?.title ?? '')
  const [slug, setSlug] = useState(post?.slug ?? '')
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [content, setContent] = useState(post?.content ?? '')
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url ?? '')
  const [tags, setTags] = useState(post?.tags?.join(', ') ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(post?.status ?? 'draft')
  const [seoTitle, setSeoTitle] = useState(post?.seo_title ?? '')
  const [seoDesc, setSeoDesc] = useState(post?.seo_description ?? '')
  const [saving, setSaving] = useState(false)

  const autoSlug = !post // only auto-slug for new posts

  function handleTitleChange(val: string) {
    setTitle(val)
    if (autoSlug) setSlug(toSlug(val))
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
