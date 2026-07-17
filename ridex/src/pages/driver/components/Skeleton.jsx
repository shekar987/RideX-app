// ─────────────────────────────────────────────
// Skeleton loader atoms
// ─────────────────────────────────────────────
export function SkeletonLine({ className = '' }) {
  return <div className={`bg-gray-800 rounded animate-pulse ${className}`} />;
}
export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
      <SkeletonLine className="h-4 w-1/2" />
      <SkeletonLine className="h-3 w-3/4" />
      <SkeletonLine className="h-3 w-2/3" />
    </div>
  );
}
