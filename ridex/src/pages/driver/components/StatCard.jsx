// ─────────────────────────────────────────────
// KPI stat card — primary accent (earnings) vs neutral
// Values truncate instead of overflowing the card on narrow phones.
// ─────────────────────────────────────────────
export default function StatCard({ label, value, children, sub, accent = false, large = false }) {
  return (
    <div className={`rounded-2xl p-4 flex-1 min-w-0 flex flex-col gap-1 shadow-sm
      ${accent
        ? 'bg-yellow-400/5 border border-yellow-400/25'
        : 'bg-gray-900 border border-gray-800'
      }`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 leading-none">{label}</p>
      {children ?? (
        <p
          title={typeof value === 'string' ? value : undefined}
          className={`font-black leading-tight truncate tabular-nums ${large ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'} ${accent ? 'text-yellow-400' : 'text-white'}`}
        >
          {value}
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 leading-none">{sub}</p>}
    </div>
  );
}
