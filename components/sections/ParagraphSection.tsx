import type { ParagraphSection } from '@/lib/schemas'

export default function ParagraphSection({ text }: ParagraphSection) {
  return (
    <p className="text-[17px] text-white/55 leading-relaxed">
      {text}
    </p>
  )
}
