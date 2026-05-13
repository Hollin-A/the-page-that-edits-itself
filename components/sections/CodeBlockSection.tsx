import type { CodeBlockSection } from '@/lib/schemas'

export default function CodeBlockSection({ language, code }: CodeBlockSection) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-mono text-white/25">{language}</span>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
        </div>
      </div>
      <pre className="px-5 py-4 overflow-x-auto">
        <code className="text-sm font-mono text-white/70 leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}
