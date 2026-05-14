'use client'

import { usePathname } from 'next/navigation'
import { useXRay } from './XRayProvider'

export default function XRayPill() {
  const { active, toggle, comments, panelOpen, openPanel, closePanel } = useXRay()
  const pathname = usePathname()

  if (pathname.startsWith('/admin')) return null

  const inQueue = comments.filter((c) =>
    ['queued', 'moderating', 'generating'].includes(c.status)
  ).length

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      {/* Activity pill — hidden while X-ray is active */}
      {!active && (
        <button
          onClick={panelOpen ? closePanel : openPanel}
          className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs shadow-lg transition-all select-none border ${
            panelOpen
              ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
              : 'bg-[#0e0e14] border-white/[0.10] text-white/50 hover:border-[var(--accent)]/30 hover:text-white/70'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              inQueue > 0
                ? 'bg-[var(--accent)] animate-pulse'
                : panelOpen
                ? 'bg-[var(--accent)]/60'
                : 'bg-white/20'
            }`}
          />
          {inQueue > 0 ? (
            <span>
              <strong className="text-[var(--accent)]">{inQueue}</strong> in pipeline
            </span>
          ) : (
            <span>Activity</span>
          )}
        </button>
      )}

      {/* X-ray button — always visible */}
      <button
        onClick={toggle}
        title="Toggle X-Ray mode (⌘.)"
        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-lg transition-all select-none border ${
          active
            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
            : 'bg-[#0e0e14] border-white/[0.10] text-white/50 hover:border-[var(--accent)]/30 hover:text-white/70'
        }`}
      >
        {active ? 'Exit X-Ray' : '⌘· X-Ray'}
      </button>
    </div>
  )
}
