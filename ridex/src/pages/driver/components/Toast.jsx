// ─────────────────────────────────────────────
// Toast notification system
// Sits above the bottom tab bar + home indicator; full width on phones,
// right-aligned column on larger screens. Announced to screen readers.
// ─────────────────────────────────────────────
const STYLES = {
  success: 'bg-green-500 text-white',
  error:   'bg-red-500 text-white',
  warning: 'bg-yellow-400 text-black',
  info:    'bg-gray-800 text-white border border-gray-700',
};

export default function ToastContainer({ toasts }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[100] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-semibold shadow-lg break-words ${STYLES[t.type] ?? STYLES.info}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
