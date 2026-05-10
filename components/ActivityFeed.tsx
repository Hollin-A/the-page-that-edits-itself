'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import type { Comment } from '@/lib/schemas'

const STATUS_LABEL: Record<Comment['status'], string> = {
  queued: 'Queued',
  moderating: 'Moderating',
  generating: 'Generating',
  deployed: 'Deployed',
  rejected: 'Rejected',
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  queued: 'text-neutral-400',
  moderating: 'text-yellow-500',
  generating: 'text-blue-500',
  deployed: 'text-green-500',
  rejected: 'text-red-400',
}

const STATUS_DOT: Record<Comment['status'], string> = {
  queued: 'bg-neutral-300',
  moderating: 'bg-yellow-400',
  generating: 'bg-blue-400 animate-pulse',
  deployed: 'bg-green-400',
  rejected: 'bg-red-400',
}

export default function ActivityFeed() {
  const [comments, setComments] = useState<Comment[]>([])
  const supabase = useRef(createBrowserClient())

  useEffect(() => {
    const client = supabase.current

    client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setComments(data as Comment[])
      })

    const channel = client
      .channel('comments-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        (payload) => {
          const updated = payload.new as Comment
          setComments((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id)
            if (idx !== -1) {
              const next = [...prev]
              next[idx] = updated
              return next
            }
            return [updated, ...prev].slice(0, 10)
          })
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [])

  if (comments.length === 0) return null

  return (
    <div className="mt-20 border-t border-neutral-200 pt-10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-6">
        Live activity
      </h2>
      <ol className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3 text-sm">
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
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    PR →
                  </a>
                )}
              </div>
              <p className="text-neutral-600 truncate">{c.text}</p>
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
