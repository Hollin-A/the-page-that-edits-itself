import type { CalloutSection } from '@/lib/schemas'

const toneStyles = {
  info: {
    wrapper: 'bg-blue-950/40 border-blue-500/20',
    title: 'text-blue-300',
    body: 'text-blue-200/60',
    bar: 'bg-blue-500',
  },
  warn: {
    wrapper: 'bg-amber-950/40 border-amber-500/20',
    title: 'text-amber-300',
    body: 'text-amber-200/60',
    bar: 'bg-amber-500',
  },
  success: {
    wrapper: 'bg-emerald-950/40 border-emerald-500/20',
    title: 'text-emerald-300',
    body: 'text-emerald-200/60',
    bar: 'bg-emerald-500',
  },
} as const

export default function CalloutSection({ tone, title, body }: CalloutSection) {
  const s = toneStyles[tone]
  return (
    <div className={`relative rounded-xl border px-5 py-4 pl-6 ${s.wrapper}`}>
      <div className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full ${s.bar}`} />
      <p className={`font-medium text-sm mb-1 ${s.title}`}>{title}</p>
      <p className={`text-sm leading-relaxed ${s.body}`}>{body}</p>
    </div>
  )
}
