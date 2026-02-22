/**
 * Blog near-duplicate detector.
 * Compares published posts using 5-word shingle Jaccard similarity.
 *
 * Usage: npx tsx scripts/blog-dedupe.ts  (from the web/ directory)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ── Normalize markdown content ───────────────────────────────────────

function normalize(md: string): string {
  let text = md
  // Strip images ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  // Strip links but keep text [text](url) -> text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Strip fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, '')
  // Strip inline code
  text = text.replace(/`[^`]+`/g, '')
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Strip markdown heading markers, bold, italic, etc.
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/[*_~]+/g, '')
  // Lowercase and collapse whitespace
  text = text.toLowerCase()
  // Keep only lines >= 30 chars
  const lines = text.split('\n').filter((l) => l.trim().length >= 30)
  // Collapse whitespace
  return lines.join(' ').replace(/\s+/g, ' ').trim()
}

// ── Shingle generation ───────────────────────────────────────────────

function buildShingles(text: string, n: number = 5): Set<string> {
  const words = text.split(' ')
  const shingles = new Set<string>()
  for (let i = 0; i <= words.length - n; i++) {
    shingles.add(words.slice(i, i + n).join(' '))
  }
  return shingles
}

// ── Jaccard similarity ───────────────────────────────────────────────

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  for (const s of smaller) {
    if (larger.has(s)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ── Title token overlap (for candidate filtering) ────────────────────

function titleTokens(title: string): Set<string> {
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'your', 'you', 'how', 'what', 'why', 'when', 'do', 'does', 'it', 'its',
  ])
  return new Set(
    title.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w)),
  )
}

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) {
    if (b.has(v)) return true
  }
  return false
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, content, tags')
    .eq('status', 'published')

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('No published posts found.')
    return
  }

  console.log(`Fetched ${data.length} published post(s). Analyzing...\n`)

  // Pre-process each post
  const posts = data.map((p) => ({
    slug: p.slug as string,
    title: p.title as string,
    tags: (p.tags ?? []) as string[],
    titleTokens: titleTokens(p.title as string),
    shingles: buildShingles(normalize(p.content as string)),
  }))

  const THRESHOLD = 0.35
  const pairs: { slugA: string; slugB: string; score: number; samples: string[] }[] = []

  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const a = posts[i]
      const b = posts[j]

      // Candidate filter: skip pairs with no title-token or tag overlap
      const tagOverlap = a.tags.some((t) => b.tags.includes(t))
      if (!tagOverlap && !hasOverlap(a.titleTokens, b.titleTokens)) continue

      const score = jaccard(a.shingles, b.shingles)
      if (score < THRESHOLD) continue

      // Collect sample shared shingles
      const shared: string[] = []
      for (const s of a.shingles) {
        if (b.shingles.has(s)) {
          shared.push(s)
          if (shared.length >= 3) break
        }
      }

      pairs.push({ slugA: a.slug, slugB: b.slug, score, samples: shared })
    }
  }

  if (pairs.length === 0) {
    console.log('No near-duplicate published posts above threshold.')
    return
  }

  pairs.sort((a, b) => b.score - a.score)

  console.log(`Found ${pairs.length} near-duplicate pair(s):\n`)
  for (const p of pairs) {
    console.log(`  ${p.slugA}  <->  ${p.slugB}`)
    console.log(`  Jaccard score: ${p.score.toFixed(3)}`)
    if (p.samples.length > 0) {
      console.log('  Shared shingles:')
      for (const s of p.samples) {
        console.log(`    - "${s}"`)
      }
    }
    console.log()
  }
}

main()
