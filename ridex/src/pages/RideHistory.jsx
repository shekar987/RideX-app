import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { formatMoney, ACTIVE_RIDE_STATUSES } from '../utils/ride';
import { toMillis } from '../utils/time';
import { readJson, writeJson } from '../utils/storage';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_LABELS = {
  confirmed:       { label: 'Confirmed',      color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  driver_assigned: { label: 'Driver On Way',  color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  arrived:         { label: 'Driver Waiting', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  in_progress:     { label: 'In Progress',    color: 'text-green-400',  bg: 'bg-green-400/10'  },
  completed:       { label: 'Completed',      color: 'text-green-400',  bg: 'bg-green-400/10'  },
  cancelled:       { label: 'Cancelled',      color: 'text-red-400',    bg: 'bg-red-400/10'    },
};

// Cache is keyed per user so a shared device never shows someone else's rides
const cacheKey = uid => `ridex_ride_history_${uid}`;

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

const sortRides = rides => [...rides].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

// Normalise a Firestore doc (legacy aliases, timestamps, numbers) into a card
function toCard(d) {
  const r = d.data();
  const price = Number(r.price ?? r.fare);
  return {
    id:          d.id,
    pickup:      r.pickupAddress || r.pickup || '—',
    destination: r.destinationAddress || r.destination || '—',
    price:       Number.isFinite(price) ? price : null,
    rideType:    r.rideType || 'Ride',
    status:      r.status || 'unknown',
    distance:    r.distance ?? null,
    duration:    r.duration ?? null,
    passengers:  r.passengers ?? null,
    // serverTimestamp() is null until the server acks — sort a just-booked ride to the top
    createdAt:   toMillis(r.createdAt) || Date.now(),
  };
}

// ── Ride type SVG icons ───────────────────────────────────────────────────────

function IconVan() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM3 11V7a2 2 0 012-2h10l3 4H3zm0 0h18v3a2 2 0 01-2 2h-1" />
    </svg>
  );
}

function IconCar() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 011.373-1.903L5 8h14l2.627 1.097A2 2 0 0123 11v4a2 2 0 01-2 2h-2m-14 0h14m-14 0a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  );
}

function RideTypeIcon({ type }) {
  if (type === 'XL') return <IconVan />;
  return <IconCar />;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function RideCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse" aria-hidden="true">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gray-800 rounded-full" />
          <div className="w-16 h-4 bg-gray-800 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-20 h-5 bg-gray-800 rounded-full" />
          <div className="w-12 h-5 bg-gray-800 rounded" />
        </div>
      </div>
      <div className="flex items-start gap-3 mb-3">
        <div className="mt-1 flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-2.5 h-2.5 bg-gray-800 rounded-full" />
          <div className="w-0.5 h-5 bg-gray-800" />
          <div className="w-2.5 h-2.5 bg-gray-800 rounded-sm" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="h-3 bg-gray-800 rounded w-4/5" />
          <div className="h-3 bg-gray-800 rounded w-2/3" />
        </div>
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-gray-800">
        <div className="w-20 h-3 bg-gray-800 rounded" />
        <div className="w-40 h-3 bg-gray-800 rounded" />
      </div>
    </div>
  );
}

