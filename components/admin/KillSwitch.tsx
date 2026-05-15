'use client'

import { useTransition } from 'react'
import { toggleKillSwitch } from '@/app/admin/actions'

export default function KillSwitch({ active }: { active: boolean }) {
  const [pending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(() => {
      toggleKillSwitch(active)
    })
  }

  return (
    <div id="kill-switch" className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-6 py-5">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-sm font-semibold text-white/85">Kill switch</h2>
          <p className="text-xs text-white/40 mt-1 max-w-sm">
            When on, new comments are stored but the pipeline halts before moderation.
            No API spend is incurred. In-flight comments complete normally.
          </p>
          {active && (
            <p className="text-xs font-medium text-red-400 mt-2">
              ⚠ Pipeline is currently halted. New suggestions will not be processed.
            </p>
          )}
        </div>
        <button
          onClick={handleToggle}
          disabled={pending}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
            active ? 'bg-red-500' : 'bg-white/[0.15]'
          }`}
          aria-label={active ? 'Disable kill switch' : 'Enable kill switch'}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
