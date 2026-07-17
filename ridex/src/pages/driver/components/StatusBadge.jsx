// ─────────────────────────────────────────────
// Status badge — semantic colors
// ─────────────────────────────────────────────
export default function StatusBadge({ online }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
      ${online
        ? 'bg-green-500/15 border-green-500/30 text-green-400'
        : 'bg-red-500/15   border-red-500/30   text-red-400'
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
