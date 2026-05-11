type Stat = { label: string; value: number | string; sub?: string }

export default function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, sub }) => (
        <div key={label} className="bg-white border border-neutral-200 rounded-xl px-5 py-4">
          <p className="text-2xl font-semibold text-neutral-900">{value}</p>
          <p className="text-xs text-neutral-500 mt-1">{label}</p>
          {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  )
}
