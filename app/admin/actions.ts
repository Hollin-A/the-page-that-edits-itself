'use server'

import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { inngest } from '@/inngest/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const session = await auth()
  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    redirect('/')
  }
}

export async function toggleKillSwitch(current: boolean) {
  await assertAdmin()
  await supabase
    .from('settings')
    .update({ value: current ? 'false' : 'true', updated_at: new Date().toISOString() })
    .eq('key', 'kill_switch')
  revalidatePath('/admin')
}

export async function toggleRequireApproval(current: boolean) {
  await assertAdmin()
  await supabase
    .from('settings')
    .update({ value: current ? 'false' : 'true', updated_at: new Date().toISOString() })
    .eq('key', 'require_approval')
  revalidatePath('/admin')
}

// Approve a held comment — re-runs generate-patch against current file state.
// The stored patch is a preview only; the actual commit uses fresh content.
export async function approveComment(commentId: string) {
  await assertAdmin()
  await inngest.send({
    name: 'comment/approved',
    data: { comment_id: commentId },
  })
  revalidatePath('/admin')
}

// Reject a held comment — marks it rejected, no PR opened.
export async function rejectHeldComment(commentId: string) {
  await assertAdmin()
  await supabase
    .from('comments')
    .update({ status: 'rejected', reasoning: 'Rejected by owner.' })
    .eq('id', commentId)
  revalidatePath('/admin')
}
