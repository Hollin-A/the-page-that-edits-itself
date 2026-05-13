import type { QuoteSection } from '@/lib/schemas'

export default function QuoteSection({ text, attribution }: QuoteSection) {
  return (
    <figure className="pl-5" style={{ borderLeft: '2px solid var(--accent)' }}>
      <blockquote className="text-[17px] text-white/50 italic leading-relaxed mb-2">
        &ldquo;{text}&rdquo;
      </blockquote>
      <figcaption className="text-xs text-white/25 font-mono">— {attribution}</figcaption>
    </figure>
  )
}
