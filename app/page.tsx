import { readFileSync } from 'fs'
import { join } from 'path'
import EditableElement from '@/components/EditableElement'
import { SECTION_RENDERERS } from '@/components/sections/registry'
import type { ThemeTokens, SectionsFile, ThreeJsSceneSection } from '@/lib/schemas'

export const revalidate = 60

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as T
}

export default function Page() {
  const { sections } = readJson<SectionsFile>('content/sections.json')
  const tokens = readJson<ThemeTokens>('theme/tokens.json')

  const visible = sections.filter(s => s.visible)

  // Hoist the first h1 + its immediately following paragraph into the hero zone.
  // Everything else falls into the body column.
  const firstSection = visible[0]
  const isHeroHeading = firstSection?.type === 'heading' && firstSection.level === 1
  const secondSection = visible[1]
  const isHeroParagraph = isHeroHeading && secondSection?.type === 'paragraph'

  const thirdSection = visible[2]
  const isHeroScene = isHeroParagraph && thirdSection?.type === 'threejs-scene'

  const heroHeading = isHeroHeading ? firstSection : null
  const heroParagraph = isHeroParagraph ? secondSection : null
  const heroScene = isHeroScene ? (thirdSection as ThreeJsSceneSection) : null
  const heroCount = isHeroHeading ? (isHeroParagraph ? (isHeroScene ? 3 : 2) : 1) : 0
  const bodySections = visible.slice(heroCount)

  return (
    <>
      <style>{`:root { --accent: ${tokens.accent}; }`}</style>

      {/* Background glow orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-[140px] opacity-[0.11]"
          style={{ background: tokens.accent }}
        />
        <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full blur-[100px] opacity-[0.06] bg-violet-500" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-[0.04] bg-cyan-500" />
      </div>

      <div className="relative min-h-screen flex flex-col">

        {/* ── Nav ── */}
        <header className="w-full px-8 py-4 flex items-center justify-between border-b border-white/[0.06]">
          <span className="text-xs font-mono text-white/30 tracking-widest uppercase">
            agent / edit
          </span>
          <EditableElement editId="theme.accent" tag="div" className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: tokens.accent, boxShadow: `0 0 10px ${tokens.accent}80` }}
            />
            <span className="text-xs text-white/25 font-mono">{tokens.accent}</span>
          </EditableElement>
        </header>

        {/* ── Hero ── */}
        {heroHeading && (
          <section className="w-full px-6 sm:px-12 pt-28 pb-24 border-b border-white/[0.06] flex flex-col items-center text-center">
            <EditableElement editId={`section.${heroHeading.id}`} tag="div" className="w-full max-w-4xl">
              <h1 className="text-5xl sm:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-white leading-[1.08] mb-6">
                {heroHeading.text}
              </h1>
            </EditableElement>

            {heroParagraph && (
              <EditableElement editId={`section.${heroParagraph.id}`} tag="div" className="max-w-xl">
                <p className="text-lg sm:text-xl text-white/45 leading-relaxed">
                  {heroParagraph.text}
                </p>
              </EditableElement>
            )}

            {/* Suggest hint */}
            <p className="mt-10 text-xs text-white/20 font-mono">
              hover any element to suggest a change
            </p>
          </section>
        )}

        {/* ── Hero scene ── full-width Three.js visual zone */}
        {heroScene && (() => {
          const SceneRenderer = SECTION_RENDERERS['threejs-scene']
          return (
            <EditableElement
              editId={`section.${heroScene.id}`}
              tag="div"
              className="w-full border-b border-white/[0.06]"
              style={{ height: `${heroScene.height ?? 420}px` }}
            >
              <SceneRenderer {...heroScene} />
            </EditableElement>
          )
        })()}

        {/* ── Body ── */}
        <main className="flex-1 w-full max-w-2xl mx-auto px-6 sm:px-8 py-20 space-y-12">
          {bodySections.map(section => {
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
        </main>

      </div>
    </>
  )
}
