import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { inngest } from '@/inngest/client'
import { auth } from '@/auth'

const SubmitSchema = z.object({
  edit_id: z.string().min(1).max(80),
  text: z.string().min(1).max(500),
  website: z.string().optional(), // honeypot — must be empty
})

const ANON_RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_HOUR ?? '3', 10)
const AUTHED_RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Honeypot — legitimate users never fill this field.
  // Return 200 so bots don't know they were rejected.
  if (parsed.data.website) {
    return NextResponse.json({ id: 'ok' }, { status: 200 })
  }

  const session = await auth()
  const sessionUser = session?.user as { login?: string; githubId?: string } | undefined
  const isAuthed = !!sessionUser?.githubId

  // Require GitHub sign-in. ALLOW_ANONYMOUS=true bypasses this for local dev.
  if (!isAuthed && process.env.ALLOW_ANONYMOUS !== 'true') {
    return NextResponse.json(
      { error: 'Sign in with GitHub to submit suggestions.' },
      { status: 401 }
    )
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const ip_hash = createHash('sha256').update(ip).digest('hex')

  // Authenticated users get 20/hr; anonymous users get RATE_LIMIT_PER_HOUR (default 3/hr).
  // Rate limiting is skipped in development.
  if (process.env.NODE_ENV !== 'development') {
    const rateLimit = isAuthed ? AUTHED_RATE_LIMIT : ANON_RATE_LIMIT
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ip_hash)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())

    if ((count ?? 0) >= rateLimit) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
  }

  // Lock check: reject if an active comment exists for this element updated within the last 30 minutes.
  // The timeout prevents stale locks from pipeline failures that didn't trigger onFailure.
  const LOCK_WINDOW_MS = 30 * 60 * 1000
  const { count: activeCount } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('edit_id', parsed.data.edit_id)
    .in('status', ['queued', 'moderating', 'generating'])
    .gte('updated_at', new Date(Date.now() - LOCK_WINDOW_MS).toISOString())

  if ((activeCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This element is currently being updated. Try again shortly.' },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      edit_id: parsed.data.edit_id,
      text: parsed.data.text,
      ip_hash,
      user_id: sessionUser?.githubId ?? null,
      user_name: sessionUser?.login ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[comment/submit] Supabase insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await inngest.send({
      name: 'comment/submitted',
      data: { comment_id: data.id },
    })
  } catch (err) {
    console.error('[comment/submit] Inngest send error:', err)
    // Comment is persisted — don't fail the request over a queue error
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
