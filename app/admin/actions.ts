'use server'

import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'

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
}
