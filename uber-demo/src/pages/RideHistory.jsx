import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_LABELS = {
  confirmed:       { label: 'Confirmed',      color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  driver_assigned: { label: 'Driver On Way',  color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  arrived:         { label: 'Driver Waiting', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  in_progress:     { label: 'In Progress',    color: 'text-green-400',  bg: 'bg-green-400/10'  },
  completed:       { label: 'Completed',      color: 'text-green-400',  bg: 'bg-green-400/10'  },
  cancelled:       { label: 'Cancelled',      color: 'text-red-400',    bg: 'bg-red-400/10'    },
};

const LS_KEY          = 'ridex_ride_history';
const LS_KEY_FALLBACK = 'ridex_rides';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

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
  const date = ride.createdAt
    ? new Date(ride.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—';
  const statusInfo = STATUS_LABELS[ride.status] || {
    label: ride.status, color: 'text-gray-400', bg: 'bg-gray-800',
  };

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-gray-300">
          <RideTypeIcon type={ride.rideType} />
          <span className="font-bold">{ride.rideType}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <span className="text-yellow-400 font-black text-lg">
            £{parseFloat(ride.price).toFixed(2)}
          </span>
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

      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-800">
        <time dateTime={ride.createdAt ? new Date(ride.createdAt).toISOString() : undefined}>{date}</time>
        <span>{ride.distance} mi · {ride.duration} min · {ride.passengers} pax</span>
      </div>
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function RideHistory() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const userId = user?.uid;

  // Seed from localStorage immediately so returning users see rides before Firestore arrives
  const [rides, setRides] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_FALLBACK);
      return JSON.parse(raw || '[]')
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const q = query(
      collection(db, 'rides'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const unsub = onSnapshot(
      q,
      snapshot => {
        const data = snapshot.docs.map(d => {
          const r = d.data();
          return {
            id:          d.id,
            pickup:      r.pickup,
            destination: r.destination,
            price:       r.price,
            rideType:    r.rideType,
            status:      r.status,
            distance:    r.distance,
            duration:    r.duration,
            passengers:  r.passengers,
            createdAt:   r.createdAt?.toMillis?.() ?? r.createdAt ?? 0,
          };
        });
        setRides(data);
        setLoading(false);
        try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
      },
      () => {
        try {
          const raw   = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_FALLBACK);
          const local = JSON.parse(raw || '[]');
          setRides(local.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
        } catch {
          setError('Could not load rides. Please try again.');
        }
        setLoading(false);
      },
    );

    return unsub;
  }, [userId]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/book')}
            aria-label="Back to book ride"
            className={`flex items-center gap-1.5 text-gray-400 hover:text-white transition text-sm ${ring} rounded`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <a href="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
            <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
              <span className="text-black font-black text-xs">R</span>
            </div>
            <span className="text-lg font-black">RideX</span>
          </a>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm hidden md:block">{user?.displayName || user?.email}</p>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className={`text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full ${ring}`}
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        <h1 className="text-3xl font-black mb-1">Ride History</h1>
        <p className="text-gray-500 text-sm mb-8">Your past and active rides</p>

        <div aria-live="polite" aria-atomic="true">
          {error && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {loading && rides.length === 0 ? (
          <div className="space-y-4" aria-label="Loading rides">
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
              onClick={() => navigate('/book')}
              className={`px-6 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition ${ring}`}
            >
              Book a ride
            </button>
          </div>
        ) : (
          <ol className="space-y-4 list-none">
            {rides.map(ride => <li key={ride.id}><RideCard ride={ride} /></li>)}
          </ol>
        )}
      </main>
    </div>
  );
}

export default RideHistory;
