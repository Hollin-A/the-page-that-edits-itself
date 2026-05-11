'use client'

import { useXRay } from './XRayProvider'
import type { Comment } from '@/lib/schemas'

const STATUS_LABEL: Record<Comment['status'], string> = {
  queued: 'Queued',
  moderating: 'Moderating',
  generating: 'Generating',
  merged: 'Merged — deploying',
  rejected: 'Rejected',
  failed: 'Failed',
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  queued: 'text-neutral-400',
  moderating: 'text-yellow-500',
  generating: 'text-blue-500',
  merged: 'text-green-500',
  rejected: 'text-red-400',
  failed: 'text-orange-500',
}

const STATUS_DOT: Record<Comment['status'], string> = {
  queued: 'bg-neutral-300',
  moderating: 'bg-yellow-400',
  generating: 'bg-blue-400 animate-pulse',
  merged: 'bg-green-400 animate-pulse',
  rejected: 'bg-red-400',
  failed: 'bg-orange-400',
}

export default function ActivityFeed() {
  const { comments, activate } = useXRay()
  const visible = comments.slice(0, 10)

  if (visible.length === 0) return null

  return (
    <div className="mt-20 border-t border-neutral-200 pt-10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-6">
        Live activity
      </h2>
      <ol className="space-y-4">
        {visible.map((c) => (
          <li
            key={c.id}
            onClick={() => activate(c.edit_id)}
            className="flex gap-3 text-sm cursor-pointer rounded-lg p-2 -mx-2 hover:bg-neutral-50 transition-colors"
          >
            <div className="mt-1.5 shrink-0">
              <span className={`block w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-neutral-400">{c.edit_id}</span>
                {c.resolved_edit_id && c.resolved_edit_id !== c.edit_id && (
                  <span className="font-mono text-xs text-neutral-400">→ {c.resolved_edit_id}</span>
                )}
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
              <p className="text-neutral-600 truncate">{c.text}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {c.user_id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://avatars.githubusercontent.com/u/${c.user_id}?s=16&v=4`}
                    alt=""
                    className="w-4 h-4 rounded-full"
                  />
                )}
                <span className="text-[11px] text-neutral-400">
                  {c.user_name ? `github:${c.user_name}` : 'anonymous'}
                </span>
              </div>
              {c.reasoning && (
                <p className="text-xs text-neutral-400 mt-0.5 italic">{c.reasoning}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
