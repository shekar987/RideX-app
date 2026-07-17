import { useState, useEffect } from 'react';

import { db } from '../../../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
} from 'firebase/firestore';
import { formatDateTime } from '../utils/format';
import { SkeletonCard } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

// ─────────────────────────────────────────────
// TAB 3 — HISTORY
// ─────────────────────────────────────────────
export default function HistoryTab({ driver }) {
  const [rides,       setRides]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastDoc,     setLastDoc]     = useState(null);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!driver?.uid) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driver.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRides(data);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [driver?.uid]);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'rides'),
        where('driverId', '==', driver.uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        startAfter(lastDoc),
        limit(20),
      );
      const snap = await getDocs(q);
      const more = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRides(prev => [...prev, ...more]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
    } catch (_) {}
    setLoadingMore(false);
  };

  if (loading) return (
    <div className="space-y-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
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
      {rides.map(r => (
        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-gray-500 text-xs">{formatDateTime(r.completedAt)}</p>
              <p className="text-gray-400 text-xs mt-0.5">Passenger: {r.customerName || 'Unknown'}</p>
            </div>
            <span className="bg-green-500/15 border border-green-500/25 text-green-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest flex-shrink-0">
              Completed
            </span>
          </div>

          <div className="flex gap-2.5 mb-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="w-0.5 flex-1 bg-gray-800 my-1" />
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-white text-sm leading-tight truncate">{r.pickupAddress}</p>
              <p className="text-white text-sm leading-tight truncate">{r.destinationAddress}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-800">
            <span className="text-gray-600 text-xs">{r.distance} mi · {r.duration} mins</span>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Earnings</p>
              <p className="text-yellow-400 font-black">£{parseFloat(r.driverEarnings || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
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