// ── Ride card ─────────────────────────────────────────────────────────────────
function RideCard({ ride }) {
  const ms   = Number(ride.createdAt);
  const has  = Number.isFinite(ms) && ms > 0;
  const date = has
    ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const iso  = has ? new Date(ms).toISOString() : undefined;
  const statusInfo = STATUS_LABELS[ride.status] || {
    label: ride.status || 'Unknown', color: 'text-gray-400', bg: 'bg-gray-800',
  };
  const isActive = ACTIVE_RIDE_STATUSES.includes(ride.status);

  const body = (
    <article className={`bg-gray-900 border rounded-2xl p-4 sm:p-5 ${isActive ? 'border-yellow-400/30' : 'border-gray-800'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-gray-300 min-w-0">
          <RideTypeIcon type={ride.rideType} />
          <span className="font-bold truncate">{ride.rideType}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 min-w-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${statusInfo.bg} ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <span className="text-yellow-400 font-black text-lg tabular-nums">{formatMoney(ride.price)}</span>
        </div>
      </div>

      <div className="flex items-start gap-3 mb-3">
        <div className="mt-1 flex flex-col items-center gap-1 flex-shrink-0" aria-hidden="true">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <div className="w-0.5 h-5 bg-gray-700" />
          <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{ride.pickup}</p>
          <p className="text-sm text-gray-400 mt-2 truncate">{ride.destination}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-gray-500 pt-3 border-t border-gray-800">
        <time dateTime={iso} className="flex-shrink-0">{date}</time>
        <span className="truncate text-right">
          {ride.distance ?? '—'} mi · {ride.duration ?? '—'} min · {ride.passengers ?? '—'} pax
        </span>
      </div>

      {isActive && (
        <p className="text-yellow-400 text-xs font-bold mt-3">Track this ride →</p>
      )}
    </article>
  );

  // Active rides link back to live tracking — previously there was no way back
  // once the tab was closed.
  return isActive
    ? <Link to={`/status/${ride.id}`} className={`block rounded-2xl ${ring}`} aria-label={`Track ${ride.rideType} ride, ${statusInfo.label}`}>{body}</Link>
    : body;
}

// ── Page ──────────────────────────────────────────────────────────────────────
function RideHistory() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const userId = user?.uid;

  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [stale,   setStale]   = useState(false); // showing cached rows because Firestore failed

  useEffect(() => {
    if (!userId) { setLoading(false); return undefined; }

    // Seed from this user's cache so returning users see rides before Firestore arrives
    const cached = readJson(cacheKey(userId), []);
    if (Array.isArray(cached) && cached.length) setRides(sortRides(cached));

    const q = query(
      collection(db, 'rides'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const unsub = onSnapshot(
      q,
      snapshot => {
        const data = snapshot.docs.map(toCard);
        setRides(data);
        setLoading(false);
        setError('');
        setStale(false);
        writeJson(cacheKey(userId), data);
      },
      () => {
        // Keep whatever we have (cache) but SAY so — an empty list used to be
        // indistinguishable from "you have no rides".
        setLoading(false);
        setStale(true);
        setError('Could not load your latest rides. Check your connection.');
      },
    );

    return unsub;
  }, [userId]);

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/'); }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center px-5 md:px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/book')}
            aria-label="Back to book ride"
            className={`flex items-center gap-1.5 text-gray-400 hover:text-white transition text-sm px-2 py-2 -ml-2 ${ring} rounded`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <Link to="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
            <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
              <span className="text-black font-black text-xs">R</span>
            </div>
            <span className="text-lg font-black">RideX</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm hidden md:block truncate max-w-[200px]">{user?.displayName || user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className={`text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-4 py-2.5 sm:py-1.5 rounded-full ${ring}`}
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 md:px-6 py-8 pb-safe">
        <h1 className="text-2xl sm:text-3xl font-black mb-1">Ride History</h1>
        <p className="text-gray-500 text-sm mb-8">Your past and active rides</p>

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <div role="alert" className={`border rounded-xl px-4 py-3 mb-6 ${stale && rides.length ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <p className={`text-sm ${stale && rides.length ? 'text-yellow-400' : 'text-red-400'}`}>
                {error}{stale && rides.length ? ' Showing your last saved rides.' : ''}
              </p>
            </div>
          )}
        </div>

        {loading && rides.length === 0 ? (
          <div className="space-y-4" role="status" aria-label="Loading rides">
            {[1, 2, 3].map(i => <RideCardSkeleton key={i} />)}
          </div>
        ) : !loading && rides.length === 0 && !error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 011.373-1.903L5 8h14l2.627 1.097A2 2 0 0123 11v4a2 2 0 01-2 2h-2m-14 0h14m-14 0a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <p className="font-bold text-lg mb-2">No rides yet</p>
            <p className="text-gray-500 text-sm mb-6">Book your first ride and it will appear here.</p>
            <button
              type="button"
              onClick={() => navigate('/book')}
              className={`px-6 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition ${ring}`}
            >
              Book a ride
            </button>
          </div>
        ) : rides.length === 0 ? null : (
          <ol className="space-y-4 list-none">
            {rides.map(ride => <li key={ride.id}><RideCard ride={ride} /></li>)}
          </ol>
        )}
      </main>
    </div>
  );
}

export default RideHistory;
