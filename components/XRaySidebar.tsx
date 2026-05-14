'use client'

import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useXRay } from './XRayProvider'
import type { Comment } from '@/lib/schemas'

const ACTIVE_STATUSES = new Set(['queued', 'moderating', 'generating'])

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
  moderating: 'Moderating…',
  generating: 'Generating…',
  held:       'Held',
  merged:     'Merged',
  deployed:   'Live',
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

export default function XRaySidebar() {
  const { active, focusedId, comments, activate, deactivate, openPanel } = useXRay()

  const elements = useMemo(() => {
    const map = new Map<string, { hasActive: boolean; count: number; latestStatus: Comment['status'] }>()
    for (const c of comments) {
      const existing = map.get(c.edit_id)
      if (!existing) {
        map.set(c.edit_id, {
          hasActive: ACTIVE_STATUSES.has(c.status),
          count: 1,
          latestStatus: c.status,
        })
      } else {
        existing.count++
        if (ACTIVE_STATUSES.has(c.status)) existing.hasActive = true
      }
    }
    return Array.from(map.entries()).map(([editId, meta]) => ({ editId, ...meta }))
  }, [comments])

  if (!active) return null

  const sidebar = (
    <div className="fixed top-0 right-0 h-full w-72 bg-[#0e0e14] border-l border-white/[0.08] shadow-xl shadow-black/50 z-40 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/30">
          X-Ray
        </span>
        <button
          onClick={deactivate}
          className="text-white/25 hover:text-white/60 text-lg leading-none transition-colors"
          aria-label="Close X-Ray"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {elements.length === 0 ? (
          <p className="text-xs text-white/25 italic">No editable elements with activity yet.</p>
        ) : (
          <ol className="space-y-1">
            {elements.map(({ editId, hasActive, count, latestStatus }) => {
              const isFocused = focusedId === editId
              const elementComments = comments.filter((c) => c.edit_id === editId)
              const shown = elementComments.slice(0, 3)
              const overflow = elementComments.length - shown.length

              return (
                <li key={editId}>
                  {/* Element row */}
                  <button
                    onClick={() => activate(editId)}
                    className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 transition-colors text-left ${
                      isFocused ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        hasActive ? 'bg-[var(--accent)] animate-pulse' : STATUS_DOT[latestStatus]
                      }`}
                    />
                    <span className="font-mono text-xs text-white/55 flex-1 truncate">
                      {editId}
                    </span>
                    {count > 0 && (
                      <span className="text-[10px] font-semibold bg-white/[0.08] text-white/35 px-1.5 py-0.5 rounded-full shrink-0">
                        {count}
                      </span>
                    )}
                  </button>

                  {/* Inline history — visible when focused */}
                  {isFocused && shown.length > 0 && (
                    <ol className="mt-1 mb-2 ml-5 space-y-1">
                      {shown.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-start gap-2 py-2 px-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                        >
                          <span
                            className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[c.status]}`}
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-[11px] text-white/55 truncate">"{c.text}"</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-white/25">
                                {STATUS_LABEL[c.status]}
                              </span>
                              <span className="text-[10px] text-white/20">
                                {relativeTime(c.created_at)}
                              </span>
                              {c.pr_url && (
                                <a
                                  href={c.pr_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-[var(--accent)] hover:underline ml-auto"
                                >
                                  PR →
                                </a>
                              )}
                            </div>
                            {c.reasoning && (
                              <p className="text-[10px] text-white/30 truncate">{c.reasoning}</p>
                            )}
                          </div>
                        </li>
                      ))}
                      {overflow > 0 && (
                        <li>
                          <button
                            onClick={openPanel}
                            className="text-[10px] text-[var(--accent)] hover:underline pl-2"
                          >
                            +{overflow} more — see all →
                          </button>
                        </li>
                      )}
                    </ol>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <div className="px-5 py-3 border-t border-white/[0.06]">
        <p className="text-xs text-white/20">Esc or ⌘. to close</p>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sidebar, document.body)
}
