'use client'

import { useState } from 'react'

export default function CommentPopover({
  editId,
  onClose,
}: {
  editId: string
  onClose: () => void
}) {
  const [text, setText] = useState('')

  return (
    <div className="absolute z-50 top-6 right-0 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg p-3">
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-neutral-100 text-xs text-neutral-400">
        <span className="bg-orange-50 text-orange-600 font-mono px-2 py-0.5 rounded">
          {editId}
        </span>
        <span>your suggestion will be moderated</span>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What should change? e.g. 'make this punchier' or 'try a deeper color'"
        className="w-full min-h-[72px] text-sm border border-neutral-200 rounded-lg p-2.5 resize-none outline-none bg-neutral-50 focus:border-orange-400 focus:bg-white"
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-neutral-400">Enter to submit · Esc to cancel</span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            disabled={!text.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white disabled:opacity-40 hover:bg-orange-600"
          >
            Suggest →
          </button>
        </div>
      </div>
    </div>
  )
}
