import { supabase } from '@/lib/supabase'

type Contributor = {
  user_name: string
  user_id: string
}

async function getContributors(): Promise<Contributor[]> {
  const { data } = await supabase
    .from('comments')
    .select('user_name, user_id, created_at')
    .in('status', ['merged', 'deployed'])
    .not('user_name', 'is', null)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: true })

  if (!data) return []

  // Deduplicate by user_name, keeping first contribution order
  const seen = new Set<string>()
  const unique: Contributor[] = []
  for (const row of data) {
    if (!seen.has(row.user_name)) {
      seen.add(row.user_name)
      unique.push({ user_name: row.user_name, user_id: row.user_id })
    }
  }
  return unique
}

export default async function ContributorsSection() {
  const contributors = await getContributors()

  if (contributors.length === 0) return null

  return (
    <section className="w-full border-t border-white/[0.06] mt-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-12">
        <p className="text-xs font-mono text-white/25 tracking-widest uppercase mb-8">
          People who were here
        </p>

        <div className="flex flex-wrap gap-4">
          {contributors.map((c) => (
            <a
              key={c.user_name}
              href={`https://github.com/${c.user_name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://avatars.githubusercontent.com/u/${c.user_id}?v=4&s=64`}
                alt={c.user_name}
                width={32}
                height={32}
                className="rounded-full opacity-70 group-hover:opacity-100 transition-opacity ring-1 ring-white/10 group-hover:ring-[var(--accent)]/40"
              />
              <span className="text-xs font-mono text-white/35 group-hover:text-white/70 transition-colors">
                @{c.user_name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
