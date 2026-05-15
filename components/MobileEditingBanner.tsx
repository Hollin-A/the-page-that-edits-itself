export default function MobileEditingBanner() {
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="bg-[#0e0e14]/90 backdrop-blur-sm border border-white/[0.08] rounded-xl px-4 py-3 text-center shadow-xl shadow-black/40">
        <p className="text-xs text-white/50">
          Open on desktop to hover elements and suggest changes
        </p>
      </div>
    </div>
  )
}
