import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side client — uses service role key, bypasses RLS
// Only used in API routes and server-side code
export const supabase = createClient(supabaseUrl, supabaseServiceKey)

