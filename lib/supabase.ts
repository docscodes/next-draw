import { createClient } from "@supabase/supabase-js"
import { cache } from "react"

/**
 * Server-side Supabase client. Prefers the service role key so private
 * buckets can be listed, and falls back to the anon key (which needs a
 * `select` policy on `storage.objects` for the bucket).
 */
export const getSupabase = cache(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})
