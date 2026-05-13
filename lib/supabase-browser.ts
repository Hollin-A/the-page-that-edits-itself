import { createClient } from '@supabase/supabase-js'

// Singleton — one GoTrueClient instance shared across the entire browser context.
// Never call createClient() more than once per page; multiple instances sharing
// the same localStorage key produce race conditions on session refresh.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
