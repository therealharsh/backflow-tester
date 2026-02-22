import { createServerClient } from './supabase'
import type { BlogPost } from '@/types'

/**
 * Fetch a published post by exact slug OR by a redirect_from slug.
 * Prefers exact slug match. Returns null if no match found.
 */
export async function getPublishedPostBySlugOrRedirect(slug: string): Promise<{
  post: BlogPost
  matchedByRedirect: boolean
  canonicalSlug: string
} | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .or(`slug.eq.${slug},redirect_from.cs.{${slug}}`)

  if (!data || data.length === 0) return null

  // Prefer exact slug match if both could match
  const exact = data.find((p: BlogPost) => p.slug === slug)
  const post = (exact ?? data[0]) as BlogPost
  const matchedByRedirect = post.slug !== slug

  return { post, matchedByRedirect, canonicalSlug: post.slug }
}

/**
 * List all published posts (canonical slugs only) for sitemap + blog listing.
 * Does NOT expand redirect_from.
 */
export async function listPublishedPosts(): Promise<BlogPost[]> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, content, cover_image_url, cover_image_alt, tags, status, published_at, seo_title, seo_description, created_at, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []) as BlogPost[]
}

/** @deprecated Use listPublishedPosts or getPublishedPostBySlugOrRedirect instead */
export async function getPublishedPosts(): Promise<BlogPost[]> {
  return listPublishedPosts()
}

/** @deprecated Use getPublishedPostBySlugOrRedirect instead */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const result = await getPublishedPostBySlugOrRedirect(slug)
  return result?.post ?? null
}
