import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_LABELS = {
    confirmed:       { label: 'Confirmed',     color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
    driver_assigned: { label: 'Driver On Way', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    driver_arriving: { label: 'Arriving',      color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    ride_started:    { label: 'In Progress',   color: 'text-green-400',  bg: 'bg-green-400/10'  },
    arrived:         { label: 'Completed',     color: 'text-green-400',  bg: 'bg-green-400/10'  },
    completed:       { label: 'Completed',     color: 'text-green-400',  bg: 'bg-green-400/10'  },
    cancelled:       { label: 'Cancelled',     color: 'text-red-400',    bg: 'bg-red-400/10'    },
};

// localStorage key used by this page.
// BookRide.jsx still writes to 'ridex_rides' as a booking receipt; we keep
// that as a secondary fallback so no data is lost during the transition.
const LS_KEY = 'ridex_ride_history';
const LS_KEY_FALLBACK = 'ridex_rides';

// ── Skeleton card ─────────────────────────────────────────────────────────────
function RideCardSkeleton() {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse">
            {/* Header row: ride-type icon + name  |  status badge + price */}
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

            {/* Route row: dot-line-dot connector + two address lines */}
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

            {/* Footer row: date  |  distance · duration · passengers */}
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">
                        {ride.rideType === 'XL' ? '🚐' : ride.rideType === 'Comfort' ? '🚙' : '🚗'}
                    </span>
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
                <div className="mt-1 flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                    <div className="w-0.5 h-5 bg-gray-700"></div>
                    <div className="w-2.5 h-2.5 rounded-sm bg-red-400"></div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ride.pickup}</p>
                    <p className="text-sm text-gray-400 mt-2 truncate">{ride.destination}</p>
                </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-800">
                <span>{date}</span>
                <span>{ride.distance} mi · {ride.duration} min · {ride.passengers} pax</span>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function RideHistory() {
    const navigate = useNavigate();
    const { logout, user } = useAuth();

    // Fix 2 — Seed state from localStorage immediately so returning users see
    // their last rides before the first Firestore response arrives.
    // Primary key: 'ridex_ride_history'.  Secondary fallback: 'ridex_rides'
    // (written by BookRide.jsx) so no data gap on first load after this update.
    const [rides, setRides] = useState(() => {
        try {
            const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_FALLBACK);
            return JSON.parse(raw || '[]')
                .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        } catch {
            return [];
        }
    });

    // loading stays true until the first Firestore snapshot (or error) arrives.
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    useEffect(() => {
        // Fix 3 — Wrap the Firestore subscription inside onAuthStateChanged so we
        // only query after Firebase has fully restored the session.  Without this,
        // a page refresh can trigger the query before auth is ready, returning an
        // empty result set even though the user has ride history.
        let firestoreUnsub = null;

        const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
            if (!firebaseUser) {
                // No authenticated user — nothing to load.
                setLoading(false);
                return;
            }

            // Composite index required in Firebase Console:
            //   Collection : rides
            //   Fields     : userId (Ascending) + createdAt (Descending)
            // Firestore returns a console error with a direct creation link if missing.

            // Fix 1 — Server-side sort + limit so only the 20 most recent rides
            // are transferred.  onSnapshot keeps the list live: status updates
            // (e.g. confirmed → ride_started) push automatically.
            const q = query(
                collection(db, 'rides'),
                where('userId', '==', firebaseUser.uid),
                orderBy('createdAt', 'desc'),
                limit(20),
            );

            firestoreUnsub = onSnapshot(
                q,
                (snapshot) => {
                    const data = snapshot.docs.map((d) => {
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
                            // Firestore Timestamps have .toMillis(); plain numbers
                            // (from the localStorage seed) pass through the fallback.
                            createdAt:   r.createdAt?.toMillis?.() ?? r.createdAt ?? 0,
                        };
                    });

                    setRides(data);
                    setLoading(false);

                    // Fix 2 — Keep the dedicated history cache up to date so the
                    // next refresh pre-populates state before the network responds.
                    try {
                        localStorage.setItem(LS_KEY, JSON.stringify(data));
                    } catch {}
                },
                () => {
                    // Firestore rules not yet deployed or network error.
                    // Fall back to whatever is already in state (seeded from
                    // localStorage on mount above), then try refreshing from
                    // the localStorage keys as a last resort.
                    try {
                        const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_FALLBACK);
                        const local = JSON.parse(raw || '[]');
                        setRides(local.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
                    } catch {
                        setError('Could not load rides. Please try again.');
                    }
                    setLoading(false);
                },
            );
        });

        // Tear down both listeners when the component unmounts so we don't
        // accumulate stale subscriptions or trigger state updates after unmount.
        return () => {
            authUnsub();
            if (firestoreUnsub) firestoreUnsub();
        };
    }, []); // empty deps — set up once on mount, cleaned up on unmount

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navbar */}
            <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/book')}
                        className="text-gray-400 hover:text-white transition text-sm"
                    >
                        ← Back
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
                            <span className="text-black font-black text-xs">R</span>
                        </div>
                        <h1 className="text-lg font-black">RideX</h1>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <p className="text-gray-400 text-sm hidden md:block">
                        {user?.displayName || user?.email}
                    </p>
                    <button
                        onClick={() => { logout(); navigate('/'); }}
                        className="text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            <div className="max-w-2xl mx-auto px-6 py-8">
                <h2 className="text-3xl font-black mb-1">Ride History</h2>
                <p className="text-gray-500 text-sm mb-8">Your past and active rides</p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Skeleton: only when loading AND no cached rides are available.
                    Once localStorage data has populated `rides`, we render cards
                    immediately and let Firestore refresh silently in the background.
                    Fix 4: empty state is only shown after loading completes. */}
                {loading && rides.length === 0 ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => <RideCardSkeleton key={i} />)}
                    </div>
                ) : !loading && rides.length === 0 && !error ? (
                    <div className="text-center py-16">
                        <p className="text-5xl mb-4">🚗</p>
                        <p className="font-bold text-lg mb-2">No rides yet.</p>
                        <p className="text-gray-500 text-sm mb-6">Book your first ride!</p>
                        <button
                            onClick={() => navigate('/book')}
                            className="px-6 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                        >
                            Book a ride
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {rides.map((ride) => <RideCard key={ride.id} ride={ride} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

export default RideHistory;
