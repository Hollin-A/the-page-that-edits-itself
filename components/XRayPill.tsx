'use client'

import { useXRay } from './XRayProvider'

export default function XRayPill() {
  const { active, toggle } = useXRay()

  return (
    <button
      onClick={toggle}
      title="Toggle X-Ray mode (⌘.)"
      className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-full text-xs font-semibold shadow-lg transition-all select-none ${
        active
          ? 'bg-[#14141A] text-white'
          : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700'
      }`}
    >
      {active ? 'Exit X-Ray' : '⌘· X-Ray'}
    </button>
  )
}
