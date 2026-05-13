import type { LinkBlockSection } from '@/lib/schemas'

export default function LinkBlockSection({ text, href }: LinkBlockSection) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-75"
      style={{ color: 'var(--accent)' }}
    >
      {text}
    </a>
  )
}
