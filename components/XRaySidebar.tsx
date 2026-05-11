'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useXRay } from './XRayProvider'
import type { Comment } from '@/lib/schemas'

const STATUS_LABEL: Record<Comment['status'], string> = {
  queued: 'Queued',
  moderating: 'Moderating',
  generating: 'Generating',
  merged: 'Merged',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  queued: 'text-neutral-400',
  moderating: 'text-yellow-500',
  generating: 'text-blue-500',
  merged: 'text-green-500',
  rejected: 'text-red-400',
}

const STATUS_DOT: Record<Comment['status'], string> = {
  queued: 'bg-neutral-300',
  moderating: 'bg-yellow-400',
  generating: 'bg-blue-400 animate-pulse',
  merged: 'bg-green-400',
  rejected: 'bg-red-400',
}

export default function XRaySidebar() {
  const { active, focusedId, comments, activate, deactivate } = useXRay()
  const sidebarRef = useRef<HTMLDivElement>(null)

  if (!active) return null

  const sidebar = (
    <div
      ref={sidebarRef}
      className="fixed top-0 right-0 h-full w-80 bg-white border-l border-neutral-200 shadow-xl z-40 flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          X-Ray
        </span>
        <button
          onClick={deactivate}
          className="text-neutral-400 hover:text-neutral-700 text-lg leading-none"
          aria-label="Close X-Ray"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {comments.length === 0 ? (
          <p className="text-xs text-neutral-400 italic">No activity yet.</p>
        ) : (
          <ol className="space-y-4">
            {comments.map((c) => (
              <li
                key={c.id}
                onClick={() => activate(c.edit_id)}
                className={`flex gap-3 text-sm cursor-pointer rounded-lg p-2 -mx-2 transition-colors ${
                  focusedId === c.edit_id
                    ? 'bg-neutral-100'
                    : 'hover:bg-neutral-50'
                }`}
              >
                <div className="mt-1.5 shrink-0">
                  <span className={`block w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-neutral-400">{c.edit_id}</span>
                    <span className={`text-xs font-medium ${STATUS_COLOR[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.pr_url && (
                      <a
                        href={c.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        PR →
                      </a>
                    )}
                  </div>
                  <p className="text-neutral-600 text-xs truncate">{c.text}</p>
                  {c.reasoning && (
                    <p className="text-xs text-neutral-400 mt-0.5 italic">{c.reasoning}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="px-5 py-3 border-t border-neutral-100">
        <p className="text-xs text-neutral-400">Esc or ⌘. to close</p>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sidebar, document.body)
}
