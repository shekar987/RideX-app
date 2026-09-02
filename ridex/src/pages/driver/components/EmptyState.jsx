// ─────────────────────────────────────────────
// Empty state component — icon, message, optional hint / CTA
// ─────────────────────────────────────────────
export default function EmptyState({ icon, title, body, hint, cta, onCta }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-gray-600" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-white font-bold text-base">{title}</p>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{body}</p>
      </div>
      {hint && (
        <div className="bg-gray-800/60 rounded-xl px-4 py-2">
          <p className="text-gray-500 text-xs">{hint}</p>
        </div>
      )}
      {cta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-1 px-5 py-3 min-h-[44px] bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl transition"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
