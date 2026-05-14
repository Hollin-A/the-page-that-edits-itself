'use client'

import { useXRay } from './XRayProvider'
import type { Comment } from '@/lib/schemas'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function layerTag(editId: string): 'content' | 'theme' | 'override' {
  if (editId.startsWith('theme.')) return 'theme'
  if (editId.startsWith('override.')) return 'override'
  return 'content'
}

const LAYER_COLOR = {
  content: 'bg-blue-50 text-blue-600',
  theme: 'bg-purple-50 text-purple-600',
  override: 'bg-amber-50 text-amber-600',
}

const STATUS_BADGE: Record<Comment['status'], string> = {
  queued: '·',
  moderating: '…',
  generating: '…',
  held: '⏸',
  merged: '✓',
  deployed: '✦',
  rejected: '×',
  failed: '!',
}

const STATUS_BADGE_COLOR: Record<Comment['status'], string> = {
  queued: 'bg-neutral-100 text-neutral-400',
  moderating: 'bg-yellow-50 text-yellow-500',
  generating: 'bg-blue-50 text-blue-500',
  held: 'bg-purple-50 text-purple-600',
  merged: 'bg-green-50 text-green-600',
  deployed: 'bg-teal-50 text-teal-600',
  rejected: 'bg-red-100 text-red-600',
  failed: 'bg-orange-100 text-orange-600',
}

const STATUS_LABEL: Partial<Record<Comment['status'], string>> = {
  deployed: 'Live',
  rejected: 'Rejected',
  failed: 'Failed',
}

const ROW_BORDER: Partial<Record<Comment['status'], string>> = {
  deployed: 'border-l-2 border-l-teal-400',
  rejected: 'border-l-2 border-l-red-400',
  failed: 'border-l-2 border-l-orange-400',
}

export default function ActivityPanel() {
  const { comments, closePanel } = useXRay()

  const inQueue = comments.filter((c) =>
    ['queued', 'moderating', 'generating'].includes(c.status)
  ).length

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const appliedToday = comments.filter(
    (c) => ['merged', 'deployed'].includes(c.status) && new Date(c.updated_at) >= todayStart
  ).length

  const moderated = comments.filter((c) => ['merged', 'deployed', 'rejected'].includes(c.status))
  const passRate =
    moderated.length > 0
      ? Math.round((moderated.filter((c) => ['merged', 'deployed'].includes(c.status)).length / moderated.length) * 100)
      : null

  return (
    <div className="fixed bottom-20 right-6 z-50 w-[420px] max-h-[70vh] bg-white border border-neutral-200 rounded-2xl shadow-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${inQueue > 0 ? 'bg-green-400 animate-pulse' : 'bg-neutral-300'}`} />
          <span className="text-sm font-semibold text-neutral-800">Live activity</span>
        </div>
        <button
          onClick={closePanel}
          className="text-neutral-400 hover:text-neutral-700 text-lg leading-none"
          aria-label="Close activity panel"
        >
          ×
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-2.5 border-b border-neutral-100 bg-neutral-50 shrink-0">
        <div>
          <p className="text-sm font-semibold text-neutral-800">{inQueue}</p>
          <p className="text-[10px] text-neutral-400 uppercase tracking-wider">in queue</p>
        </div>
        <div className="w-px h-6 bg-neutral-200" />
        <div>
          <p className="text-sm font-semibold text-neutral-800">{appliedToday}</p>
          <p className="text-[10px] text-neutral-400 uppercase tracking-wider">applied today</p>
        </div>
        <div className="w-px h-6 bg-neutral-200" />
        <div>
          <p className="text-sm font-semibold text-neutral-800">{passRate !== null ? `${passRate}%` : '—'}</p>
          <p className="text-[10px] text-neutral-400 uppercase tracking-wider">pass rate</p>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">No activity yet.</p>
        ) : (
          <ol className="divide-y divide-neutral-50">
            {comments.map((c) => {
              const layer = layerTag(c.edit_id)
              const target = c.resolved_edit_id ?? c.edit_id
              return (
                <li key={c.id} className={`px-4 py-3 flex gap-3 ${ROW_BORDER[c.status] ?? ''}`}>
                  <div className="mt-0.5 shrink-0">
                    <span
                      className={`flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${STATUS_BADGE_COLOR[c.status]}`}
                    >
                      {STATUS_BADGE[c.status]}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-mono text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded shrink-0">
                        {target}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${LAYER_COLOR[layer]}`}>
                        {layer}
                      </span>
                      {STATUS_LABEL[c.status] && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE_COLOR[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      )}
                      {c.pr_url && (
                        <a
                          href={c.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--accent)] hover:underline"
                        >
                          PR →
                        </a>
                      )}
                      <span className="text-[10px] text-neutral-400 ml-auto shrink-0">
                        {relativeTime(c.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-700 truncate">{c.text}</p>
                    {c.reasoning && (
                      <p className="text-[11px] text-neutral-400 italic border-l-2 border-neutral-200 pl-2 mt-1 line-clamp-2">
                        {c.reasoning}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {c.user_id && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://avatars.githubusercontent.com/u/${c.user_id}?s=16&v=4`}
                          alt=""
                          className="w-3.5 h-3.5 rounded-full"
                        />
                      )}
                      <span className="text-[10px] text-neutral-400">
                        {c.user_name ? `github:${c.user_name}` : 'anonymous'}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
