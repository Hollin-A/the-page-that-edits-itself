import type { BulletListSection } from '@/lib/schemas'

export default function BulletListSection({ items }: BulletListSection) {
  return (
    <ul className="space-y-3 list-none">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-4">
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-[9px]"
            style={{ background: 'var(--accent)' }}
          />
          <span className="text-[15px] text-white/55 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  )
}
