import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';

const STATUS_LABELS = {
    confirmed:       { label: 'Confirmed',     color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
    driver_assigned: { label: 'Driver On Way', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    driver_arriving: { label: 'Arriving',      color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    ride_started:    { label: 'In Progress',   color: 'text-green-400',  bg: 'bg-green-400/10'  },
    arrived:         { label: 'Completed',     color: 'text-green-400',  bg: 'bg-green-400/10'  },
    completed:       { label: 'Completed',     color: 'text-green-400',  bg: 'bg-green-400/10'  },
    cancelled:       { label: 'Cancelled',     color: 'text-red-400',    bg: 'bg-red-400/10'    },
};

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

function RideHistory() {
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const [rides, setRides]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    useEffect(() => {
        if (!user) return;

        // Simple single-field query — no composite index needed.
        // Sort newest-first client-side after fetching.
        const q = query(
            collection(db, 'rides'),
            where('userId', '==', user.uid)
        );

        getDocs(q)
            .then((snapshot) => {
                const data = snapshot.docs
                    .map((d) => {
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
                            createdAt:   r.createdAt?.toMillis() ?? 0,
                        };
                    })
                    .sort((a, b) => b.createdAt - a.createdAt);
                setRides(data);
            })
            .catch(() => {
                // Firestore rules not yet deployed — fall back to rides saved
                // in localStorage by the booking flow (BookRide.jsx).
                try {
                    const local = JSON.parse(localStorage.getItem('ridex_rides') || '[]');
                    setRides(local.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
                } catch {
                    setError('Could not load rides. Please try again.');
                }
            })
            .finally(() => setLoading(false));
    }, [user]);

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

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-gray-900 rounded-2xl p-5 animate-pulse">
                                <div className="h-4 bg-gray-800 rounded w-1/3 mb-4"></div>
                                <div className="h-3 bg-gray-800 rounded w-2/3 mb-2"></div>
                                <div className="h-3 bg-gray-800 rounded w-1/2"></div>
                            </div>
                        ))}
                    </div>
                ) : rides.length === 0 && !error ? (
                    <div className="text-center py-16">
                        <p className="text-5xl mb-4">🚗</p>
                        <p className="font-bold text-lg mb-2">No rides yet</p>
                        <p className="text-gray-500 text-sm mb-6">Your completed rides will appear here.</p>
                        <button
                            onClick={() => navigate('/book')}
                            className="px-6 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                        >
                            Book your first ride
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
