'use client'

import { useState, useRef, useEffect, ElementType, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import CommentPopover from './CommentPopover'
import { useXRay } from './XRayProvider'

const ChatIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export default function EditableElement({
  editId,
  tag,
  children,
  className,
  style,
}: {
  editId: string
  tag: ElementType
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })
  const ref = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = tag as any
  const { active: xrayActive, focusedId, comments, lockedEditIds, activate } = useXRay()
  const commentCount = comments.filter((c) => c.edit_id === editId).length
  const isFocused = focusedId === editId
  const isLocked = lockedEditIds.has(editId)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPopoverPos({
        top: rect.bottom + window.scrollY + 8,
        right: Math.max(8, window.innerWidth - rect.right - window.scrollX),
      })
    }
    setOpen((v) => !v)
  }

  return (
    <Tag
      ref={ref}
      data-edit-id={editId}
      className={`group relative ${className ?? ''} ${
        xrayActive
          ? `outline outline-2 rounded-sm transition-all ${
              isFocused
                ? 'outline-[var(--accent)] bg-[var(--accent)]/5'
                : 'outline-neutral-300 hover:outline-neutral-400'
            }`
          : ''
      }`}
      style={style}
    >
      {children}

      {/* X-ray label overlay — must be span so it's valid inside <p> */}
      {xrayActive && (
        <span
          onClick={() => activate(editId)}
          className="absolute -top-5 left-0 flex items-center gap-1.5 cursor-pointer"
        >
          <span className="text-[10px] font-mono font-medium bg-[#14141A] text-white px-1.5 py-0.5 rounded select-none">
            {editId}
          </span>
          {commentCount > 0 && (
            <span className="text-[10px] font-semibold bg-[var(--accent)] text-white px-1.5 py-0.5 rounded-full select-none">
              {commentCount}
            </span>
          )}
        </span>
      )}

      {/* Lock indicator — shown when element is being processed */}
      {!xrayActive && isLocked && (
        <span className="absolute -top-3 -right-3 hidden group-hover:flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full pl-1.5 pr-2.5 py-0.5 z-10 whitespace-nowrap shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-[10px] font-medium">Updating…</span>
        </span>
      )}

      {/* Comment icon — hidden in x-ray mode and when locked */}
      {!xrayActive && !isLocked && (
        <button
          ref={buttonRef}
          onClick={handleOpen}
          aria-label={`Suggest a change to ${editId}`}
          className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-white border border-neutral-300 hidden group-hover:flex items-center justify-center shadow-sm hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] text-neutral-400 transition-colors z-10"
        >
          <ChatIcon />
        </button>
      )}

      {open && createPortal(
        <CommentPopover editId={editId} onClose={() => setOpen(false)} position={popoverPos} />,
        document.body
      )}
    </Tag>
  )
}
