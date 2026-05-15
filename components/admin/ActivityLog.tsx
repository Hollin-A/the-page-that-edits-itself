'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { approveComment, rejectHeldComment } from '@/app/admin/actions'
import type { Comment } from '@/lib/schemas'

type Filter = 'all' | 'active' | 'held' | 'merged' | 'rejected'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'held', label: 'Held' },
  { key: 'merged', label: 'Merged' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_DOT: Record<Comment['status'], string> = {
  queued:     'bg-white/20',
  moderating: 'bg-amber-400 animate-pulse',
  generating: 'bg-[var(--accent)] animate-pulse',
  held:       'bg-purple-400',
  merged:     'bg-green-400',
  deployed:   'bg-teal-400',
  rejected:   'bg-red-400',
  failed:     'bg-orange-400',
}

const STATUS_LABEL: Record<Comment['status'], string> = {
  queued:     'Queued',
  moderating: 'Moderating',
  generating: 'Generating',
  held:       'Held',
  merged:     'Merged',
  deployed:   'Deployed',
  rejected:   'Rejected',
  failed:     'Failed',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function matchesFilter(c: Comment, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return ['queued', 'moderating', 'generating'].includes(c.status)
  if (filter === 'held') return c.status === 'held'
  if (filter === 'merged') return ['merged', 'deployed'].includes(c.status)
  if (filter === 'rejected') return ['rejected', 'failed'].includes(c.status)
  return true
}

function PatchPreview({ patch }: { patch: Comment['patch'] }) {
  if (!patch) return <span className="text-white/25">—</span>
  const p = patch as Record<string, unknown>
  if (Array.isArray(p.sections)) {
    return <span className="text-white/40">{(p.sections as unknown[]).length} sections</span>
  }
  if (p.accent) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border border-white/20 inline-block" style={{ background: String(p.accent) }} />
        <span className="text-white/40 font-mono text-[11px]">{String(p.accent)}</span>
      </span>
    )
  }
  return <span className="text-white/25 font-mono text-[11px]">patch</span>
}

function HeldActions({ commentId }: { commentId: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => startTransition(() => approveComment(commentId))}
        className="text-[11px] px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => startTransition(() => rejectHeldComment(commentId))}
        className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.08] text-white/60 hover:bg-white/[0.12] disabled:opacity-40 transition-colors"
      >
        Reject
      </button>
    </div>
  )
}

export default function ActivityLog({ initial }: { initial: Comment[] }) {
  const [comments, setComments] = useState<Comment[]>(initial)
  const [filter, setFilter] = useState<Filter>('all')
  const supabase = useRef(supabaseBrowser)

  useEffect(() => {
    const client = supabase.current
    const channel = client
      .channel('admin-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        const updated = payload.new as Comment
        setComments((prev) => {
          const idx = prev.findIndex((c) => c.id === updated.id)
          if (idx !== -1) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return [updated, ...prev]
        })
      })
      .subscribe()
    return () => { client.removeChannel(channel) }
  }, [])

  const visible = comments.filter((c) => matchesFilter(c, filter))

  return (
    <div id="activity-log" className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h2 className="text-sm font-semibold text-white/85">Activity log</h2>
        <div className="flex items-center gap-1 bg-white/[0.05] rounded-lg p-1">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${
                filter === key
                  ? 'bg-white/[0.10] text-white/85 font-medium'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <p className="text-xs text-white/30 italic text-center py-10">No entries.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left px-6 py-2.5 text-white/35 font-medium">Target</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">Suggestion</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">By</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">When</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">Patch</th>
                <th className="text-left px-4 py-2.5 text-white/35 font-medium">PR / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {visible.map((c) => (
                <tr key={c.id} className={`transition-colors ${c.status === 'held' ? 'bg-purple-400/[0.05] hover:bg-purple-400/[0.08]' : 'hover:bg-white/[0.03]'}`}>
                  <td className="px-6 py-3">
                    <span className="font-mono bg-white/[0.06] text-white/50 px-1.5 py-0.5 rounded">
                      {c.resolved_edit_id ?? c.edit_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="truncate text-white/70">{c.text}</p>
                    {c.reasoning && (
                      <p className="truncate text-white/35 italic mt-0.5">{c.reasoning}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[c.status]}`} />
                      <span className="text-white/55">{STATUS_LABEL[c.status]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/45">
                    {c.user_name ? (
                      <div className="flex items-center gap-1.5">
                        {c.user_id && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://avatars.githubusercontent.com/u/${c.user_id}?s=16&v=4`}
                            alt=""
                            className="w-4 h-4 rounded-full"
                          />
                        )}
                        <span>{c.user_name}</span>
                      </div>
                    ) : (
                      <span className="text-white/25">anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/30 whitespace-nowrap">
                    {relativeTime(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <PatchPreview patch={c.patch} />
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'held' ? (
                      <HeldActions commentId={c.id} />
                    ) : c.pr_url ? (
                      <a
                        href={c.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline whitespace-nowrap"
                      >
                        PR →
                      </a>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
