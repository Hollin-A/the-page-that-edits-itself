'use client'

import { useState, useRef, useEffect, ElementType, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import CommentPopover from './CommentPopover'

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
}: {
  editId: string
  tag: ElementType
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })
  const ref = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const Tag = tag

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
      setPopoverPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setOpen((v) => !v)
  }

  return (
    <Tag
      ref={ref}
      data-edit-id={editId}
      className={`group relative ${className ?? ''}`}
    >
      {children}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        aria-label={`Suggest a change to ${editId}`}
        className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-white border border-neutral-300 hidden group-hover:flex items-center justify-center shadow-sm hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] text-neutral-400 transition-colors z-10"
      >
        <ChatIcon />
      </button>
      {open && createPortal(
        <CommentPopover editId={editId} onClose={() => setOpen(false)} position={popoverPos} />,
        document.body
      )}
    </Tag>
  )
}
