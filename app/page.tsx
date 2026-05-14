import { readFileSync } from 'fs'
import { join } from 'path'
import EditableElement from '@/components/EditableElement'
import { SECTION_RENDERERS } from '@/components/sections/registry'
import type { ThemeTokens, SectionsFile } from '@/lib/schemas'

export const revalidate = 60

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T
}

export default function Page() {
  const { sections } = readJson<SectionsFile>('content/sections.json')
  const tokens = readJson<ThemeTokens>('theme/tokens.json')

  return (
    <>
      <style>{`:root { --accent: ${tokens.accent}; }`}</style>

      {/* Background glow orbs — fixed, behind everything */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.15]"
          style={{ background: tokens.accent }}
        />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.08] bg-violet-500" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-[0.06] bg-cyan-500" />
      </div>

      <main className="relative min-h-screen px-6 sm:px-8">
        <div className="max-w-2xl mx-auto py-20 sm:py-28 space-y-12">

          {/* Nav bar */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono text-white/30 tracking-widest uppercase">
              agent / edit
            </span>
            {/* Theme accent swatch — editable */}
            <EditableElement editId="theme.accent" tag="div" className="flex items-center gap-2 cursor-pointer">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: tokens.accent, boxShadow: `0 0 8px ${tokens.accent}60` }}
              />
              <span className="text-xs text-white/30 font-mono">{tokens.accent}</span>
            </EditableElement>
          </div>

          {/* Sections loop */}
          {sections
            .filter(s => s.visible)
            .map(section => {
              const Renderer = SECTION_RENDERERS[section.type]
              return (
                <EditableElement
                  key={section.id}
                  editId={`section.${section.id}`}
                  tag="div"
                >
                  <Renderer {...section} />
                </EditableElement>
              )
            })}

        </div>
      </main>
    </>
  )
}
