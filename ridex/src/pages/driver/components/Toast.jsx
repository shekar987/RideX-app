// ─────────────────────────────────────────────
// Toast notification system
// ─────────────────────────────────────────────
export default function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300
            ${t.type === 'success' ? 'bg-green-500 text-white' : ''}
            ${t.type === 'error'   ? 'bg-red-500   text-white' : ''}
            ${t.type === 'warning' ? 'bg-yellow-400 text-black' : ''}
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
