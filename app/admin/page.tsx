import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import StatsGrid from '@/components/admin/StatsGrid'
import ActivityLog from '@/components/admin/ActivityLog'
import KillSwitch from '@/components/admin/KillSwitch'
import type { Comment } from '@/lib/schemas'

export const revalidate = 0

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.email || session.user.email !== process.env.ADMIN_EMAIL) {
    redirect('/')
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [
    { count: suggestionsToday },
    { count: appliedToday },
    { count: rejectedToday },
    { count: inPipeline },
    { data: allComments },
    { data: killSwitchRow },
  ] = await Promise.all([
    supabase.from('comments').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('status', 'merged').gte('updated_at', todayIso),
    supabase.from('comments').select('*', { count: 'exact', head: true }).in('status', ['rejected', 'failed']).gte('updated_at', todayIso),
    supabase.from('comments').select('*', { count: 'exact', head: true }).in('status', ['queued', 'moderating', 'generating']),
    supabase.from('comments').select('*').order('created_at', { ascending: false }),
    supabase.from('settings').select('value').eq('key', 'kill_switch').single(),
  ])

  const killSwitchActive = killSwitchRow?.value === 'true'

  const stats = [
    { label: 'Suggestions today', value: suggestionsToday ?? 0 },
    { label: 'Applied today', value: appliedToday ?? 0 },
    { label: 'Rejected today', value: rejectedToday ?? 0 },
    { label: 'In pipeline', value: inPipeline ?? 0 },
  ]

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Overview</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Signed in as {session.user.email}
        </p>
      </div>

      <StatsGrid stats={stats} />

      <KillSwitch active={killSwitchActive} />

      <ActivityLog initial={(allComments ?? []) as Comment[]} />
    </div>
  )
}
