import type { ReactNode } from 'react'
import Link from 'next/link'

const NAV = [
  {
    section: 'Operations',
    items: [
      { label: 'Overview', href: '/admin', active: true },
      { label: 'Moderation queue', href: null },
      { label: 'Activity log', href: '#activity-log', active: true },
      { label: 'Cost & spend', href: null },
    ],
  },
  {
    section: 'Controls',
    items: [
      { label: 'Allowed scope', href: null },
      { label: 'Rate limits', href: null },
      { label: 'Banned users', href: null },
      { label: 'Kill switch', href: '#kill-switch', active: true },
    ],
  },
  {
    section: 'System',
    items: [
      { label: 'Deploys', href: null },
      { label: 'Agent prompts', href: null },
      { label: 'Settings', href: null },
    ],
  },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[#08080C] font-sans">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-[#14141A] text-white flex flex-col min-h-screen fixed top-0 left-0 h-full">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">the-page</span>
            <span className="text-[10px] font-bold bg-white/10 text-white/60 px-1.5 py-0.5 rounded tracking-widest uppercase">
              OPS
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-2 mb-1">
                {section}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ label, href, active }) =>
                  href && active ? (
                    <li key={label}>
                      <Link
                        href={href}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {label}
                      </Link>
                    </li>
                  ) : (
                    <li key={label}>
                      <span className="flex items-center gap-2 px-2 py-1.5 text-sm text-white/25 cursor-default select-none">
                        {label}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[10px] text-white/25">v1 · owner only</p>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-60 flex-1 min-h-screen px-10 py-8">
        {children}
      </main>
    </div>
  )
}
