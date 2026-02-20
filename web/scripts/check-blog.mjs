import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

const { data, error } = await supabase
  .from('blog_posts')
  .select('id, slug, title, status, published_at')

if (error) {
  console.error('Error:', error.message)
} else if (!data || data.length === 0) {
  console.log('No rows returned — RLS is blocking or no published posts exist')
} else {
  console.log(`Found ${data.length} post(s):`)
  data.forEach((p) => console.log(`  [${p.status}] ${p.title} (slug: ${p.slug})`))
}
