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
  content: 'bg-[var(--accent)]/10 text-[var(--accent)]/70',
  theme:   'bg-purple-500/10 text-purple-400',
  override:'bg-amber-500/10 text-amber-400',
}

// Full label for every status
const STATUS_LABEL: Record<Comment['status'], string> = {
  queued:     'Queued',
  moderating: 'Moderating…',
  generating: 'Generating…',
  held:       'Held for review',
  merged:     'Merged',
  deployed:   'Live',
  rejected:   'Rejected',
  failed:     'Failed',
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  queued:     'bg-white/[0.06] text-white/30',
  moderating: 'bg-amber-500/15 text-amber-400',
  generating: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  held:       'bg-purple-500/15 text-purple-400',
  merged:     'bg-green-500/15 text-green-400',
  deployed:   'bg-teal-500/15 text-teal-400',
  rejected:   'bg-red-500/15 text-red-400',
  failed:     'bg-orange-500/15 text-orange-400',
}

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

const ROW_BORDER: Partial<Record<Comment['status'], string>> = {
  moderating: 'border-l-2 border-l-amber-500/40',
  generating: 'border-l-2 border-l-[var(--accent)]/40',
  held:       'border-l-2 border-l-purple-500/40',
  deployed:   'border-l-2 border-l-teal-500/40',
  rejected:   'border-l-2 border-l-red-500/40',
  failed:     'border-l-2 border-l-orange-500/40',
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
      ? Math.round(
          (moderated.filter((c) => ['merged', 'deployed'].includes(c.status)).length /
            moderated.length) *
            100
        )
      : null

  return (
    <div className="fixed bottom-20 right-6 z-50 w-[420px] max-h-[70vh] bg-[#0e0e14] border border-white/[0.08] rounded-2xl shadow-xl shadow-black/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              inQueue > 0 ? 'bg-[var(--accent)] animate-pulse' : 'bg-white/20'
            }`}
          />
          <span className="text-sm font-semibold text-white/80">Live activity</span>
        </div>
        <button
          onClick={closePanel}
          className="text-white/25 hover:text-white/60 text-lg leading-none transition-colors"
          aria-label="Close activity panel"
        >
          ×
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <div>
          <p className="text-sm font-semibold text-white/80">{inQueue}</p>
          <p className="text-[10px] text-white/25 uppercase tracking-wider">in pipeline</p>
        </div>
        <div className="w-px h-6 bg-white/[0.08]" />
        <div>
          <p className="text-sm font-semibold text-white/80">{appliedToday}</p>
          <p className="text-[10px] text-white/25 uppercase tracking-wider">applied today</p>
        </div>
        <div className="w-px h-6 bg-white/[0.08]" />
        <div>
          <p className="text-sm font-semibold text-white/80">
            {passRate !== null ? `${passRate}%` : '—'}
          </p>
          <p className="text-[10px] text-white/25 uppercase tracking-wider">pass rate</p>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-xs text-white/25 italic text-center py-8">No activity yet.</p>
        ) : (
          <ol className="divide-y divide-white/[0.04]">
            {comments.map((c) => {
              const layer = layerTag(c.edit_id)
              const target = c.resolved_edit_id ?? c.edit_id
              const isInFlight = ['queued', 'moderating', 'generating'].includes(c.status)

              return (
                <li
                  key={c.id}
                  className={`px-4 py-3.5 flex gap-3 ${ROW_BORDER[c.status] ?? ''}`}
                >
                  {/* Status dot */}
                  <div className="mt-1 shrink-0">
                    <span className={`block w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Row 1: status pill + target + layer + time */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOR[c.status]}`}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span className="font-mono text-xs bg-[var(--accent)]/10 text-[var(--accent)] px-1.5 py-0.5 rounded shrink-0">
                        {target}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${LAYER_COLOR[layer]}`}
                      >
                        {layer}
                      </span>
                      <span className="text-[10px] text-white/25 ml-auto shrink-0">
                        {relativeTime(c.created_at)}
                      </span>
                    </div>

                    {/* Row 2: suggestion text */}
                    <p className="text-xs text-white/60 truncate">"{c.text}"</p>

                    {/* Row 3: reasoning — prominent when it exists, especially on rejection/failure */}
                    {c.reasoning && (
                      <p
                        className={`text-[11px] leading-snug pl-2 border-l-2 line-clamp-2 ${
                          c.status === 'rejected' || c.status === 'failed'
                            ? 'text-white/55 border-l-red-500/40'
                            : c.status === 'held'
                            ? 'text-white/55 border-l-purple-500/40'
                            : 'text-white/35 border-l-white/[0.10]'
                        }`}
                      >
                        {c.reasoning}
                      </p>
                    )}

                    {/* Row 4: in-flight pipeline position hint */}
                    {isInFlight && !c.reasoning && (
                      <p className="text-[10px] text-white/25">
                        {c.status === 'queued' && 'Waiting to enter pipeline…'}
                        {c.status === 'moderating' && 'Claude Haiku is reviewing the suggestion…'}
                        {c.status === 'generating' && 'Claude Sonnet is writing the edit…'}
                      </p>
                    )}

                    {/* Row 5: user + PR link */}
                    <div className="flex items-center gap-2">
                      {c.user_id && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://avatars.githubusercontent.com/u/${c.user_id}?s=16&v=4`}
                          alt=""
                          className="w-3.5 h-3.5 rounded-full opacity-60"
                        />
                      )}
                      <span className="text-[10px] text-white/25">
                        {c.user_name ? `@${c.user_name}` : 'anonymous'}
                      </span>
                      {c.pr_url && (
                        <a
                          href={c.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[var(--accent)] hover:underline ml-auto"
                        >
                          View PR →
                        </a>
                      )}
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
