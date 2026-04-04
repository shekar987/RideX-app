import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    getDocs,
    increment,
    serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';

// Make sure Firestore rules allow:
// - drivers to read/write their own driver document
// - drivers to read rides where status == 'confirmed'
// - drivers to update rides where driverId == their uid

const DRIVER_SHARE = 0.8;

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard({ rows = 3 }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse">
            <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-3 bg-gray-800 rounded mb-2" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
        </div>
    );
}

// ── Star rating display ────────────────────────────────────────────────────────
function Stars({ rating }) {
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
                <svg
                    key={s}
                    className={`w-3.5 h-3.5 ${s <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-700'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </span>
    );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-black ${accent ? 'text-yellow-400' : 'text-white'}`}>{value}</p>
            {sub && <p className="text-gray-500 text-xs">{sub}</p>}
        </div>
    );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function isToday(ts) {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString();
}
function isThisWeek(ts) {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return d >= weekAgo;
}
function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DriverDashboard() {
    const navigate = useNavigate();

    // ── Auth & driver doc ─────────────────────────────────────────────────────
    const [driver, setDriver]           = useState(null);
    const [driverDocId, setDriverDocId] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // ── Rides ─────────────────────────────────────────────────────────────────
    const [availableRides, setAvailableRides] = useState([]);
    const [activeRide, setActiveRide]         = useState(null);
    const [rideHistory, setRideHistory]       = useState([]);
    const [ridesLoading, setRidesLoading]     = useState(true);

    // ── UI ────────────────────────────────────────────────────────────────────
    const [acceptingId, setAcceptingId]   = useState(null);
    const [updatingRide, setUpdatingRide] = useState(false);
    const [onlineToggling, setOnlineToggling] = useState(false);

    // ── Step 1: resolve logged-in user → load driver doc ─────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { navigate('/driver/login', { replace: true }); return; }
            try {
                const q = query(collection(db, 'drivers'), where('uid', '==', user.uid));
                const snap = await getDocs(q);
                if (snap.empty) { navigate('/driver/login', { replace: true }); return; }
                setDriver({ id: snap.docs[0].id, ...snap.docs[0].data() });
                setDriverDocId(snap.docs[0].id);
            } catch {
                navigate('/driver/login', { replace: true });
            } finally {
                setAuthLoading(false);
            }
        });
        return unsub;
    }, [navigate]);

    // ── Step 2: live-sync the driver's own doc ────────────────────────────────
    useEffect(() => {
        if (!driverDocId) return;
        const unsub = onSnapshot(doc(db, 'drivers', driverDocId), (snap) => {
            if (snap.exists()) setDriver({ id: snap.id, ...snap.data() });
        });
        return unsub;
    }, [driverDocId]);

    // ── Step 3: rides listeners (only when driver is loaded) ──────────────────
    useEffect(() => {
        if (!driver) return;
        setRidesLoading(true);

        // Available rides — status == 'confirmed', no driverId
        const availQ = query(collection(db, 'rides'), where('status', '==', 'confirmed'));
        const unsubAvail = onSnapshot(availQ, (snap) => {
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => !r.driverId);
            setAvailableRides(list);
            setRidesLoading(false);
        });

        // Rides assigned to this driver (active + history)
        const myRidesQ = query(collection(db, 'rides'), where('driverId', '==', driver.uid));
        const unsubMy = onSnapshot(myRidesQ, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const active = all.find(r => ['driver_assigned', 'in_progress'].includes(r.status)) || null;
            const history = all
                .filter(r => r.status === 'completed')
                .sort((a, b) => {
                    const ta = a.createdAt?.toMillis?.() ?? 0;
                    const tb = b.createdAt?.toMillis?.() ?? 0;
                    return tb - ta;
                })
                .slice(0, 10);
            setActiveRide(active);
            setRideHistory(history);
        });

        return () => { unsubAvail(); unsubMy(); };
    }, [driver]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleAcceptRide = useCallback(async (ride) => {
        if (!driver || acceptingId || activeRide) return;
        setAcceptingId(ride.id);
        try {
            await updateDoc(doc(db, 'rides', ride.id), {
                driverId:     driver.uid,
                driverName:   driver.name,
                driverCar:    `${driver.vehicleType} • ${driver.vehicleReg}`,
                driverRating: driver.rating,
                status:       'driver_assigned',
                assignedAt:   serverTimestamp(),
            });
        } catch (err) {
            console.error('Accept ride error:', err);
        } finally {
            setAcceptingId(null);
        }
    }, [driver, acceptingId, activeRide]);

    const handlePickedUp = useCallback(async () => {
        if (!activeRide || updatingRide) return;
        setUpdatingRide(true);
        try {
            await updateDoc(doc(db, 'rides', activeRide.id), {
                status:    'in_progress',
                pickedUpAt: serverTimestamp(),
            });
        } finally {
            setUpdatingRide(false);
        }
    }, [activeRide, updatingRide]);

    const handleCompleteRide = useCallback(async () => {
        if (!activeRide || !driverDocId || updatingRide) return;
        setUpdatingRide(true);
        try {
            const fare = activeRide.price ?? 0;
            const driverEarnings = parseFloat((fare * DRIVER_SHARE).toFixed(2));

            await updateDoc(doc(db, 'rides', activeRide.id), {
                status:      'completed',
                completedAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'drivers', driverDocId), {
                earnings:   increment(driverEarnings),
                totalRides: increment(1),
            });
        } finally {
            setUpdatingRide(false);
        }
    }, [activeRide, driverDocId, updatingRide]);

    const handleToggleOnline = useCallback(async () => {
        if (!driverDocId || onlineToggling) return;
        setOnlineToggling(true);
        try {
            await updateDoc(doc(db, 'drivers', driverDocId), {
                isOnline: !driver.isOnline,
            });
        } finally {
            setOnlineToggling(false);
        }
    }, [driver, driverDocId, onlineToggling]);

    const handleLogout = useCallback(async () => {
        await signOut(auth);
        navigate('/driver/login', { replace: true });
    }, [navigate]);

    // ── Earnings computations ─────────────────────────────────────────────────
    const todayEarnings = rideHistory
        .filter(r => isToday(r.completedAt ?? r.createdAt))
        .reduce((sum, r) => sum + (r.price ?? 0) * DRIVER_SHARE, 0);

    const weekEarnings = rideHistory
        .filter(r => isThisWeek(r.completedAt ?? r.createdAt))
        .reduce((sum, r) => sum + (r.price ?? 0) * DRIVER_SHARE, 0);

    const totalEarnings = driver?.earnings ?? 0;
    const platformCommission = totalEarnings / DRIVER_SHARE * (1 - DRIVER_SHARE);

    // ── Loading gate ──────────────────────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                        <span className="text-black font-black text-xl">R</span>
                    </div>
                    <p className="text-white text-sm">Loading dashboard…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── 3a: Navbar ─────────────────────────────────────────────────── */}
            <nav className="sticky top-0 z-10 bg-black border-b border-gray-800">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-black font-black text-sm">R</span>
                        </div>
                        <div>
                            <span className="font-black text-white">
                                Ride<span className="text-yellow-400">X</span>
                            </span>
                            <span className="ml-2 text-gray-500 text-xs hidden sm:inline">Driver</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {driver && (
                            <div className="hidden sm:flex items-center gap-2">
                                <span className="text-gray-300 text-sm font-medium">{driver.name}</span>
                                <Stars rating={driver.rating ?? 5} />
                            </div>
                        )}

                        {/* Online/Offline toggle */}
                        <button
                            onClick={handleToggleOnline}
                            disabled={onlineToggling}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                                driver?.isOnline
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${driver?.isOnline ? 'bg-green-400' : 'bg-gray-500'}`} />
                            {driver?.isOnline ? 'Online' : 'Offline'}
                        </button>

                        <button
                            onClick={handleLogout}
                            className="px-3 py-1.5 border border-gray-700 text-gray-400 text-xs font-bold rounded-full hover:border-red-500 hover:text-red-400 transition"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

                {/* ── 3b: Stats row ───────────────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Overview</h2>
                    {!driver ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[...Array(4)].map((_, i) => <SkeletonCard key={i} rows={2} />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <StatCard
                                label="Today's Earnings"
                                value={`£${todayEarnings.toFixed(2)}`}
                                sub="Your 80% share"
                                accent
                            />
                            <StatCard
                                label="Total Rides"
                                value={driver.totalRides ?? 0}
                                sub="All time"
                            />
                            <StatCard
                                label="Rating"
                                value={`${(driver.rating ?? 5).toFixed(1)}`}
                                sub={<Stars rating={driver.rating ?? 5} />}
                            />
                            <StatCard
                                label="Status"
                                value={driver.isOnline ? 'Online' : 'Offline'}
                                sub={driver.isOnline ? 'Accepting rides' : 'Tap to go online'}
                            />
                        </div>
                    )}
                </section>

                {/* ── 3d: Active ride ─────────────────────────────────────────── */}
                {activeRide && (
                    <section>
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Active Ride</h2>
                        <div className="bg-gray-900 border border-yellow-400/30 rounded-2xl p-5">
                            {/* Progress steps */}
                            <div className="flex items-center gap-2 mb-5">
                                {[
                                    { key: 'driver_assigned', label: 'Assigned' },
                                    { key: 'in_progress',     label: 'Picked Up' },
                                    { key: 'completed',       label: 'Completed' },
                                ].map((step, idx, arr) => {
                                    const statuses = ['driver_assigned', 'in_progress', 'completed'];
                                    const reached  = statuses.indexOf(activeRide.status) >= idx;
                                    return (
                                        <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${reached ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-600'}`}>
                                                {idx + 1}
                                            </div>
                                            <span className={`text-xs font-bold whitespace-nowrap hidden sm:block ${reached ? 'text-white' : 'text-gray-600'}`}>
                                                {step.label}
                                            </span>
                                            {idx < arr.length - 1 && (
                                                <div className={`flex-1 h-0.5 ${reached ? 'bg-yellow-400/50' : 'bg-gray-800'}`} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4 mb-5">
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Customer</p>
                                    <p className="text-white font-bold">{activeRide.userName || '—'}</p>
                                    {activeRide.userPhone && (
                                        <p className="text-gray-400 text-sm">{activeRide.userPhone}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Fare</p>
                                    <p className="text-yellow-400 font-black text-lg">£{((activeRide.price ?? 0) * DRIVER_SHARE).toFixed(2)}</p>
                                    <p className="text-gray-500 text-xs">Your share · Total £{(activeRide.price ?? 0).toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-5">
                                <div className="flex gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400 mt-1 shrink-0" />
                                    <div>
                                        <p className="text-gray-500 text-xs">Pickup</p>
                                        <p className="text-white text-sm font-medium">{activeRide.pickup}</p>
                                    </div>
                                </div>
                                <div className="ml-1 w-0.5 h-4 bg-gray-700" />
                                <div className="flex gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 mt-1 shrink-0" />
                                    <div>
                                        <p className="text-gray-500 text-xs">Destination</p>
                                        <p className="text-white text-sm font-medium">{activeRide.destination}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                {activeRide.status === 'driver_assigned' && (
                                    <button
                                        onClick={handlePickedUp}
                                        disabled={updatingRide}
                                        className="flex-1 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-60 transition text-sm"
                                    >
                                        {updatingRide ? 'Updating…' : 'Picked Up Customer'}
                                    </button>
                                )}
                                {activeRide.status === 'in_progress' && (
                                    <button
                                        onClick={handleCompleteRide}
                                        disabled={updatingRide}
                                        className="flex-1 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 disabled:opacity-60 transition text-sm"
                                    >
                                        {updatingRide ? 'Completing…' : 'Complete Ride'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* ── 3c: Available rides ──────────────────────────────────────── */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                            Available Rides
                        </h2>
                        {!driver?.isOnline && (
                            <span className="text-xs text-yellow-400 font-bold">Go online to accept rides</span>
                        )}
                    </div>

                    {ridesLoading ? (
                        <div className="space-y-3">
                            <SkeletonCard rows={4} />
                            <SkeletonCard rows={4} />
                        </div>
                    ) : !driver?.isOnline ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-4xl mb-3">🚗</p>
                            <p className="text-gray-400 font-bold">You are offline</p>
                            <p className="text-gray-600 text-sm mt-1">Toggle Online in the top bar to see available rides</p>
                        </div>
                    ) : activeRide ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                            <p className="text-gray-400 text-sm font-bold">Complete your current ride to accept a new one</p>
                        </div>
                    ) : availableRides.length === 0 ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-4xl mb-3">🔍</p>
                            <p className="text-gray-400 font-bold">No rides available</p>
                            <p className="text-gray-600 text-sm mt-1">New ride requests will appear here in real time</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {availableRides.map((ride) => (
                                <div
                                    key={ride.id}
                                    className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition"
                                >
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div>
                                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-0.5">Customer</p>
                                            <p className="text-white font-bold">{ride.userName || 'Unknown'}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-yellow-400 font-black text-xl">
                                                £{((ride.price ?? 0) * DRIVER_SHARE).toFixed(2)}
                                            </p>
                                            <p className="text-gray-500 text-xs">
                                                Your share · Total £{(ride.price ?? 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <div className="flex gap-3">
                                            <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                            <div>
                                                <p className="text-gray-500 text-xs">Pickup</p>
                                                <p className="text-white text-sm">{ride.pickup}</p>
                                            </div>
                                        </div>
                                        <div className="ml-0.75 w-0.5 h-3 bg-gray-700 ml-1" />
                                        <div className="flex gap-3">
                                            <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                                            <div>
                                                <p className="text-gray-500 text-xs">Destination</p>
                                                <p className="text-white text-sm">{ride.destination}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
                                        {ride.distance && (
                                            <span className="flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                </svg>
                                                {ride.distance}
                                            </span>
                                        )}
                                        {ride.duration && (
                                            <span className="flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                {ride.duration}
                                            </span>
                                        )}
                                        {ride.rideType && (
                                            <span className="bg-gray-800 px-2 py-0.5 rounded-full capitalize">
                                                {ride.rideType}
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleAcceptRide(ride)}
                                        disabled={acceptingId === ride.id || !!activeRide}
                                        className="w-full py-2.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                                    >
                                        {acceptingId === ride.id ? 'Accepting…' : 'Accept Ride'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── 3f: Earnings summary ─────────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Earnings Summary</h2>
                    {!driver ? (
                        <SkeletonCard rows={4} />
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Today</p>
                                    <p className="text-white font-black text-xl">£{todayEarnings.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">This Week</p>
                                    <p className="text-white font-black text-xl">£{weekEarnings.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">All Time</p>
                                    <p className="text-yellow-400 font-black text-xl">£{totalEarnings.toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="border-t border-gray-800 pt-4">
                                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">Commission breakdown (all time)</p>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-300 text-sm">Your earnings (80%)</span>
                                        <span className="text-yellow-400 font-bold">£{totalEarnings.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Platform commission — Amit (20%)</span>
                                        <span className="text-gray-400 font-bold">£{platformCommission.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-gray-800 pt-2">
                                        <span className="text-gray-300 text-sm font-bold">Total fare collected</span>
                                        <span className="text-white font-bold">
                                            £{(totalEarnings + platformCommission).toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                {/* Visual bar */}
                                <div className="mt-4">
                                    <div className="flex rounded-full overflow-hidden h-2">
                                        <div className="bg-yellow-400 h-full" style={{ width: '80%' }} />
                                        <div className="bg-gray-700 h-full" style={{ width: '20%' }} />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                                        <span>You 80%</span>
                                        <span>Platform 20%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* ── 3e: Ride history ─────────────────────────────────────────── */}
                <section className="pb-8">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                        Recent Completed Rides
                    </h2>

                    {ridesLoading ? (
                        <div className="space-y-3">
                            <SkeletonCard rows={3} />
                            <SkeletonCard rows={3} />
                            <SkeletonCard rows={3} />
                        </div>
                    ) : rideHistory.length === 0 ? (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                            <p className="text-3xl mb-3">📋</p>
                            <p className="text-gray-400 font-bold">No completed rides yet</p>
                            <p className="text-gray-600 text-sm mt-1">Completed rides will appear here</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {rideHistory.map((ride) => (
                                <div
                                    key={ride.id}
                                    className="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                                                <span className="text-white text-sm truncate">{ride.pickup}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                                                <span className="text-gray-400 text-sm truncate">{ride.destination}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-yellow-400 font-black">
                                                £{((ride.price ?? 0) * DRIVER_SHARE).toFixed(2)}
                                            </p>
                                            <p className="text-gray-600 text-xs">
                                                of £{(ride.price ?? 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-gray-600 text-xs mt-2">
                                        {formatDate(ride.completedAt ?? ride.createdAt)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
