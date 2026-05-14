import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'

// Auth: GitHub Actions sends DEPLOY_HOOK_SECRET as a Bearer token.
// timingSafeEqual prevents timing attacks even on short secrets.
function verifyBearer(header: string, secret: string): boolean {
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    // Buffers differ in length
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.DEPLOY_HOOK_SECRET
  if (!secret) {
    console.error('[deploy-webhook] DEPLOY_HOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') ?? ''
  if (!verifyBearer(auth, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Move every merged comment to deployed.
  // Called after a successful Vercel deployment — all merged patches are now live.
  const { error } = await supabase
    .from('comments')
    .update({ status: 'deployed' })
    .eq('status', 'merged')

  if (error) {
    console.error('[deploy-webhook] Supabase update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[deploy-webhook] Marked merged comments as deployed')
  return NextResponse.json({ ok: true })
}
