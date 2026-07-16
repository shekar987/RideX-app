// AdminDashboard.jsx
// RideX admin portal — overview, drivers, rides, settings sections.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { DRIVER_SHARE, PLATFORM_SHARE } from '../../constants/fees';

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

// ── Skeleton shimmer atom ─────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`bg-gray-800 rounded-xl animate-pulse ${className}`} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTimeAgo(createdAtMs) {
  if (!createdAtMs) return '';
  const diffMin = Math.floor((Date.now() - createdAtMs) / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const STATUS_STYLE = {
  confirmed:       { label: 'Confirmed',       classes: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  driver_assigned: { label: 'Driver En Route', classes: 'bg-blue-400/10  text-blue-400  border-blue-400/20'    },
  arrived:         { label: 'Arrived',         classes: 'bg-purple-400/10 text-purple-400 border-purple-400/20' },
  in_progress:     { label: 'In Progress',     classes: 'bg-green-400/10 text-green-400 border-green-400/20'   },
  completed:       { label: 'Completed',       classes: 'bg-gray-700/60 text-gray-300 border-gray-600'          },
  cancelled:       { label: 'Cancelled',       classes: 'bg-red-400/10  text-red-400   border-red-400/20'      },
};

// ── Recent rides hook ─────────────────────────────────────────────────────────
function useRecentRides() {
  const [rides, setRides] = useState(null);
  useEffect(() => {
    const q = query(collection(db, 'rides'), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(q, snap =>
      setRides(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);
  return rides;
}

// ── Live admin stats hook ─────────────────────────────────────────────────────
function useAdminStats() {
  const [stats, setStats] = useState({
    ridesToday: null, revenueToday: null, activeDrivers: null, pendingApprovals: null,
  });

  useEffect(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const ridesQ  = query(collection(db, 'rides'), where('createdAt', '>=', todayMs));

    const unsubRides = onSnapshot(ridesQ, snap => {
      const rides        = snap.docs.map(d => d.data());
      const ridesToday   = rides.length;
      const revenueToday = rides
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + parseFloat(r.price || 0) * PLATFORM_SHARE, 0);
      setStats(s => ({ ...s, ridesToday, revenueToday }));
    });

    const activeQ     = query(collection(db, 'drivers'), where('isOnline', '==', true));
    const unsubActive = onSnapshot(activeQ, snap =>
      setStats(s => ({ ...s, activeDrivers: snap.size }))
    );

    const pendingQ     = query(collection(db, 'drivers'), where('status', '==', 'pending'));
    const unsubPending = onSnapshot(pendingQ, snap =>
      setStats(s => ({ ...s, pendingApprovals: snap.size }))
    );

    return () => { unsubRides(); unsubActive(); unsubPending(); };
  }, []);

  return stats;
}

// ── Overview section ──────────────────────────────────────────────────────────
function OverviewSection({ onNavigate }) {
  const { ridesToday, revenueToday, activeDrivers, pendingApprovals } = useAdminStats();
  const recentRides = useRecentRides();

  const statCards = [
    { label: 'Rides Today',       Icon: IconRides,    accent: 'text-yellow-400', value: ridesToday   === null ? null : String(ridesToday)                      },
    { label: 'Revenue Today',     Icon: IconMoney,    accent: 'text-green-400',  value: revenueToday === null ? null : `£${revenueToday.toFixed(2)}`            },
    { label: 'Active Drivers',    Icon: IconDrivers,  accent: 'text-blue-400',   value: activeDrivers === null ? null : String(activeDrivers)                   },
    { label: 'Pending Approvals', Icon: IconClock,    accent: 'text-orange-400', value: pendingApprovals === null ? null : String(pendingApprovals), action: 'drivers' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Overview</h2>
        <p className="text-gray-500 text-sm">Live platform stats — updates in real time.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <button
            key={card.label}
            onClick={() => card.action && onNavigate(card.action)}
            className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left transition ${ring}
              ${card.action ? 'hover:border-gray-600 cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={card.accent}><card.Icon /></span>
              {card.value === null
                ? <Skeleton className="h-6 w-10" />
                : <span className={`text-xl font-black ${card.accent}`}>{card.value}</span>
              }
            </div>
            <p className="text-gray-400 text-sm">{card.label}</p>
            {card.action && (
              <p className="text-yellow-400 text-xs mt-1.5 font-semibold">View →</p>
            )}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Recent Rides</p>
          <span className="text-gray-500 text-xs">Last 5</span>
        </div>

        {recentRides === null ? (
          <div className="space-y-3">
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
              const style   = STATUS_STYLE[ride.status] || STATUS_STYLE.confirmed;
              const initial = (ride.userName || '?')[0].toUpperCase();
              return (
                <div key={ride.id} className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0">
                  <div className="w-9 h-9 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <span className="text-yellow-400 font-black text-sm">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{ride.userName || 'Unknown'}</p>
                    <p className="text-gray-500 text-xs truncate">
                      {ride.pickup || '—'} → {ride.destination || '—'}
                    </p>
                  </div>
                  <span className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${style.classes}`}>
                    {style.label}
                  </span>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-bold">£{parseFloat(ride.price || 0).toFixed(2)}</p>
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
        <div className="flex gap-6">
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
function useDrivers() {
  const [drivers, setDrivers] = useState(null);
  useEffect(() => {
    const q = query(collection(db, 'drivers'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap =>
      setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);
  return drivers;
}

// ── Drivers section ───────────────────────────────────────────────────────────
function DriversSection() {
  const drivers       = useDrivers();
  const [filter,      setFilter]      = useState('all');
  const [loadingRows, setLoadingRows] = useState({});
  const [actionError, setActionError] = useState('');

  const pending  = drivers ? drivers.filter(d => d.status === 'pending')  : [];
  const approved = drivers ? drivers.filter(d => d.status === 'approved') : [];
  const rejected = drivers ? drivers.filter(d => d.status === 'rejected') : [];

  const visible = drivers === null ? null : (
    filter === 'pending'  ? pending  :
    filter === 'approved' ? approved :
    filter === 'rejected' ? rejected :
    drivers
  );

  // Driver self-writes to `status` are blocked by firestore.rules — approval/
  // rejection must go through the admin-only setDriverStatus Cloud Function.
  const setStatus = async (driverUid, newStatus) => {
    setActionError('');
    setLoadingRows(r => ({ ...r, [driverUid]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const baseUrl = process.env.REACT_APP_FUNCTIONS_BASE_URL
        || `https://us-central1-${process.env.REACT_APP_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

      const res = await fetch(`${baseUrl}/setDriverStatus`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ driverId: driverUid, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || 'Failed to update driver status.');
      }
    } catch {
      setActionError('Failed to update driver status. Please try again.');
    } finally {
      setLoadingRows(r => { const next = { ...r }; delete next[driverUid]; return next; });
    }
  };

  const FILTER_PILLS = [
    { id: 'all',      label: 'All',      count: drivers?.length ?? null },
    { id: 'pending',  label: 'Pending',  count: drivers ? pending.length  : null },
    { id: 'approved', label: 'Approved', count: drivers ? approved.length : null },
    { id: 'rejected', label: 'Rejected', count: drivers ? rejected.length : null },
  ];

  const summaryCards = [
    { label: 'Pending Approval', count: drivers ? pending.length  : null, Icon: IconClock, border: 'border-orange-500/30 bg-orange-500/5', text: 'text-orange-400' },
    { label: 'Active Drivers',   count: drivers ? approved.length : null, Icon: IconCheck, border: 'border-green-500/30 bg-green-500/5',   text: 'text-green-400'  },
    { label: 'Rejected',         count: drivers ? rejected.length : null, Icon: IconX,     border: 'border-red-500/30 bg-red-500/5',       text: 'text-red-400'    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">Drivers</h2>
        <p className="text-gray-500 text-sm">Approve or reject driver applications.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className={`border ${card.border} rounded-2xl p-5 text-center`}>
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
            onClick={() => setFilter(pill.id)}
            aria-pressed={filter === pill.id}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition ${ring}
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

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <p className="text-white font-bold mb-4">Driver Applications</p>

        {actionError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
            <p className="text-red-400 text-sm">{actionError}</p>
          </div>
        )}

        {visible === null ? (
          <div className="space-y-3">
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

              const joined    = driver.createdAt
                ? new Date(driver.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—';
              const isLoading = !!loadingRows[driver.uid || driver.id];
              const initial   = (driver.name || '?')[0].toUpperCase();

              return (
                <div key={driver.id} className="py-4 border-b border-gray-800 last:border-0">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                      <span className="text-yellow-400 font-black text-sm">{initial}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-white font-semibold text-sm">{driver.name}</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge.classes}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs mb-1">{driver.email}</p>
                      <p className="text-gray-400 text-xs">
                        {driver.vehicleType} · {driver.vehicleMake} · {driver.vehicleReg} · {driver.city}
                      </p>
                      <p className="text-gray-600 text-xs mt-0.5">Joined {joined}</p>
                    </div>
                    {driver.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setStatus(driver.uid || driver.id, 'approved')}
                          disabled={isLoading}
                          className={`px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold hover:bg-green-500/20 transition disabled:opacity-50 ${ring}`}
                        >
                          {isLoading ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setStatus(driver.uid || driver.id, 'rejected')}
                          disabled={isLoading}
                          className={`px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition disabled:opacity-50 ${ring}`}
                        >
                          {isLoading ? '…' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── All rides hook ────────────────────────────────────────────────────────────
function useAllRides() {
  const [rides, setRides] = useState(null);
  useEffect(() => {
    const q = query(collection(db, 'rides'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap =>
      setRides(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, []);
  return rides;
}

// ── Rides section ─────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = ['driver_assigned', 'arrived', 'in_progress'];

function RidesSection() {
  const rides            = useAllRides();
  const [filter, setFilter] = useState('all');

  const buckets = {
    all:         rides,
    confirmed:   rides?.filter(r => r.status === 'confirmed'),
    in_progress: rides?.filter(r => ACTIVE_STATUSES.includes(r.status)),
    completed:   rides?.filter(r => r.status === 'completed'),
    cancelled:   rides?.filter(r => r.status === 'cancelled'),
  };

  const visible = buckets[filter] ?? null;

  const FILTERS = [
    { id: 'all',         label: 'All'         },
    { id: 'confirmed',   label: 'Confirmed'   },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed',   label: 'Completed'   },
    { id: 'cancelled',   label: 'Cancelled'   },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-black text-2xl mb-1">All Rides</h2>
        <p className="text-gray-500 text-sm">
          {rides === null ? 'Loading…' : `${rides.length} ride${rides.length !== 1 ? 's' : ''} total`}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter rides">
        {FILTERS.map(f => {
          const count = buckets[f.id]?.length ?? null;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border transition ${ring}
                ${filter === f.id
                  ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
                  : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-600'}`}
            >
              {f.label}
              {count !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === f.id ? 'bg-yellow-400/20' : 'bg-gray-800'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold">Ride History</p>
          {visible !== null && (
            <span className="text-gray-500 text-xs">{visible.length} result{visible.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {visible === null ? (
          <div className="space-y-3">
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
              const badge   = STATUS_STYLE[ride.status] || { label: ride.status, classes: 'bg-gray-700/60 text-gray-300 border-gray-600' };
              const initial = (ride.userName || '?')[0].toUpperCase();
              return (
                <div key={ride.id} className="py-3.5 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <span className="text-yellow-400 font-black text-sm">{initial}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{ride.userName || 'Unknown'}</p>
                      <p className="text-gray-500 text-xs truncate">
                        {ride.pickup || '—'} → {ride.destination || '—'}
                      </p>
                    </div>
                    <span className="hidden md:inline text-gray-500 text-xs flex-shrink-0">{ride.rideType}</span>
                    <span className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${badge.classes}`}>
                      {badge.label}
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white text-sm font-bold">£{parseFloat(ride.price || 0).toFixed(2)}</p>
                      <p className="text-gray-600 text-xs">{formatTimeAgo(ride.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
        <h2 className="text-white font-black text-2xl mb-1">Settings</h2>
        <p className="text-gray-500 text-sm">Platform configuration — built in a future session.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {settingsCards.map(item => (
          <div key={item.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 opacity-50 cursor-not-allowed">
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
  const [adminEmail,    setAdminEmail]    = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) setAdminEmail(user.email || '');
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (_) {
      setLoggingOut(false);
    }
  };

  const currentNav = NAV_ITEMS.find(n => n.id === activeSection);

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection onNavigate={section => setActiveSection(section)} />;
      case 'drivers':  return <DriversSection />;
      case 'rides':    return <RidesSection />;
      case 'settings': return <SettingsSection />;
      default:         return <OverviewSection onNavigate={section => setActiveSection(section)} />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <>
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/70 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside className={`
          fixed top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 z-30 flex flex-col
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `} aria-label="Admin navigation">

          <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800">
            <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <span className="text-black font-black text-base">R</span>
            </div>
            <div>
              <p className="text-white font-black text-base leading-tight">RideX</p>
              <p className="text-yellow-400 text-xs font-bold">Admin Portal</p>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Sections">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                aria-current={activeSection === item.id ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${ring}
                  ${activeSection === item.id
                    ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                <item.Icon />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <span className="text-black font-black text-xs">
                  {(adminEmail[0] || 'A').toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-bold truncate">{adminEmail || 'Admin'}</p>
                <p className="text-gray-500 text-xs">Administrator</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className={`w-full py-2.5 border border-red-500/40 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/10 transition disabled:opacity-60 ${ring}`}
            >
              {loggingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </aside>
      </>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-10 bg-black border-b border-gray-800 flex items-center justify-between px-4 py-3.5">
          <button
            onClick={() => setSidebarOpen(true)}
            className={`text-gray-400 hover:text-white transition ${ring} rounded`}
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

          <div className="w-6" aria-hidden="true" />
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-gray-800">
          <div>
            <h1 className="text-white font-black text-xl">{currentNav?.label || 'Dashboard'}</h1>
            <p className="text-gray-500 text-sm">RideX Admin Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">{adminEmail}</span>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Online" aria-hidden="true" />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
