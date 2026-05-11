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
          className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs shadow-lg transition-all select-none ${
            panelOpen
              ? 'bg-[#14141A] text-white'
              : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              inQueue > 0 ? 'bg-green-400 animate-pulse' : panelOpen ? 'bg-neutral-500' : 'bg-neutral-300'
            }`}
          />
          {inQueue > 0 ? (
            <span>
              <strong className={panelOpen ? 'text-white' : 'text-neutral-700'}>{inQueue}</strong> in queue
            </span>
          ) : (
            <span>Live activity</span>
          )}
        </button>
      )}

      {/* X-ray button — always visible */}
      <button
        onClick={toggle}
        title="Toggle X-Ray mode (⌘.)"
        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-lg transition-all select-none ${
          active
            ? 'bg-[#14141A] text-white'
            : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700'
        }`}
      >
        {active ? 'Exit X-Ray' : '⌘· X-Ray'}
      </button>
    </div>
  )
}
