import type { OrderedListSection } from '@/lib/schemas'

export default function OrderedListSection({ items }: OrderedListSection) {
  return (
    <ol className="space-y-3 list-none">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-4">
          <span
            className="flex-shrink-0 w-6 h-6 rounded-md text-[11px] font-bold font-mono flex items-center justify-center mt-0.5 text-[#08080C]"
            style={{ background: 'var(--accent)' }}
          >
            {i + 1}
          </span>
          <span className="text-[15px] text-white/55 leading-relaxed pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  )
}
