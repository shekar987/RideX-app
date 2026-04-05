import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

function DriverHistory({ driver }) {
    const [rides, setRides] = useState(null);

    useEffect(() => {
        if (!driver?.uid) return;
        const q = query(
            collection(db, 'rides'),
            where('driverId', '==', driver.uid),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(20)
        );
        const unsub = onSnapshot(q, (snap) => {
            setRides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [driver]);

    if (!rides) {
        return (
            <div className="space-y-3 animate-pulse">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-28 bg-gray-800 rounded-2xl" />
                ))}
            </div>
        );
    }

    if (rides.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <p className="text-4xl mb-3">🏁</p>
                <p className="text-white font-bold mb-1">No completed rides yet</p>
                <p className="text-gray-400 text-sm">Accept your first ride to get started!</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {rides.map((ride) => {
                const completedDate = ride.completedAt?.toDate
                    ? ride.completedAt.toDate()
                    : null;
                const dateStr = completedDate
                    ? completedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—';
                const timeStr = completedDate
                    ? completedDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '';

                return (
                    <div key={ride.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                        {/* Date / earnings row */}
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-xs text-gray-400">{dateStr} · {timeStr}</p>
                                <p className="text-sm font-bold text-white mt-0.5">{ride.userName || 'Customer'}</p>
                            </div>
                            <p className="text-yellow-400 font-black text-lg">
                                +£{parseFloat(ride.driverEarnings || 0).toFixed(2)}
                            </p>
                        </div>

                        {/* Route */}
                        <div className="bg-black rounded-xl p-3 mb-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                                <p className="text-xs text-gray-300 truncate">{ride.pickup || '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                <p className="text-xs text-gray-300 truncate">{ride.destination || '—'}</p>
                            </div>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                            {ride.distance && <span>📍 {ride.distance}</span>}
                            {ride.duration && <span>⏱ {ride.duration}</span>}
                            <span className="ml-auto text-gray-500">
                                Total: £{parseFloat(ride.price || 0).toFixed(2)}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default DriverHistory;
