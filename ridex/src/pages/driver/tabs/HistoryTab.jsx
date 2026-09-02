import { useState, useEffect, useRef, useMemo } from 'react';

import { db } from '../../../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
} from 'firebase/firestore';
import { DRIVER_SHARE } from '../../../constants/fees';
import { formatDateTime } from '../utils/format';
import { normalizeRide, formatMoney } from '../../../utils/ride';
import { toMillis } from '../../../utils/time';
import { SkeletonCard } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 20;

// Merge the live first page with statically-paginated older pages,
// de-duplicating by doc id (a newly completed ride shifts the cursor and can
// make pages overlap).
function dedupeById(items) {
  const seen = new Set();
  return items.filter(item => !seen.has(item.id) && seen.add(item.id));
}

function withEarnings(r) {
  const stored = Number(r.driverEarnings);
  r.driverEarnings = Number.isFinite(stored) ? stored : r.price * DRIVER_SHARE;
  return r;
}

// ─────────────────────────────────────────────
// TAB 3 — HISTORY
// First page is a live listener; older pages are fetched once with
// startAfter. Keeping them in separate state means a new completion no longer
// wipes every page the driver has scrolled through.
// ─────────────────────────────────────────────
export default function HistoryTab({ driver, showToast = () => {} }) {
  const uid = driver?.uid;

  const [liveRides,   setLiveRides]   = useState(null); // null = loading
  const [olderRides,  setOlderRides]  = useState([]);
  const [lastDoc,     setLastDoc]     = useState(null);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState('');
  const [reloadKey,   setReloadKey]   = useState(0);
  const olderLoadedRef = useRef(false); // once older pages exist, their cursor owns pagination
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!uid) return undefined;
    // Reset everything for this driver / retry
    olderLoadedRef.current = false;
    setOlderRides([]);
    setLastDoc(null);
    setHasMore(false);
    setError('');
    setLiveRides(null);

    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(PAGE_SIZE),
    );
    const unsub = onSnapshot(q, snap => {
      const page = snap.docs.map(d => withEarnings(normalizeRide(d.id, d.data())));
      if (olderLoadedRef.current) {
        // A newly completed ride pushes the 20th doc out of the live window;
        // Firestore reports it as 'removed'. Keep it so nothing vanishes.
        const evicted = snap.docChanges()
          .filter(c => c.type === 'removed')
          .map(c => withEarnings(normalizeRide(c.doc.id, c.doc.data())));
        if (evicted.length) setOlderRides(prev => dedupeById([...evicted, ...prev]));
      } else {
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
      setLiveRides(page);
    }, () => {
      setLiveRides(prev => prev ?? []);
      setError('Could not load your ride history. Check your connection and retry.');
    });
    return () => unsub();
  }, [uid, reloadKey]);

  const loadMore = async () => {
    if (!lastDoc || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'rides'),
        where('driverId', '==', uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      olderLoadedRef.current = true;
      setOlderRides(prev => dedupeById([...prev, ...snap.docs.map(d => withEarnings(normalizeRide(d.id, d.data())))]));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (_) {
      showToast('Could not load more rides. Please try again.', 'error');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const rides = useMemo(() => (
    liveRides === null
      ? null
      : dedupeById([...liveRides, ...olderRides])
          .sort((a, b) => toMillis(b.completedAt) - toMillis(a.completedAt))
  ), [liveRides, olderRides]);

  if (rides === null) return (
    <div className="space-y-3" role="status" aria-label="Loading ride history"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
  );

  if (error && rides.length === 0) return (
    <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
      <p className="text-red-400 text-sm mb-4">{error}</p>
      <button
        type="button"
        onClick={() => setReloadKey(k => k + 1)}
        className="px-5 py-2.5 min-h-[44px] bg-gray-800 text-gray-200 text-sm font-semibold rounded-xl hover:bg-gray-700 transition"
      >
        Retry
      </button>
    </div>
  );

  if (rides.length === 0) return (
    <EmptyState
      icon={
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      }
      title="No completed rides yet"
      body="Accept your first ride to start building your trip history."
    />
  );

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          <p className="text-yellow-400 text-sm">{error}</p>
        </div>
      )}

      {rides.map(r => (
        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <p className="text-gray-500 text-xs">{formatDateTime(r.completedAt) || 'Just now'}</p>
              <p className="text-gray-400 text-xs mt-0.5 truncate">Passenger: {r.customerName}</p>
            </div>
            <span className="bg-green-500/15 border border-green-500/25 text-green-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest flex-shrink-0">
              Completed
            </span>
          </div>

          <div className="flex gap-2.5 mb-3">
            <div className="flex flex-col items-center pt-1" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="w-0.5 flex-1 bg-gray-800 my-1" />
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-white text-sm leading-tight truncate">{r.pickupAddress}</p>
              <p className="text-white text-sm leading-tight truncate">{r.destinationAddress}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-800">
            <span className="text-gray-600 text-xs truncate min-w-0">{r.distance} mi · {r.duration} mins</span>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Earnings</p>
              <p className="text-yellow-400 font-black tabular-nums">{formatMoney(r.driverEarnings)}</p>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 bg-gray-900 border border-gray-800 text-gray-400 font-semibold rounded-xl hover:bg-gray-800 active:bg-gray-700 transition disabled:opacity-60"
        >
          {loadingMore ? 'Loading…' : 'Load More'}
        </button>
      )}
    </div>
  );
}
