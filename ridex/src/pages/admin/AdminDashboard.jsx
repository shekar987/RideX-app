// AdminDashboard.jsx
// RideX admin portal — overview, drivers, rides, settings sections.

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  startAfter, getDocs, getCountFromServer, Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { DRIVER_SHARE, PLATFORM_SHARE } from '../../constants/fees';
import { fetchJson, getFunctionsBaseUrl } from '../../utils/net';
import { normalizeRide, formatMoney, initialOf } from '../../utils/ride';
import { toMillis, toDateSafe, formatTimeAgo } from '../../utils/time';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

// ── SVG nav icons ─────────────────────────────────────────────────────────────

function IconOverview() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconDrivers() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 011.373-1.903L5 8h14l2.627 1.097A2 2 0 0123 11v4a2 2 0 01-2 2h-2m-14 0h14m-14 0a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  );
}

function IconRides() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconMoney() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', Icon: IconOverview },
  { id: 'drivers',  label: 'Drivers',  Icon: IconDrivers  },
  { id: 'rides',    label: 'Rides',    Icon: IconRides    },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

// ── Atoms ─────────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`bg-gray-800 rounded-xl animate-pulse ${className}`} />;
}

// Every listener used to fail silently (infinite skeleton) when the rules
// denied a read or an index was missing. Now they render this.
function ErrorCard({ message, onRetry }) {
  return (
    <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <p className="text-red-400 text-sm flex-1 min-w-0">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`px-4 py-2.5 min-h-[44px] bg-gray-800 text-gray-200 text-sm font-semibold rounded-xl hover:bg-gray-700 transition self-start sm:self-auto ${ring}`}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function StatusPill({ style, className = '' }) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${style.classes} ${className}`}>
      {style.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Page size for the paginated admin lists (rides + drivers)
const PAGE_SIZE = 50;
// Safety cap on the "rides today" listener (a busy day is still well under this)
const RIDES_TODAY_CAP = 500;
const LOAD_ERROR = 'Could not load data. Check your connection and that this account has admin access (an /admins document).';

// Merge the live first page with statically-paginated older pages,
// de-duplicating by doc id — new docs arriving at the top of the live page
// can shift the cursor and make pages overlap.
function dedupeById(items) {
  const seen = new Set();
  return items.filter(item => !seen.has(item.id) && seen.add(item.id));
}

const STATUS_STYLE = {
  confirmed:       { label: 'Confirmed',       classes: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  driver_assigned: { label: 'Driver En Route', classes: 'bg-blue-400/10  text-blue-400  border-blue-400/20'    },
  arrived:         { label: 'Arrived',         classes: 'bg-purple-400/10 text-purple-400 border-purple-400/20' },
  in_progress:     { label: 'In Progress',     classes: 'bg-green-400/10 text-green-400 border-green-400/20'   },
  completed:       { label: 'Completed',       classes: 'bg-gray-700/60 text-gray-300 border-gray-600'          },
  cancelled:       { label: 'Cancelled',       classes: 'bg-red-400/10  text-red-400   border-red-400/20'      },
};
const rideStyle = status => STATUS_STYLE[status] || { label: status || 'Unknown', classes: 'bg-gray-700/60 text-gray-300 border-gray-600' };

// ── Recent rides hook ─────────────────────────────────────────────────────────
function useRecentRides(reloadKey) {
  const [rides, setRides] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setRides(null);
    setError('');
    const q = query(collection(db, 'rides'), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(
      q,
      snap => setRides(snap.docs.map(d => normalizeRide(d.id, d.data()))),
      () => { setRides([]); setError(LOAD_ERROR); },
    );
    return unsub;
  }, [reloadKey]);
  return { rides, error };
}

// ── Live admin stats hook ─────────────────────────────────────────────────────
function useAdminStats(reloadKey) {
  const [stats, setStats] = useState({
    ridesToday: null, revenueToday: null, activeDrivers: null, pendingApprovals: null,
  });
  const [error, setError] = useState('');

  // Re-key the "today" query when the calendar day changes so a dashboard left
  // open overnight does not keep labelling yesterday as today.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const t = setInterval(() => {
      const k = new Date().toDateString();
      setDayKey(prev => (prev === k ? prev : k));
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setError('');
    const onErr = () => setError(LOAD_ERROR);
    const todayMs = new Date().setHours(0, 0, 0, 0);

    // createdAt is a Firestore Timestamp — comparing it against a plain number
    // matched EVERY ride ever written (Timestamps sort above numbers).
    const ridesQ = query(
      collection(db, 'rides'),
      where('createdAt', '>=', Timestamp.fromMillis(todayMs)),
      limit(RIDES_TODAY_CAP),
    );
    const unsubRides = onSnapshot(ridesQ, snap => {
      const rides        = snap.docs.map(d => normalizeRide(d.id, d.data()));
      const revenueToday = rides
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + r.price * PLATFORM_SHARE, 0);
      setStats(s => ({ ...s, ridesToday: rides.length, revenueToday }));
    }, onErr);

    const activeQ     = query(collection(db, 'drivers'), where('isOnline', '==', true));
    const unsubActive = onSnapshot(activeQ, snap =>
      setStats(s => ({ ...s, activeDrivers: snap.size })), onErr);

    const pendingQ     = query(collection(db, 'drivers'), where('status', '==', 'pending'));
    const unsubPending = onSnapshot(pendingQ, snap =>
      setStats(s => ({ ...s, pendingApprovals: snap.size })), onErr);

    return () => { unsubRides(); unsubActive(); unsubPending(); };
  }, [dayKey, reloadKey]);

  return { stats, error };
}

// ── Overview section ──────────────────────────────────────────────────────────
function OverviewSection({ onNavigate }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { stats, error: statsError } = useAdminStats(reloadKey);
  const { rides: recentRides, error: recentError } = useRecentRides(reloadKey);
  const { ridesToday, revenueToday, activeDrivers, pendingApprovals } = stats;
  const error = statsError || recentError;

  const statCards = [
    { label: 'Rides Today',            Icon: IconRides,   accent: 'text-yellow-400', value: ridesToday   === null ? null : String(ridesToday) },
    { label: 'Platform Revenue Today', Icon: IconMoney,   accent: 'text-green-400',  value: revenueToday === null ? null : formatMoney(revenueToday) },
    { label: 'Active Drivers',         Icon: IconDrivers, accent: 'text-blue-400',   value: activeDrivers === null ? null : String(activeDrivers) },
    { label: 'Pending Approvals',      Icon: IconClock,   accent: 'text-orange-400', value: pendingApprovals === null ? null : String(pendingApprovals), action: 'drivers' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-xl sm:text-2xl mb-1">Overview</h2>
        <p className="text-gray-500 text-sm">Live platform stats — updates in real time.</p>
      </div>

      {error && <ErrorCard message={error} onRetry={() => setReloadKey(k => k + 1)} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map(card => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`flex-shrink-0 ${card.accent}`}><card.Icon /></span>
                {card.value === null
                  ? <Skeleton className="h-6 w-10" />
                  : <span className={`text-lg sm:text-xl font-black min-w-0 truncate tabular-nums ${card.accent}`} title={card.value}>{card.value}</span>
                }
              </div>
              <p className="text-gray-400 text-sm">{card.label}</p>
              {card.action && (
                <p className="text-yellow-400 text-xs mt-1.5 font-semibold">View →</p>
              )}
            </>
          );
          const cls = 'bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 text-left';
          // Only actionable cards are buttons — the rest were focusable no-ops
          return card.action ? (
            <button key={card.label} type="button" onClick={() => onNavigate(card.action)} className={`${cls} transition hover:border-gray-600 ${ring}`}>
              {inner}
            </button>
          ) : (
            <div key={card.label} className={cls}>{inner}</div>
          );
        })}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Recent Rides</p>
          <span className="text-gray-500 text-xs">Last 5</span>
        </div>

        {recentRides === null ? (
          <div className="space-y-3" role="status" aria-label="Loading recent rides">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-800 last:border-0">
                <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
                <Skeleton className="h-4 w-12 flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : recentRides.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">No rides yet.</p>
        ) : (
          <div>
            {recentRides.map(ride => {
              const style = rideStyle(ride.status);
              return (
                <div key={ride.id} className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0">
                  <div className="w-9 h-9 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <span className="text-yellow-400 font-black text-sm">{initialOf(ride.customerName)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{ride.customerName}</p>
                    <p className="text-gray-500 text-xs truncate">
                      {ride.pickupAddress} → {ride.destinationAddress}
                    </p>
                    {/* Status stays visible on phones — it moves under the name */}
                    <StatusPill style={style} className="sm:hidden mt-1 text-[10px] px-2" />
                  </div>
                  <StatusPill style={style} className="hidden sm:inline-flex flex-shrink-0" />
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-bold tabular-nums">{formatMoney(ride.price)}</p>
                    <p className="text-gray-600 text-xs">{formatTimeAgo(ride.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-5">
        <p className="text-yellow-400 font-bold mb-2">Revenue Split</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-white font-black text-xl">{DRIVER_SHARE * 100}%</p>
            <p className="text-gray-400 text-xs">Driver share</p>
          </div>
          <div>
            <p className="text-white font-black text-xl">{PLATFORM_SHARE * 100}%</p>
            <p className="text-gray-400 text-xs">Platform (Amit)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drivers hook ──────────────────────────────────────────────────────────────
// Two queries merged: (1) ALL pending drivers (live — the approval workflow
// must never bury an applicant beyond the first page), and (2) the paginated
// full driver list (live first page, static older pages). De-duplicated by id.
function useDrivers(reloadKey) {
  const [pendingDrivers, setPendingDrivers] = useState(null); // live, all pending
  const [liveDrivers,    setLiveDrivers]    = useState(null); // live first page
  const [olderDrivers,   setOlderDrivers]   = useState([]);   // static paginated pages
  const [lastDoc,        setLastDoc]        = useState(null);
  const [hasMore,        setHasMore]        = useState(false);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [error,          setError]         = useState('');
  const [loadMoreError,  setLoadMoreError]  = useState('');
  const olderLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setError('');
    setPendingDrivers(null);
    setLiveDrivers(null);
    setOlderDrivers([]);
    olderLoadedRef.current = false;
    const onErr = () => {
      setError(LOAD_ERROR);
      setPendingDrivers(prev => prev ?? []);
      setLiveDrivers(prev => prev ?? []);
    };

    // Pending applicants are few — limit(PAGE_SIZE) is only a safety cap
    const pendingQ = query(
      collection(db, 'drivers'),
      where('status', '==', 'pending'),
      limit(PAGE_SIZE),
    );
    const unsubPending = onSnapshot(pendingQ, snap =>
      setPendingDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);

    const pageQ = query(collection(db, 'drivers'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const unsubPage = onSnapshot(pageQ, snap => {
      setLiveDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Cursor is owned by loadMore once older pages exist (see useAllRides)
      if (!olderLoadedRef.current) {
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
    }, onErr);

    return () => { unsubPending(); unsubPage(); };
  }, [reloadKey]);

  // One-time fetch of the next page of older drivers (not a listener)
  const loadMore = async () => {
    if (!lastDoc || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const q = query(
        collection(db, 'drivers'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      olderLoadedRef.current = true;
      setOlderDrivers(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (_) {
      setLoadMoreError('Could not load more drivers. Please try again.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  // Merge: pending first so they are never dropped by de-duplication, then
  // re-sort newest-first. createdAt may be a Timestamp, a number or an ISO string.
  const drivers = useMemo(() => (
    (pendingDrivers === null || liveDrivers === null)
      ? null
      : dedupeById([...pendingDrivers, ...liveDrivers, ...olderDrivers])
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  ), [pendingDrivers, liveDrivers, olderDrivers]);

  return { drivers, hasMore, loadingMore, loadMore, error, loadMoreError };
}

// ── Drivers section ───────────────────────────────────────────────────────────
function DriversSection() {
  const [reloadKey, setReloadKey] = useState(0);
  const { drivers, hasMore, loadingMore, loadMore, error, loadMoreError } = useDrivers(reloadKey);
  const [filter,      setFilter]      = useState('all');
  const [loadingRows, setLoadingRows] = useState({});
  const [rowErrors,   setRowErrors]   = useState({});
  const [notice,      setNotice]      = useState('');
  const noticeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const buckets = useMemo(() => ({
    pending:  drivers ? drivers.filter(d => d.status === 'pending')  : [],
    approved: drivers ? drivers.filter(d => d.status === 'approved') : [],
    rejected: drivers ? drivers.filter(d => d.status === 'rejected') : [],
  }), [drivers]);
  const { pending, approved, rejected } = buckets;

  const visible = drivers === null ? null : (buckets[filter] ?? drivers);

  // Driver self-writes to `status` are blocked by firestore.rules — approval/
  // rejection must go through the admin-only setDriverStatus Cloud Function.
  // Always keyed by the DOCUMENT id (what the function looks up).
  const setStatus = async (driver, newStatus) => {
    const id = driver.id;
    setRowErrors(r => { const next = { ...r }; delete next[id]; return next; });
    setLoadingRows(r => ({ ...r, [id]: true }));
    try {
      const user    = auth.currentUser;
      const baseUrl = getFunctionsBaseUrl();
      if (!user)    throw new Error('Your session has expired — please sign in again.');
      if (!baseUrl) throw new Error('App configuration error — Cloud Functions URL is not set.');
      const idToken = await user.getIdToken();

      const { res, data } = await fetchJson(`${baseUrl}/setDriverStatus`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ driverId: id, status: newStatus }),
      }, { timeoutMs: 15000 });

      if (!res.ok || !data.success) {
        throw new Error(
          res.status === 403 ? 'This account is not authorised to approve drivers.' :
          data.error || `Failed to update driver status (error ${res.status}).`
        );
      }
      setNotice(`${driver.name || 'Driver'} ${newStatus}.`);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setRowErrors(r => ({ ...r, [id]: err?.message || 'Failed to update driver status. Please try again.' }));
    } finally {
      setLoadingRows(r => { const next = { ...r }; delete next[id]; return next; });
    }
  };

  // The driver list is paginated, so approved/rejected/all counts only cover
  // loaded pages — shown with a "+" suffix while more pages remain. Pending is
  // exact (dedicated live query).
  const partial = hasMore ? '+' : '';
  const FILTER_PILLS = [
    { id: 'all',      label: 'All',      count: drivers ? `${drivers.length}${partial}`  : null },
    { id: 'pending',  label: 'Pending',  count: drivers ? `${pending.length}`            : null },
    { id: 'approved', label: 'Approved', count: drivers ? `${approved.length}${partial}` : null },
    { id: 'rejected', label: 'Rejected', count: drivers ? `${rejected.length}${partial}` : null },
  ];

  const summaryCards = [
    { label: 'Pending Approval', count: drivers ? `${pending.length}`            : null, Icon: IconClock, border: 'border-orange-500/30 bg-orange-500/5', text: 'text-orange-400' },
    { label: 'Active Drivers',   count: drivers ? `${approved.length}${partial}` : null, Icon: IconCheck, border: 'border-green-500/30 bg-green-500/5',   text: 'text-green-400'  },
    { label: 'Rejected',         count: drivers ? `${rejected.length}${partial}` : null, Icon: IconX,     border: 'border-red-500/30 bg-red-500/5',       text: 'text-red-400'    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-xl sm:text-2xl mb-1">Drivers</h2>
        <p className="text-gray-500 text-sm">Approve or reject driver applications.</p>
      </div>

      {error && <ErrorCard message={error} onRetry={() => setReloadKey(k => k + 1)} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className={`border ${card.border} rounded-2xl p-4 sm:p-5 text-center`}>
            <div className={`flex justify-center mb-2 ${card.text}`}><card.Icon /></div>
            {card.count === null
              ? <Skeleton className="h-7 w-12 mx-auto mb-2" />
              : <p className={`font-black text-2xl mb-1 ${card.text}`}>{card.count}</p>
            }
            <p className="text-gray-400 text-sm">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter drivers">
        {FILTER_PILLS.map(pill => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setFilter(pill.id)}
            aria-pressed={filter === pill.id}
            className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-semibold border transition ${ring}
              ${filter === pill.id
                ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'}`}
          >
            {pill.label}
            {pill.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === pill.id ? 'bg-yellow-400/20' : 'bg-gray-800'}`}>
                {pill.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6">
        <p className="text-white font-bold mb-4">Driver Applications</p>

        <div aria-live="polite" aria-atomic="true">
          {notice && (
            <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4">
              <p className="text-green-400 text-sm">{notice}</p>
            </div>
          )}
        </div>

        {visible === null ? (
          <div className="space-y-3" role="status" aria-label="Loading drivers">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">No drivers in this category.</p>
        ) : (
          <div>
            {visible.map(driver => {
              const statusBadge =
                driver.status === 'approved' ? { label: 'Approved', classes: 'bg-green-400/10 text-green-400 border-green-400/20' } :
                driver.status === 'rejected' ? { label: 'Rejected', classes: 'bg-red-400/10 text-red-400 border-red-400/20' } :
                { label: 'Pending', classes: 'bg-orange-400/10 text-orange-400 border-orange-400/20' };

              const joinedDate = toDateSafe(driver.createdAt);
              const joined     = joinedDate
                ? joinedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—';
              const vehicle    = [driver.vehicleType, driver.vehicleMake, driver.vehicleReg, driver.city].filter(Boolean).join(' · ');
              const isLoading  = !!loadingRows[driver.id];
              const rowError   = rowErrors[driver.id];

              return (
                <div key={driver.id} className="py-4 border-b border-gray-800 last:border-0">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                        <span className="text-yellow-400 font-black text-sm">{initialOf(driver.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-white font-semibold text-sm break-words">{driver.name || 'Unnamed applicant'}</p>
                          <StatusPill style={statusBadge} className="px-2" />
                        </div>
                        <p className="text-gray-500 text-xs mb-1 break-all">{driver.email || '—'}</p>
                        {vehicle && <p className="text-gray-400 text-xs break-words">{vehicle}</p>}
                        <p className="text-gray-600 text-xs mt-0.5">Joined {joined}</p>
                      </div>
                    </div>
                    {driver.status === 'pending' && (
                      <div className="flex gap-2 sm:flex-shrink-0 pl-[52px] sm:pl-0">
                        <button
                          type="button"
                          onClick={() => setStatus(driver, 'approved')}
                          disabled={isLoading}
                          className={`flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-bold hover:bg-green-500/20 transition disabled:opacity-50 ${ring}`}
                        >
                          {isLoading ? '…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(driver, 'rejected')}
                          disabled={isLoading}
                          className={`flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/20 transition disabled:opacity-50 ${ring}`}
                        >
                          {isLoading ? '…' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                  {rowError && (
                    <p role="alert" className="text-red-400 text-xs mt-2 pl-[52px] sm:pl-14">{rowError}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {loadMoreError && <p role="alert" className="text-red-400 text-sm mt-4">{loadMoreError}</p>}

        {/* Older pages are fetched once (static) — only the newest page is live */}
        {drivers !== null && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className={`w-full mt-4 py-3 bg-gray-900 border border-gray-800 text-gray-400 font-semibold rounded-xl hover:bg-gray-800 active:bg-gray-700 transition disabled:opacity-60 ${ring}`}
          >
            {loadingMore ? 'Loading…' : 'Load more drivers'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── All rides hook ────────────────────────────────────────────────────────────
// First page (PAGE_SIZE newest rides) is a live onSnapshot listener; older
// pages are fetched once with getDocs + startAfter and stay static — same
// pattern as HistoryTab in the driver portal.
function useAllRides(reloadKey) {
  const [liveRides,    setLiveRides]    = useState(null); // live first page
  const [olderRides,   setOlderRides]   = useState([]);   // static paginated pages
  const [lastDoc,      setLastDoc]      = useState(null); // pagination cursor
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [totalCount,   setTotalCount]   = useState(null); // true server-side count
  const [error,        setError]        = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const olderLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  // Live listener for the newest PAGE_SIZE rides only
  useEffect(() => {
    setError('');
    setLiveRides(null);
    setOlderRides([]);
    olderLoadedRef.current = false;
    const q = query(collection(db, 'rides'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const unsub = onSnapshot(q, snap => {
      setLiveRides(snap.docs.map(d => normalizeRide(d.id, d.data())));
      // Once older pages exist, their cursor owns pagination — a new ride
      // arriving at the top must not rewind it back into loaded pages.
      if (!olderLoadedRef.current) {
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      }
    }, () => { setLiveRides(prev => prev ?? []); setError(LOAD_ERROR); });
    return unsub;
  }, [reloadKey]);

  // True total via server-side aggregation — counts documents without
  // downloading them, so it stays cheap as the collection grows.
  useEffect(() => {
    getCountFromServer(collection(db, 'rides'))
      .then(snap => setTotalCount(snap.data().count))
      .catch(() => {}); // non-fatal — subtitle falls back to loaded count
  }, [reloadKey]);

  // One-time fetch of the next page of older rides (not a listener)
  const loadMore = async () => {
    if (!lastDoc || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const q = query(
        collection(db, 'rides'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      olderLoadedRef.current = true;
      setOlderRides(prev => [...prev, ...snap.docs.map(d => normalizeRide(d.id, d.data()))]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (_) {
      setLoadMoreError('Could not load more rides. Please try again.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const rides = useMemo(
    () => (liveRides === null ? null : dedupeById([...liveRides, ...olderRides])),
    [liveRides, olderRides],
  );
  return { rides, totalCount, hasMore, loadingMore, loadMore, error, loadMoreError };
}

// ── Rides section ─────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = ['driver_assigned', 'arrived', 'in_progress'];

const FILTERS = [
  { id: 'all',         label: 'All'         },
  { id: 'confirmed',   label: 'Confirmed'   },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed',   label: 'Completed'   },
  { id: 'cancelled',   label: 'Cancelled'   },
];

function RidesSection() {
  const [reloadKey, setReloadKey] = useState(0);
  const { rides, totalCount, hasMore, loadingMore, loadMore, error, loadMoreError } = useAllRides(reloadKey);
  const [filter, setFilter] = useState('all');

  // Only the active bucket is computed — the old version filtered all five on every render
  const visible = useMemo(() => {
    if (rides === null) return null;
    switch (filter) {
      case 'confirmed':   return rides.filter(r => r.status === 'confirmed');
      case 'in_progress': return rides.filter(r => ACTIVE_STATUSES.includes(r.status));
      case 'completed':   return rides.filter(r => r.status === 'completed');
      case 'cancelled':   return rides.filter(r => r.status === 'cancelled');
      default:            return rides;
    }
  }, [rides, filter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-xl sm:text-2xl mb-1">All Rides</h2>
        <p className="text-gray-500 text-sm">
          {rides === null
            ? 'Loading…'
            : totalCount !== null
              ? `${totalCount} ride${totalCount !== 1 ? 's' : ''} total`
              : `${rides.length}${hasMore ? '+' : ''} ride${rides.length !== 1 ? 's' : ''} loaded`}
        </p>
      </div>

      {error && <ErrorCard message={error} onRetry={() => setReloadKey(k => k + 1)} />}

      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter rides">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-semibold border transition ${ring}
              ${filter === f.id
                ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Ride History</p>
          {visible !== null && (
            <span className="text-gray-500 text-xs">{visible.length} result{visible.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {visible === null ? (
          <div className="space-y-3" role="status" aria-label="Loading rides">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-800 last:border-0">
                <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full flex-shrink-0" />
                <Skeleton className="h-4 w-12 flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">No rides in this category.</p>
        ) : (
          <div>
            {visible.map(ride => {
              const badge = rideStyle(ride.status);
              return (
                <div key={ride.id} className="py-3.5 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <span className="text-yellow-400 font-black text-sm">{initialOf(ride.customerName)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{ride.customerName}</p>
                      <p className="text-gray-500 text-xs truncate">
                        {ride.pickupAddress} → {ride.destinationAddress}{ride.rideType ? ` · ${ride.rideType}` : ''}
                      </p>
                      <StatusPill style={badge} className="sm:hidden mt-1 text-[10px] px-2" />
                    </div>
                    <StatusPill style={badge} className="hidden sm:inline-flex flex-shrink-0" />
                    <div className="text-right flex-shrink-0">
                      <p className="text-white text-sm font-bold tabular-nums">{formatMoney(ride.price)}</p>
                      <p className="text-gray-600 text-xs">{formatTimeAgo(ride.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loadMoreError && <p role="alert" className="text-red-400 text-sm mt-4">{loadMoreError}</p>}

        {/* Older pages are fetched once (static) — only the newest page is live */}
        {rides !== null && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className={`w-full mt-4 py-3 bg-gray-900 border border-gray-800 text-gray-400 font-semibold rounded-xl hover:bg-gray-800 active:bg-gray-700 transition disabled:opacity-60 ${ring}`}
          >
            {loadingMore ? 'Loading…' : 'Load more rides'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Settings section ──────────────────────────────────────────────────────────
function SettingsSection() {
  const settingsCards = [
    { title: 'Commission Rate', desc: 'Set platform % per ride',     Icon: IconMoney    },
    { title: 'Surge Pricing',   desc: 'Peak-hour multipliers',        Icon: IconTrend    },
    { title: 'Service Areas',   desc: 'Allowed cities and regions',   Icon: IconRides    },
    { title: 'Notifications',   desc: 'Email and SMS alert settings', Icon: IconBell     },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-xl sm:text-2xl mb-1">Settings</h2>
        <p className="text-gray-500 text-sm">Platform configuration — built in a future session.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {settingsCards.map(item => (
          <div key={item.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 opacity-50 cursor-not-allowed" aria-disabled="true">
            <div className="text-gray-400 mb-2"><item.Icon /></div>
            <p className="text-white font-bold text-sm mb-1">{item.title}</p>
            <p className="text-gray-500 text-xs">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard component ──────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [loggingOut,    setLoggingOut]    = useState(false);
  const [logoutError,   setLogoutError]   = useState('');
  const [adminEmail,    setAdminEmail]    = useState('');
  const hamburgerRef = useRef(null);
  const firstNavRef  = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (!user) { navigate('/admin/login', { replace: true }); return; }
      setAdminEmail(user.email || '');
    });
    return () => unsub();
  }, [navigate]);

  // Drawer: Escape closes, focus moves in on open and back to the hamburger on close
  const closeSidebar = () => {
    setSidebarOpen(false);
    hamburgerRef.current?.focus();
  };
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    firstNavRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') closeSidebar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (_) {
      setLogoutError('Could not sign out. Check your connection and try again.');
      setLoggingOut(false);
    }
  };

  const currentNav = NAV_ITEMS.find(n => n.id === activeSection);

  const renderSection = () => {
    switch (activeSection) {
      case 'drivers':  return <DriversSection />;
      case 'rides':    return <RidesSection />;
      case 'settings': return <SettingsSection />;
      default:         return <OverviewSection onNavigate={section => setActiveSection(section)} />;
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-20 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* `invisible` removes the closed drawer from the tab order and the
          accessibility tree on phones; lg: keeps it permanently visible. */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 max-w-[85vw] bg-gray-900 border-r border-gray-800 z-30 flex flex-col
        transform transition-[transform,visibility] duration-200 pt-safe pl-safe
        ${sidebarOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'}
        lg:translate-x-0 lg:visible
      `} aria-label="Admin navigation">

        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
          <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <span className="text-black font-black text-base">R</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-black text-base leading-tight">RideX</p>
            <p className="text-yellow-400 text-xs font-bold">Admin Portal</p>
          </div>
        </div>

        {/* Scrolls on short landscape phones so Sign Out is never clipped */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1" aria-label="Sections">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item.id}
              ref={i === 0 ? firstNavRef : undefined}
              type="button"
              onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
              aria-current={activeSection === item.id ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition ${ring}
                ${activeSection === item.id
                  ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
            >
              <item.Icon />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800 pb-safe">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <span className="text-black font-black text-xs">{initialOf(adminEmail, 'A')}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-bold truncate">{adminEmail || 'Admin'}</p>
              <p className="text-gray-500 text-xs">Administrator</p>
            </div>
          </div>
          {logoutError && <p role="alert" className="text-red-400 text-xs mb-2">{logoutError}</p>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={`w-full py-3 border border-red-500/40 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/10 transition disabled:opacity-60 ${ring}`}
          >
            {loggingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-h-dvh min-w-0">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-10 bg-black border-b border-gray-800 pt-safe">
          <div className="flex items-center justify-between px-4 py-2">
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={`p-2.5 -ml-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white transition ${ring} rounded`}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 text-white">
              {currentNav && <currentNav.Icon />}
              <span className="font-black text-base">{currentNav?.label || 'Dashboard'}</span>
            </div>

            <div className="w-11" aria-hidden="true" />
          </div>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-gray-800">
          <div>
            <h1 className="text-white font-black text-xl">{currentNav?.label || 'Dashboard'}</h1>
            <p className="text-gray-500 text-sm">RideX Admin Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm truncate max-w-[260px]">{adminEmail}</span>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Online" aria-hidden="true" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 pb-safe max-w-6xl w-full mx-auto">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
