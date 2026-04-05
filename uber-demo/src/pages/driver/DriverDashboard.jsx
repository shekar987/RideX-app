import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
    collection, doc, query, where, orderBy, limit,
    onSnapshot, updateDoc, runTransaction, serverTimestamp, increment, getDoc
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import RideNotification from '../../components/RideNotification';
import DriverEarnings from './DriverEarnings';
import DriverHistory from './DriverHistory';
import DriverProfile from './DriverProfile';

mapboxgl.accessToken = [
    'pk',
    'eyJ1Ijoic2hla2FyLTEyMyIsImEiOiJjbW5oZmtrYzQwMXNlMm9zOWt6dHBncm81In0',
    'M4q-T3CbJzukA8-runeVxw',
].join('.');

// ── Mini Mapbox map for active ride ─────────────────────────────────────────
function RideMap({ ride, driverLat, driverLng }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        const center = ride?.pickupLat
            ? [ride.pickupLng, ride.pickupLat]
            : [-0.1276, 51.5074];
        mapRef.current = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center,
            zoom: 12,
        });
        return () => {
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!mapRef.current) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        const addMarker = (lng, lat, color) => {
            const el = document.createElement('div');
            el.style.cssText = `width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid white;box-shadow:0 0 8px ${color}80`;
            const m = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(mapRef.current);
            markersRef.current.push(m);
        };

        if (ride?.pickupLat) addMarker(ride.pickupLng, ride.pickupLat, '#22C55E');
        if (ride?.destinationLat) addMarker(ride.destinationLng, ride.destinationLat, '#EF4444');
        if (driverLat && driverLng) addMarker(driverLng, driverLat, '#FACC15');

        // Fit bounds
        const points = [
            ride?.pickupLat && [ride.pickupLng, ride.pickupLat],
            ride?.destinationLat && [ride.destinationLng, ride.destinationLat],
            driverLat && driverLng && [driverLng, driverLat],
        ].filter(Boolean);

        if (points.length > 1 && mapRef.current) {
            const bounds = points.reduce(
                (b, p) => b.extend(p),
                new mapboxgl.LngLatBounds(points[0], points[0])
            );
            mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 15 });
        }
    }, [ride, driverLat, driverLng]);

    return <div ref={containerRef} className="w-full h-40 rounded-xl overflow-hidden" />;
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ small = false }) {
    return (
        <svg
            className={`animate-spin ${small ? 'w-4 h-4' : 'w-5 h-5'}`}
            viewBox="0 0 24 24"
            fill="none"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
    useEffect(() => {
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);
    const bg = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-gray-700';
    return (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${bg} text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-xl max-w-xs text-center`}>
            {message}
        </div>
    );
}

// ── Receipt modal ────────────────────────────────────────────────────────────
function ReceiptModal({ ride, driverEarnings, platformFee, onClose }) {
    if (!ride) return null;
    const completedAt = new Date().toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white mb-1">Ride Complete!</h2>
                <p className="text-gray-400 text-xs mb-5">{completedAt}</p>

                <div className="bg-black rounded-xl p-4 mb-4 space-y-2 text-left">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{ride.pickup}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{ride.destination}</p>
                    </div>
                    <div className="flex gap-4 pt-1 text-xs text-gray-500">
                        {ride.distance && <span>📍 {ride.distance}</span>}
                        {ride.duration && <span>⏱ {ride.duration}</span>}
                    </div>
                </div>

                <div className="space-y-2 mb-5">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Customer paid</span>
                        <span className="text-white font-bold">£{parseFloat(ride.price || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Platform fee (20%)</span>
                        <span className="text-gray-400">-£{parseFloat(platformFee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-800 pt-2">
                        <span className="text-white font-bold">Your earnings (80%)</span>
                        <span className="text-yellow-400 font-black text-xl">£{parseFloat(driverEarnings).toFixed(2)}</span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                >
                    Done
                </button>
            </div>
        </div>
    );
}

// ── Available ride card ──────────────────────────────────────────────────────
function AvailableRideCard({ ride, onAccept, accepting }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-yellow-400/10 rounded-full flex items-center justify-center text-lg">👤</div>
                <div>
                    <p className="font-bold text-white text-sm">{ride.userName || 'Customer'}</p>
                    <p className="text-yellow-400 text-xs">★ 5.0</p>
                </div>
                <div className="ml-auto text-right">
                    <p className="text-white font-black text-lg">£{parseFloat(ride.price || 0).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">Total fare</p>
                </div>
            </div>

            <div className="bg-black rounded-xl p-3 mb-3 space-y-1.5">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    <p className="text-xs text-gray-300 truncate">{ride.pickup}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <p className="text-xs text-gray-300 truncate">{ride.destination}</p>
                </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                {ride.distance && <span>📍 {ride.distance}</span>}
                {ride.duration && <span>⏱ {ride.duration}</span>}
                <span className="ml-auto text-yellow-400 font-black">
                    Your cut: £{(parseFloat(ride.price || 0) * 0.8).toFixed(2)}
                </span>
            </div>

            <button
                onClick={() => onAccept(ride)}
                disabled={accepting}
                className="w-full py-2.5 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
                {accepting ? <><Spinner small /> Accepting…</> : 'Accept Ride'}
            </button>
        </div>
    );
}

// ── Active ride section ──────────────────────────────────────────────────────
function ActiveRideSection({ ride, driver, driverLat, driverLng, onComplete }) {
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), []);

    const updateStatus = async (newStatus, extraFields = {}) => {
        setActionLoading(true);
        try {
            await updateDoc(doc(db, 'rides', ride.id), {
                status: newStatus,
                ...extraFields,
                updatedAt: serverTimestamp(),
            });
        } catch {
            showToast('Failed to update status. Try again.', 'error');
        }
        setActionLoading(false);
    };

    const handleComplete = async () => {
        setActionLoading(true);
        try {
            const fare = parseFloat(ride.price || 0);
            const driverEarnings = fare * 0.8;
            const platformFee = fare * 0.2;

            await updateDoc(doc(db, 'rides', ride.id), {
                status: 'completed',
                completedAt: serverTimestamp(),
                driverEarnings,
                platformFee,
            });

            await updateDoc(doc(db, 'drivers', driver.uid), {
                earnings: increment(driverEarnings),
                todayEarnings: increment(driverEarnings),
                weekEarnings: increment(driverEarnings),
                totalRides: increment(1),
            });

            onComplete({ ride, driverEarnings, platformFee });
        } catch {
            showToast('Failed to complete ride. Try again.', 'error');
        }
        setActionLoading(false);
    };

    const statusConfig = {
        driver_assigned: {
            badge: 'Driver Assigned',
            badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            action: 'Arrived at Pickup',
            nextStatus: 'arrived',
        },
        arrived: {
            badge: 'Arrived at Pickup',
            badgeColor: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
            action: 'Start Ride',
            nextStatus: 'in_progress',
        },
        in_progress: {
            badge: 'In Progress',
            badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
            action: 'Complete Ride',
            nextStatus: 'completed',
        },
    };

    const cfg = statusConfig[ride.status];

    return (
        <>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            <div className="bg-gray-900 border border-yellow-400/30 rounded-2xl p-4">
                <div className={`inline-flex items-center border rounded-full px-3 py-1 text-xs font-bold mb-4 ${cfg?.badgeColor || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {cfg?.badge || ride.status}
                </div>

                {/* Customer info */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-400/10 rounded-full flex items-center justify-center text-xl">👤</div>
                    <div>
                        <p className="font-bold text-white">{ride.userName || 'Customer'}</p>
                        {ride.userPhone && (
                            <a href={`tel:${ride.userPhone}`} className="text-yellow-400 text-sm hover:underline">
                                📞 {ride.userPhone}
                            </a>
                        )}
                    </div>
                    <div className="ml-auto text-right">
                        <p className="text-yellow-400 font-black text-lg">£{(parseFloat(ride.price || 0) * 0.8).toFixed(2)}</p>
                        <p className="text-xs text-gray-400">Your share</p>
                    </div>
                </div>

                {/* Route */}
                <div className="bg-black rounded-xl p-3 mb-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{ride.pickup}</p>
                    </div>
                    <div className="w-px h-3 bg-gray-700 ml-1" />
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{ride.destination}</p>
                    </div>
                </div>

                <div className="flex gap-4 text-xs text-gray-400 mb-4">
                    {ride.distance && <span>📍 {ride.distance}</span>}
                    {ride.duration && <span>⏱ {ride.duration}</span>}
                    <span className="ml-auto text-white font-bold">£{parseFloat(ride.price || 0).toFixed(2)}</span>
                </div>

                {/* Map */}
                <div className="mb-4">
                    <RideMap ride={ride} driverLat={driverLat} driverLng={driverLng} />
                </div>

                {/* Action button */}
                {cfg && (
                    ride.status === 'in_progress' ? (
                        <button
                            onClick={handleComplete}
                            disabled={actionLoading}
                            className="w-full py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {actionLoading ? <><Spinner small /> Completing…</> : '✅ Complete Ride'}
                        </button>
                    ) : (
                        <button
                            onClick={() => updateStatus(cfg.nextStatus)}
                            disabled={actionLoading}
                            className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {actionLoading ? <><Spinner small /> Updating…</> : cfg.action}
                        </button>
                    )
                )}
            </div>
        </>
    );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function DriverDashboard() {
    const [driver, setDriver] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [activeTab, setActiveTab] = useState('rides');
    const [availableRides, setAvailableRides] = useState([]);
    const [activeRide, setActiveRide] = useState(null);
    const [notification, setNotification] = useState(null);
    const [accepting, setAccepting] = useState(false);
    const [toast, setToast] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [driverLat, setDriverLat] = useState(null);
    const [driverLng, setDriverLng] = useState(null);
    const [togglingOnline, setTogglingOnline] = useState(false);

    const seenRideIds = useRef(new Set());
    const uid = auth.currentUser?.uid;

    const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), []);

    // ── Load driver document ──────────────────────────────────────────────────
    useEffect(() => {
        if (!uid) return;
        const unsub = onSnapshot(doc(db, 'drivers', uid), (snap) => {
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() };
                setDriver(data);
                setIsOnline(data.isOnline || false);
            }
        });
        return unsub;
    }, [uid]);

    // ── Available rides listener ──────────────────────────────────────────────
    useEffect(() => {
        if (!isOnline || !uid) {
            setAvailableRides([]);
            return;
        }
        const q = query(
            collection(db, 'rides'),
            where('status', '==', 'confirmed'),
            where('driverId', '==', null),
            orderBy('createdAt', 'desc'),
            limit(10)
        );
        const unsub = onSnapshot(q, (snap) => {
            const rides = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setAvailableRides(rides);

            // Trigger notification for new rides not yet seen
            rides.forEach((ride) => {
                if (!seenRideIds.current.has(ride.id)) {
                    seenRideIds.current.add(ride.id);
                    setNotification(ride);
                }
            });
        });
        return unsub;
    }, [isOnline, uid]);

    // ── Active ride listener ──────────────────────────────────────────────────
    useEffect(() => {
        if (!uid) return;
        const q = query(
            collection(db, 'rides'),
            where('driverId', '==', uid),
            where('status', 'in', ['driver_assigned', 'arrived', 'in_progress'])
        );
        const unsub = onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const d = snap.docs[0];
                setActiveRide({ id: d.id, ...d.data() });
            } else {
                setActiveRide(null);
            }
        });
        return unsub;
    }, [uid]);

    // ── Location tracking ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOnline || !driver) return;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setDriverLat(pos.coords.latitude);
                setDriverLng(pos.coords.longitude);
                updateDoc(doc(db, 'drivers', driver.uid), {
                    currentLat: pos.coords.latitude,
                    currentLng: pos.coords.longitude,
                    lastSeen: serverTimestamp(),
                });
            },
            (err) => console.warn('Location error:', err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [isOnline, driver]);

    // ── Toggle online status ──────────────────────────────────────────────────
    const toggleOnline = async () => {
        if (!driver) return;
        setTogglingOnline(true);
        const next = !isOnline;
        try {
            await updateDoc(doc(db, 'drivers', driver.uid), { isOnline: next });
            setIsOnline(next);
            if (!next) setAvailableRides([]);
        } catch {
            showToast('Failed to update status.', 'error');
        }
        setTogglingOnline(false);
    };

    // ── Accept ride ───────────────────────────────────────────────────────────
    const handleAccept = async (ride) => {
        setAccepting(true);
        setNotification(null);
        try {
            await runTransaction(db, async (transaction) => {
                const rideRef = doc(db, 'rides', ride.id);
                const rideSnap = await transaction.get(rideRef);
                if (!rideSnap.exists() || rideSnap.data().driverId !== null) {
                    throw new Error('Already taken');
                }
                transaction.update(rideRef, {
                    driverId: driver.uid,
                    driverName: driver.name,
                    driverCar: `${driver.vehicleMake} • ${driver.vehicleReg}`,
                    driverRating: driver.rating,
                    driverPhone: driver.phone,
                    status: 'driver_assigned',
                    assignedAt: serverTimestamp(),
                });
            });
            showToast('Ride accepted! Head to pickup location.', 'success');
            setActiveTab('rides');
        } catch (err) {
            if (err.message === 'Already taken') {
                showToast('Sorry, this ride was taken by another driver.', 'error');
            } else {
                showToast('Failed to accept ride. Please try again.', 'error');
            }
        }
        setAccepting(false);
    };

    const handleDeclineNotification = () => setNotification(null);

    const handleRideComplete = async (data) => {
        setReceipt(data);
        // Refresh driver stats from Firestore
        if (uid) {
            const snap = await getDoc(doc(db, 'drivers', uid));
            if (snap.exists()) setDriver({ id: snap.id, ...snap.data() });
        }
    };

    const handleDriverUpdate = (updates) => {
        setDriver((prev) => ({ ...prev, ...updates }));
    };

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (!driver) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                        <span className="text-black font-black text-xl">R</span>
                    </div>
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'rides', label: 'Rides', icon: '🚗' },
        { id: 'earnings', label: 'Earnings', icon: '💷' },
        { id: 'history', label: 'History', icon: '📋' },
        { id: 'profile', label: 'Profile', icon: '👤' },
    ];

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Notification popup */}
            {notification && (
                <RideNotification
                    ride={notification}
                    onAccept={() => handleAccept(notification)}
                    onDecline={handleDeclineNotification}
                />
            )}

            {/* Receipt modal */}
            {receipt && (
                <ReceiptModal
                    ride={receipt.ride}
                    driverEarnings={receipt.driverEarnings}
                    platformFee={receipt.platformFee}
                    onClose={() => setReceipt(null)}
                />
            )}

            {/* Toast */}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* ── Navbar ─────────────────────────────────────────────────── */}
            <nav className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-gray-800 px-4 py-3">
                <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
                    {/* Logo */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
                            <span className="text-black font-black text-xs">R</span>
                        </div>
                        <span className="font-black text-base">RideX</span>
                    </div>

                    {/* Driver name + photo */}
                    <div className="flex items-center gap-2 min-w-0">
                        {driver.profilePhoto ? (
                            <img src={driver.profilePhoto} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-7 h-7 bg-yellow-400/10 rounded-full flex items-center justify-center shrink-0 text-sm">👤</div>
                        )}
                        <span className="text-sm font-bold truncate">{driver.name}</span>
                    </div>

                    {/* Online toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${isOnline ? 'text-green-400' : 'text-gray-500'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                        <button
                            onClick={toggleOnline}
                            disabled={togglingOnline}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none ${isOnline ? 'bg-green-500' : 'bg-gray-700'}`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${isOnline ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Stats bar ──────────────────────────────────────────────── */}
            <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
                <div className="max-w-2xl mx-auto grid grid-cols-4 gap-2">
                    {[
                        { label: "Today", value: `£${parseFloat(driver.todayEarnings || 0).toFixed(2)}` },
                        { label: "Rides", value: driver.totalRides || 0 },
                        { label: "Rating", value: `★ ${parseFloat(driver.rating || 5).toFixed(1)}` },
                        { label: "Status", value: isOnline ? 'Online' : 'Offline', color: isOnline ? 'text-green-400' : 'text-gray-500' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="text-center">
                            <p className={`text-sm font-black ${color || 'text-yellow-400'}`}>{value}</p>
                            <p className="text-xs text-gray-500">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Tab bar ────────────────────────────────────────────────── */}
            <div className="sticky top-[57px] z-30 bg-black border-b border-gray-800">
                <div className="max-w-2xl mx-auto flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 text-xs font-bold flex flex-col items-center gap-0.5 transition ${
                                activeTab === tab.id
                                    ? 'text-yellow-400 border-b-2 border-yellow-400'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <span className="text-base">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tab content ────────────────────────────────────────────── */}
            <div className="max-w-2xl mx-auto px-4 py-5 pb-10">
                {/* TAB 1 — Rides */}
                {activeTab === 'rides' && (
                    <div className="space-y-5">
                        {/* Active ride */}
                        {activeRide && (
                            <div>
                                <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-3">Active Ride</p>
                                <ActiveRideSection
                                    ride={activeRide}
                                    driver={driver}
                                    driverLat={driverLat}
                                    driverLng={driverLng}
                                    onComplete={handleRideComplete}
                                />
                            </div>
                        )}

                        {/* Available rides */}
                        {isOnline ? (
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    Available Rides {availableRides.length > 0 && `(${availableRides.length})`}
                                </p>
                                {availableRides.length === 0 ? (
                                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                                        <p className="text-3xl mb-2">🔍</p>
                                        <p className="text-white font-bold mb-1">No rides available</p>
                                        <p className="text-gray-400 text-sm">Hang tight, new ride requests will appear here.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {availableRides.map((ride) => (
                                            <AvailableRideCard
                                                key={ride.id}
                                                ride={ride}
                                                onAccept={handleAccept}
                                                accepting={accepting}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            !activeRide && (
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                                    <p className="text-4xl mb-3">💤</p>
                                    <p className="text-white font-bold mb-1">You're offline</p>
                                    <p className="text-gray-400 text-sm">Toggle the switch above to go online and start receiving rides.</p>
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* TAB 2 — Earnings */}
                {activeTab === 'earnings' && <DriverEarnings driver={driver} />}

                {/* TAB 3 — History */}
                {activeTab === 'history' && <DriverHistory driver={driver} />}

                {/* TAB 4 — Profile */}
                {activeTab === 'profile' && (
                    <DriverProfile driver={driver} onDriverUpdate={handleDriverUpdate} />
                )}
            </div>
        </div>
    );
}

export default DriverDashboard;
