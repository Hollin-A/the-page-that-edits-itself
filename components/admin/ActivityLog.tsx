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
  queued: 'bg-neutral-300',
  moderating: 'bg-yellow-400',
  generating: 'bg-blue-400 animate-pulse',
  held: 'bg-purple-400',
  merged: 'bg-green-400',
  rejected: 'bg-red-400',
  failed: 'bg-orange-400',
}

const STATUS_LABEL: Record<Comment['status'], string> = {
  queued: 'Queued',
  moderating: 'Moderating',
  generating: 'Generating',
  held: 'Held',
  merged: 'Merged',
  rejected: 'Rejected',
  failed: 'Failed',
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
  if (filter === 'merged') return c.status === 'merged'
  if (filter === 'rejected') return ['rejected', 'failed'].includes(c.status)
  return true
}

function PatchPreview({ patch }: { patch: Comment['patch'] }) {
  if (!patch) return <span className="text-neutral-400">—</span>
  const p = patch as Record<string, unknown>
  if (Array.isArray(p.sections)) {
    return <span className="text-neutral-500">{(p.sections as unknown[]).length} sections</span>
  }
  if (p.accent) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full border border-white/20 inline-block" style={{ background: String(p.accent) }} />
        <span className="text-neutral-500 font-mono text-[11px]">{String(p.accent)}</span>
      </span>
    )
  }
  return <span className="text-neutral-400 font-mono text-[11px]">patch</span>
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
        className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-700 text-neutral-200 hover:bg-neutral-600 disabled:opacity-40 transition-colors"
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
    <div id="activity-log" className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <h2 className="text-sm font-semibold text-neutral-900">Activity log</h2>
        <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${
                filter === key
                  ? 'bg-white text-neutral-900 shadow-sm font-medium'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <p className="text-xs text-neutral-400 italic text-center py-10">No entries.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-6 py-2.5 text-neutral-400 font-medium">Target</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">Suggestion</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">By</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">When</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">Patch</th>
                <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">PR / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {visible.map((c) => (
                <tr key={c.id} className={`hover:bg-neutral-50 transition-colors ${c.status === 'held' ? 'bg-purple-50/50' : ''}`}>
                  <td className="px-6 py-3">
                    <span className="font-mono bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                      {c.resolved_edit_id ?? c.edit_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="truncate text-neutral-700">{c.text}</p>
                    {c.reasoning && (
                      <p className="truncate text-neutral-400 italic mt-0.5">{c.reasoning}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[c.status]}`} />
                      <span className="text-neutral-600">{STATUS_LABEL[c.status]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
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
                      <span className="text-neutral-400">anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
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
                        className="text-blue-500 hover:underline whitespace-nowrap"
                      >
                        PR →
                      </a>
                    ) : (
                      <span className="text-neutral-300">—</span>
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
