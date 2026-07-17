// ─────────────────────────────────────────────
// Section header — consistent across all tabs
// ─────────────────────────────────────────────
export default function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-white font-black text-base leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>}
    </div>
  );
}
