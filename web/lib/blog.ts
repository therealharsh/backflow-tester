import { createServerClient } from './supabase'
import type { BlogPost } from '@/types'

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  return (data ?? []) as BlogPost[]
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  return (data as BlogPost) ?? null
}
