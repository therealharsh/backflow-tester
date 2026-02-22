import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client (for client components if needed later)
let browserClient: SupabaseClient | null = null
export function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}

// Server client (for Server Components — uses anon key, reads public data)
// cache: 'no-store' prevents Next.js from caching Supabase fetch responses
export function createServerClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  })
}

export const PER_PAGE = 50

/** Display label → actual slice count (multiples of 3 for the grid) */
export const PER_PAGE_OPTIONS: Record<number, number> = { 12: 12, 25: 24, 50: 48 }
