type Stat = { label: string; value: number | string; sub?: string }

export default function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, sub }) => (
        <div key={label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-4">
          <p className="text-2xl font-semibold text-white/85">{value}</p>
          <p className="text-xs text-white/40 mt-1">{label}</p>
          {sub && <p className="text-[11px] text-white/30 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  )
}
