import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'

// Vercel signs the raw request body with HMAC-SHA1 using the webhook secret.
// The signature is sent in the x-vercel-signature header as a hex string.
// We use timingSafeEqual to prevent timing attacks.
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    // Buffers differ in length — definitely not equal
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.VERCEL_WEBHOOK_SECRET
  if (!secret) {
    console.error('[deploy-webhook] VERCEL_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // Read raw body before parsing — signature is over the raw bytes
  const rawBody = await req.text()

  const signature = req.headers.get('x-vercel-signature') ?? ''
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: { type?: string } = {}
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only act on successful deployments — ignore created, error, canceled, etc.
  if (payload.type !== 'deployment.succeeded') {
    return NextResponse.json({ ok: true, skipped: true, type: payload.type })
  }

  // Move every merged comment to deployed.
  // A successful deployment means all previously merged patches are now live.
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
