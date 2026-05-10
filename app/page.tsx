import EditableElement from '@/components/EditableElement'
import hero from '@/content/hero.json'
import tokens from '@/theme/tokens.json'

export default function Page() {
  return (
    <main
      style={{ '--accent': tokens.accent } as React.CSSProperties}
      className="min-h-screen bg-[#FAFAF7] text-[#14141A] font-sans px-8"
    >
      <div className="max-w-4xl mx-auto pt-24 pb-32">

        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--accent)]">
          Built for agentic workflows
        </div>

        <EditableElement editId="hero.title" tag="h1" className="text-5xl font-bold leading-tight tracking-tight mb-6 max-w-2xl">
          {hero.title}
        </EditableElement>

        <EditableElement editId="hero.subtitle" tag="p" className="text-xl text-neutral-500 leading-relaxed mb-10 max-w-xl">
          {hero.subtitle}
        </EditableElement>

        <EditableElement editId="theme.accent" tag="div" className="inline-flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border border-black/10"
            style={{ background: tokens.accent }}
          />
          <span className="text-sm text-neutral-400 font-mono">{tokens.accent}</span>
        </EditableElement>

      </div>
    </main>
  )
}
