import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { inngest } from '@/inngest/client'

const SubmitSchema = z.object({
  edit_id: z.string().min(1).max(80),
  text: z.string().min(1).max(500),
})

const RATE_LIMIT = 3
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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const ip_hash = createHash('sha256').update(ip).digest('hex')

  // Rate limit: max 3 submissions per IP per hour
  const { count } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ip_hash)
    .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      edit_id: parsed.data.edit_id,
      text: parsed.data.text,
      ip_hash,
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
