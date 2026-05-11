'use client'

import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const GitHubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

export default function CommentPopover({
  editId,
  onClose,
  position,
}: {
  editId: string
  onClose: () => void
  position: { top: number; right: number }
}) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const { data: session } = useSession()
  const user = session?.user as { name?: string; image?: string; login?: string } | undefined

  const submit = async () => {
    if (!text.trim() || status === 'submitting') return
    setStatus('submitting')
    try {
      const res = await fetch('/api/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edit_id: editId, text: text.trim() }),
      })
      if (res.status === 429) {
        setStatus('error')
        return
      }
      if (!res.ok) throw new Error()
      setStatus('success')
      setTimeout(onClose, 1200)
    } catch {
      setStatus('error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      className="absolute z-50 w-96 bg-white border border-neutral-200 rounded-xl shadow-lg p-3"
      style={{ top: position.top, right: position.right }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header row — two independent halves, each capped so neither pushes the other off */}
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-neutral-100 min-w-0">
        <div className="flex items-center gap-2 text-xs text-neutral-400 min-w-0 flex-1">
          <span className="bg-[var(--accent)]/10 text-[var(--accent)] font-mono px-2 py-0.5 rounded shrink-0">
            {editId}
          </span>
          <span className="truncate">suggestion will be moderated</span>
        </div>
        {user ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="text-xs text-neutral-500 font-medium max-w-[80px] truncate">
              {user.login ?? user.name}
            </span>
            <button
              onClick={() => signOut()}
              className="text-[10px] text-neutral-400 hover:text-neutral-600 shrink-0"
            >
              · sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('github')}
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 border border-neutral-200 rounded-lg px-2 py-1 hover:bg-neutral-50 transition-colors shrink-0"
          >
            <GitHubIcon />
            Sign in
          </button>
        )}
      </div>

      {!user && (
        <p className="text-[11px] text-neutral-400 mb-2">
          Sign in for 20 suggestions/hr · anonymous limit is {process.env.NEXT_PUBLIC_ANON_RATE_LIMIT ?? '3'}/hr
        </p>
      )}

      {status === 'success' ? (
        <p className="text-sm text-green-600 py-4 text-center">
          Suggestion submitted ✓
        </p>
      ) : (
        <>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What should change? e.g. 'make this punchier' or 'try a deeper color'"
            className="w-full min-h-[72px] text-sm text-neutral-800 placeholder:text-neutral-400 border border-neutral-200 rounded-lg p-2.5 resize-none outline-none bg-neutral-50 focus:border-[var(--accent)] focus:bg-white"
          />
          {status === 'error' && (
            <p className="text-xs text-red-500 mt-1">
              Could not submit — you may have hit the rate limit.
            </p>
          )}
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-neutral-400">Enter · Esc to cancel</span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!text.trim() || status === 'submitting'}
                className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-40 hover:opacity-90 whitespace-nowrap min-w-[80px] text-center"
              >
                {status === 'submitting' ? '…' : 'Suggest →'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
