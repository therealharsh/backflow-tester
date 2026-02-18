import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** Service-role client — bypasses RLS. Only use server-side. */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Verify the request bears a valid Supabase access token for an allowed admin email. */
export async function verifyAdmin(
  request: Request,
): Promise<{ email: string } | null> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user?.email) return null
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) return null

  return { email: user.email }
}
