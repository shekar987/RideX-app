import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import {
    collection, query, where, onSnapshot, doc,
    updateDoc, getDocs, increment, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import {
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { auth, db } from '../../firebase';

// Create these composite indexes in Firebase Console:
// 1. rides: status (ASC) + driverId (ASC) + createdAt (DESC)
// 2. rides: driverId (ASC) + status (ASC) + completedAt (DESC)
// 3. drivers: isOnline (ASC) + status (ASC)

const DRIVER_SHARE   = 0.8;
const NOTIF_DURATION = 15; // seconds

// ── Audio notification ────────────────────────────────────────────────────────
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch {}
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function tsToDate(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate() : new Date(ts);
}
function isToday(ts) {
    const d = tsToDate(ts);
    if (!d) return false;
    return d.toDateString() === new Date().toDateString();
}
function isThisWeek(ts) {
    const d = tsToDate(ts);
    if (!d) return false;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    return d >= weekAgo;
}
function formatDate(ts) {
    const d = tsToDate(ts);
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}
function getLast7Days() {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        d.setHours(0, 0, 0, 0);
        return d;
    });
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonCard({ rows = 3 }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse">
            <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-3 bg-gray-800 rounded mb-2"
                    style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
        </div>
    );
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 'sm' }) {
    const sz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <svg key={s} className={`${sz} ${s <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-700'}`}
                    fill="currentColor" viewBox="0 0 20 20">
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
            {sub && <div className="text-gray-500 text-xs">{sub}</div>}
        </div>
    );
}

// ── Ride notification popup ───────────────────────────────────────────────────
function RideNotification({ ride, countdown, onAccept, onDecline }) {
    const progress = (countdown / NOTIF_DURATION) * 100;
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4
                        animate-[slideDown_0.3s_ease-out]">
            <div className="bg-gray-900 border border-yellow-400/40 rounded-2xl shadow-2xl shadow-yellow-400/10 overflow-hidden">
                {/* Countdown bar */}
                <div className="h-1 bg-gray-800">
                    <div
                        className="h-full bg-yellow-400 transition-all duration-1000"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-yellow-400 text-xs font-black uppercase tracking-wider">
                                New Ride Request
                            </span>
                        </div>
                        <span className="text-gray-400 text-xs font-bold">{countdown}s</span>
                    </div>

                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <p className="text-white font-bold text-sm">{ride.userName || 'Customer'}</p>
                            {ride.distance && (
                                <p className="text-gray-400 text-xs">{ride.distance} · {ride.duration}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-yellow-400 font-black">
                                £{((ride.price ?? 0) * DRIVER_SHARE).toFixed(2)}
                            </p>
                            <p className="text-gray-500 text-xs">your share</p>
                        </div>
                    </div>

                    <div className="space-y-1.5 mb-4 text-xs">
                        <div className="flex gap-2 items-start">
                            <span className="w-2 h-2 rounded-full bg-green-400 mt-0.5 shrink-0" />
                            <span className="text-gray-300 truncate">{ride.pickup}</span>
                        </div>
                        <div className="flex gap-2 items-start">
                            <span className="w-2 h-2 rounded-full bg-red-400 mt-0.5 shrink-0" />
                            <span className="text-gray-400 truncate">{ride.destination}</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onAccept}
                            className="flex-1 py-2.5 bg-green-500 text-white font-black rounded-xl
                                       hover:bg-green-400 transition text-sm"
                        >
                            Accept
                        </button>
                        <button
                            onClick={onDecline}
                            className="flex-1 py-2.5 bg-gray-800 text-gray-300 font-bold rounded-xl
                                       hover:bg-gray-700 transition text-sm"
                        >
                            Decline
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Ride receipt modal ────────────────────────────────────────────────────────
function RideReceipt({ ride, onClose }) {
    const fare          = ride.price ?? 0;
    const driverEarns   = ride.driverEarnings ?? fare * DRIVER_SHARE;
    const platformFee   = ride.platformFee    ?? fare * (1 - DRIVER_SHARE);

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-sm overflow-hidden">
                {/* Header */}
                <div className="bg-green-500/10 border-b border-gray-800 p-5 text-center">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <p className="text-white font-black text-lg">Ride Completed!</p>
                    <p className="text-gray-400 text-xs mt-0.5">{formatDate(ride.completedAt ?? ride.createdAt)}</p>
                </div>

                {/* Route */}
                <div className="p-5 border-b border-gray-800 space-y-2">
                    <div className="flex gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400 mt-1 shrink-0" />
                        <div>
                            <p className="text-gray-500 text-xs">Pickup</p>
                            <p className="text-white text-sm">{ride.pickup}</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400 mt-1 shrink-0" />
                        <div>
                            <p className="text-gray-500 text-xs">Destination</p>
                            <p className="text-white text-sm">{ride.destination}</p>
                        </div>
                    </div>
                    {ride.distance && (
                        <p className="text-gray-500 text-xs pl-5">
                            {ride.distance} · {ride.duration}
                        </p>
                    )}
                </div>

                {/* Fare breakdown */}
                <div className="p-5 space-y-2 border-b border-gray-800">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total fare</span>
                        <span className="text-white font-bold">£{fare.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Platform fee (20%)</span>
                        <span className="text-gray-400">−£{platformFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-gray-800 pt-2">
                        <span className="text-yellow-400 font-bold">Your earnings (80%)</span>
                        <span className="text-yellow-400 font-black">£{driverEarns.toFixed(2)}</span>
                    </div>
                    {ride.rideType && (
                        <p className="text-gray-600 text-xs capitalize">
                            Payment: {ride.rideType} · card
                        </p>
                    )}
                </div>

                <div className="p-4">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl
                                   hover:bg-yellow-300 transition text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Mapbox active ride map ─────────────────────────────────────────────────────
function ActiveRideMap({ driver, ride }) {
    const mapContainer = useRef(null);
    const mapInstance  = useRef(null);

    useEffect(() => {
        const token = process.env.REACT_APP_MAPBOX_TOKEN;
        if (!token || !mapContainer.current) return;

        mapboxgl.accessToken = token;

        const pickupLng = ride.driverLng ?? 0;
        const pickupLat = ride.driverLat ?? 0;
        const driverLng = driver.currentLng ?? pickupLng;
        const driverLat = driver.currentLat ?? pickupLat;

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [pickupLng, pickupLat],
            zoom: 13,
            attributionControl: false,
        });

        mapInstance.current = map;

        map.on('load', () => {
            // Driver marker (blue animated pulse)
            const driverEl = document.createElement('div');
            driverEl.className = 'relative';
            driverEl.innerHTML = `
                <div style="width:16px;height:16px;background:#3B82F6;border-radius:50%;border:2px solid white;position:relative;z-index:2;"></div>
                <div style="width:32px;height:32px;background:#3B82F640;border-radius:50%;position:absolute;top:-8px;left:-8px;animation:pulse 2s infinite;"></div>
            `;
            new mapboxgl.Marker({ element: driverEl })
                .setLngLat([driverLng, driverLat])
                .setPopup(new mapboxgl.Popup().setHTML('<p style="color:#000;font-size:12px;font-weight:bold;">You</p>'))
                .addTo(map);

            // Pickup marker (green)
            const pickupEl = document.createElement('div');
            pickupEl.style.cssText = 'width:14px;height:14px;background:#22C55E;border-radius:50%;border:2px solid white;';
            new mapboxgl.Marker({ element: pickupEl })
                .setLngLat([pickupLng, pickupLat])
                .setPopup(new mapboxgl.Popup().setHTML('<p style="color:#000;font-size:12px;">Pickup</p>'))
                .addTo(map);

            // Route line
            if (pickupLng !== 0 && driverLng !== pickupLng) {
                map.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [[driverLng, driverLat], [pickupLng, pickupLat]],
                        },
                    },
                });
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    paint: { 'line-color': '#3B82F6', 'line-width': 3, 'line-dasharray': [2, 2] },
                });
            }
        });

        return () => { map.remove(); mapInstance.current = null; };
    }, [ride.id, driver.currentLat, driver.currentLng]); // eslint-disable-line

    if (!process.env.REACT_APP_MAPBOX_TOKEN) return null;

    return (
        <div
            ref={mapContainer}
            className="w-full h-48 rounded-xl overflow-hidden mb-4 border border-gray-800"
        />
    );
}

// ── Recharts custom tooltip ───────────────────────────────────────────────────
function EarningsTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs">
            <p className="text-gray-400 mb-0.5">{label}</p>
            <p className="text-yellow-400 font-black">£{payload[0].value.toFixed(2)}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Main Dashboard ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export default function DriverDashboard() {
    const navigate = useNavigate();

    // ── Core data ─────────────────────────────────────────────────────────────
    const [driver,      setDriver]      = useState(null);
    const [driverDocId, setDriverDocId] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // ── Rides ─────────────────────────────────────────────────────────────────
    const [availableRides, setAvailableRides] = useState([]);
    const [activeRide,     setActiveRide]     = useState(null);
    const [rideHistory,    setRideHistory]    = useState([]);
    const [ridesLoading,   setRidesLoading]   = useState(true);

    // ── Notification ──────────────────────────────────────────────────────────
    const [notification,    setNotification]    = useState(null);
    const [notifCountdown,  setNotifCountdown]  = useState(NOTIF_DURATION);
    const seenRideIds  = useRef(new Set());
    const driverRef    = useRef(null);
    const activeRideRef = useRef(null);

    // ── Receipt modal ─────────────────────────────────────────────────────────
    const [receipt, setReceipt] = useState(null);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [activeTab,      setActiveTab]      = useState('rides');
    const [acceptingId,    setAcceptingId]    = useState(null);
    const [acceptError,    setAcceptError]    = useState('');
    const [updatingRide,   setUpdatingRide]   = useState(false);
    const [rideError,      setRideError]      = useState('');
    const [onlineToggling, setOnlineToggling] = useState(false);

    // ── Profile edit ──────────────────────────────────────────────────────────
    const [editMode,   setEditMode]   = useState(false);
    const [editName,   setEditName]   = useState('');
    const [editPhone,  setEditPhone]  = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editError,  setEditError]  = useState('');

    // Keep refs in sync for use inside Firestore callbacks
    useEffect(() => { driverRef.current    = driver;    }, [driver]);
    useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);

    // ── Step 1: Auth → load driver doc ────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { navigate('/driver/login', { replace: true }); return; }
            try {
                const snap = await getDocs(
                    query(collection(db, 'drivers'), where('uid', '==', user.uid))
                );
                if (snap.empty) { navigate('/driver/login', { replace: true }); return; }
                const data = snap.docs[0].data();
                setDriver({ id: snap.docs[0].id, ...data });
                setDriverDocId(snap.docs[0].id);
                setEditName(data.name ?? '');
                setEditPhone(data.phone ?? '');
            } catch {
                navigate('/driver/login', { replace: true });
            } finally {
                setAuthLoading(false);
            }
        });
        return unsub;
    }, [navigate]);

    // ── Step 2: Live-sync driver doc ──────────────────────────────────────────
    useEffect(() => {
        if (!driverDocId) return;
        const unsub = onSnapshot(doc(db, 'drivers', driverDocId), snap => {
            if (snap.exists()) setDriver(prev => ({ ...prev, ...snap.data(), id: snap.id }));
        });
        return unsub;
    }, [driverDocId]);

    // ── Step 3: Rides listeners ───────────────────────────────────────────────
    // Depends on driver.uid only (not full driver object) to avoid re-subscribing
    // every time the driver doc updates in Firestore.
    const driverUid = driver?.uid;

    useEffect(() => {
        if (!driverUid) return;
        setRidesLoading(true);

        // Bug 3 fix: query status=='confirmed', filter out any ride with a driverId
        // (handles null, undefined, and empty string cases)
        const availQ = query(
            collection(db, 'rides'),
            where('status', '==', 'confirmed')
        );
        const unsubAvail = onSnapshot(availQ, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const open = all.filter(r => !r.driverId || r.driverId === '');

            // Feature 1: detect new rides and fire notification
            const currentDriver = driverRef.current;
            const currentActive = activeRideRef.current;
            const isDriverOnline = currentDriver?.isOnline;

            if (isDriverOnline && !currentActive) {
                const newRides = open.filter(r => !seenRideIds.current.has(r.id));
                if (newRides.length > 0) {
                    setNotification(newRides[0]);
                    playNotificationSound();
                }
            }
            open.forEach(r => seenRideIds.current.add(r.id));

            setAvailableRides(open);
            setRidesLoading(false);
        });

        // Active + completed rides for this driver
        const myQ = query(collection(db, 'rides'), where('driverId', '==', driverUid));
        const unsubMy = onSnapshot(myQ, snap => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const active = all.find(r =>
                r.status === 'driver_assigned' || r.status === 'in_progress'
            ) ?? null;
            const history = all
                .filter(r => r.status === 'completed')
                .sort((a, b) => {
                    const ta = a.completedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
                    const tb = b.completedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
                    return tb - ta;
                });
            setActiveRide(active);
            setRideHistory(history);
        });

        return () => { unsubAvail(); unsubMy(); };
    }, [driverUid]);

    // ── Feature 2: Live location tracking ────────────────────────────────────
    useEffect(() => {
        if (!driver?.isOnline || !driverDocId) return;
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            pos => {
                updateDoc(doc(db, 'drivers', driverDocId), {
                    currentLat: pos.coords.latitude,
                    currentLng: pos.coords.longitude,
                    lastLocationUpdate: serverTimestamp(),
                }).catch(() => {});
            },
            null,
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [driver?.isOnline, driverDocId]);

    // ── Notification countdown ────────────────────────────────────────────────
    useEffect(() => {
        if (!notification) return;
        setNotifCountdown(NOTIF_DURATION);
        const timer = setInterval(() => {
            setNotifCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setNotification(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notification?.id]);

    // ── Action: Accept ride (Bug 4 — atomic transaction) ─────────────────────
    const handleAcceptRide = useCallback(async (ride) => {
        if (!driver || acceptingId || activeRide) return;
        setAcceptingId(ride.id);
        setAcceptError('');
        setNotification(null);
        try {
            await runTransaction(db, async tx => {
                const rideRef  = doc(db, 'rides', ride.id);
                const rideSnap = await tx.get(rideRef);
                if (!rideSnap.exists()) throw new Error('Ride no longer exists.');
                if (rideSnap.data().driverId) throw new Error('Ride already taken by another driver.');
                tx.update(rideRef, {
                    driverId:     driver.uid,
                    driverName:   driver.name,
                    driverCar:    `${driver.vehicleType} • ${driver.vehicleReg}`,
                    driverRating: driver.rating,
                    status:       'driver_assigned',
                    assignedAt:   serverTimestamp(),
                });
            });
            setActiveTab('rides');
        } catch (err) {
            setAcceptError(err.message === 'Ride already taken by another driver.'
                ? 'This ride was just taken by another driver.'
                : 'Could not accept ride. Please try again.');
        } finally {
            setAcceptingId(null);
        }
    }, [driver, acceptingId, activeRide]);

    // ── Action: Picked up customer ────────────────────────────────────────────
    const handlePickedUp = useCallback(async () => {
        if (!activeRide || updatingRide) return;
        setUpdatingRide(true);
        setRideError('');
        try {
            await updateDoc(doc(db, 'rides', activeRide.id), {
                status:     'in_progress',
                pickedUpAt: serverTimestamp(),
            });
        } catch {
            setRideError('Could not update ride status. Please try again.');
        } finally {
            setUpdatingRide(false);
        }
    }, [activeRide, updatingRide]);

    // ── Action: Complete ride (Bug 5 — correct earnings update) ──────────────
    const handleCompleteRide = useCallback(async () => {
        if (!activeRide || !driverDocId || updatingRide) return;
        setUpdatingRide(true);
        setRideError('');
        try {
            const fare           = parseFloat(activeRide.price ?? 0);
            const driverEarnings = parseFloat((fare * DRIVER_SHARE).toFixed(2));
            const platformFee    = parseFloat((fare * (1 - DRIVER_SHARE)).toFixed(2));

            // Bug 5: update ride with driverEarnings + platformFee fields
            await updateDoc(doc(db, 'rides', activeRide.id), {
                status:         'completed',
                completedAt:    serverTimestamp(),
                driverEarnings,
                platformFee,
            });
            // Bug 5: increment driver earnings atomically
            await updateDoc(doc(db, 'drivers', driverDocId), {
                earnings:   increment(driverEarnings),
                totalRides: increment(1),
            });

            setReceipt({ ...activeRide, driverEarnings, platformFee });
        } catch {
            setRideError('Could not complete ride. Please try again.');
        } finally {
            setUpdatingRide(false);
        }
    }, [activeRide, driverDocId, updatingRide]);

    // ── Action: Toggle online/offline (Bug 6) ─────────────────────────────────
    const handleToggleOnline = useCallback(async () => {
        if (!driverDocId || onlineToggling) return;
        setOnlineToggling(true);
        try {
            await updateDoc(doc(db, 'drivers', driverDocId), {
                isOnline: !driver.isOnline,
                lastSeen: serverTimestamp(),
            });
        } catch {} finally {
            setOnlineToggling(false);
        }
    }, [driver, driverDocId, onlineToggling]);

    // ── Action: Logout ────────────────────────────────────────────────────────
    const handleLogout = useCallback(async () => {
        await signOut(auth).catch(() => {});
        navigate('/driver/login', { replace: true });
    }, [navigate]);

    // ── Action: Save profile ──────────────────────────────────────────────────
    const handleSaveProfile = useCallback(async () => {
        if (!driverDocId || editSaving) return;
        setEditSaving(true);
        setEditError('');
        try {
            await updateDoc(doc(db, 'drivers', driverDocId), {
                name:  editName.trim(),
                phone: editPhone.trim(),
            });
            setEditMode(false);
        } catch {
            setEditError('Could not save profile. Please try again.');
        } finally {
            setEditSaving(false);
        }
    }, [driverDocId, editName, editPhone, editSaving]);

    // ── Earnings calculations ─────────────────────────────────────────────────
    const todayEarnings = rideHistory
        .filter(r => isToday(r.completedAt ?? r.createdAt))
        .reduce((s, r) => s + (r.driverEarnings ?? (r.price ?? 0) * DRIVER_SHARE), 0);

    const weekEarnings = rideHistory
        .filter(r => isThisWeek(r.completedAt ?? r.createdAt))
        .reduce((s, r) => s + (r.driverEarnings ?? (r.price ?? 0) * DRIVER_SHARE), 0);

    const totalEarnings     = driver?.earnings ?? 0;
    const platformCommission = totalEarnings / DRIVER_SHARE * (1 - DRIVER_SHARE);

    // Weekly chart data (last 7 days)
    const weekChartData = getLast7Days().map(date => {
        const dayEarnings = rideHistory
            .filter(r => {
                const d = tsToDate(r.completedAt ?? r.createdAt);
                return d && d.toDateString() === date.toDateString();
            })
            .reduce((s, r) => s + (r.driverEarnings ?? (r.price ?? 0) * DRIVER_SHARE), 0);
        return {
            day: date.toLocaleDateString('en-GB', { weekday: 'short' }),
            earnings: parseFloat(dayEarnings.toFixed(2)),
        };
    });

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

    const TABS = [
        { id: 'rides',    label: '🚗 Rides'    },
        { id: 'earnings', label: '📊 Earnings' },
        { id: 'history',  label: '🕐 History'  },
        { id: 'profile',  label: '👤 Profile'  },
    ];

    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── Notification popup (Feature 1) ───────────────────────────── */}
            {notification && !activeRide && driver?.isOnline && (
                <RideNotification
                    ride={notification}
                    countdown={notifCountdown}
                    onAccept={() => handleAcceptRide(notification)}
                    onDecline={() => setNotification(null)}
                />
            )}

            {/* ── Receipt modal (Feature 6) ─────────────────────────────────── */}
            {receipt && (
                <RideReceipt ride={receipt} onClose={() => setReceipt(null)} />
            )}

            {/* ── Navbar ───────────────────────────────────────────────────── */}
            <nav className="sticky top-0 z-10 bg-black border-b border-gray-800">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-black font-black text-sm">R</span>
                        </div>
                        <span className="font-black">
                            Ride<span className="text-yellow-400">X</span>
                            <span className="text-gray-500 text-xs font-normal ml-1.5 hidden sm:inline">Driver</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {driver && (
                            <span className="text-gray-300 text-sm font-medium hidden sm:block truncate max-w-28">
                                {driver.name}
                            </span>
                        )}
                        {/* Online/offline toggle (Bug 6) */}
                        <button
                            onClick={handleToggleOnline}
                            disabled={onlineToggling}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                                driver?.isOnline
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${driver?.isOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
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

                {/* ── Tab nav (Feature 7) ──────────────────────────────────── */}
                <div className="max-w-5xl mx-auto px-4 flex border-t border-gray-800">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex-1 py-2.5 text-xs font-bold transition border-b-2 -mb-px ${
                                activeTab === t.id
                                    ? 'border-yellow-400 text-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-4 py-5 pb-12">

                {/* ══════════════════════════════════════════════════════════ */}
                {/* RIDES TAB                                                  */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === 'rides' && (
                    <div className="space-y-6">
                        {/* Stats row */}
                        {!driver ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[...Array(4)].map((_, i) => <SkeletonCard key={i} rows={2} />)}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <StatCard label="Today's Earnings" value={`£${todayEarnings.toFixed(2)}`} sub="Your 80% share" accent />
                                <StatCard label="Total Rides" value={driver.totalRides ?? 0} sub="All time" />
                                <StatCard label="Rating" value={`${(driver.rating ?? 5).toFixed(1)}`} sub={<Stars rating={driver.rating ?? 5} />} />
                                <StatCard label="Status" value={driver.isOnline ? 'Online' : 'Offline'} sub={driver.isOnline ? 'Accepting rides' : 'Tap to go online'} />
                            </div>
                        )}

                        {/* Active ride */}
                        {activeRide && (
                            <div>
                                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Active Ride</h2>
                                <div className="bg-gray-900 border border-yellow-400/30 rounded-2xl p-5">
                                    {/* Progress steps */}
                                    <div className="flex items-center gap-2 mb-4">
                                        {[
                                            { label: 'Assigned',   key: 'driver_assigned' },
                                            { label: 'Picked Up',  key: 'in_progress'     },
                                            { label: 'Completed',  key: 'completed'        },
                                        ].map((step, idx, arr) => {
                                            const order   = ['driver_assigned', 'in_progress', 'completed'];
                                            const reached = order.indexOf(activeRide.status) >= idx;
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

                                    {/* Feature 3: Mapbox map */}
                                    {driver && <ActiveRideMap driver={driver} ride={activeRide} />}

                                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Customer</p>
                                            <p className="text-white font-bold">{activeRide.userName || '—'}</p>
                                            {activeRide.userPhone && <p className="text-gray-400 text-sm">{activeRide.userPhone}</p>}
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Your Fare</p>
                                            <p className="text-yellow-400 font-black text-xl">
                                                £{((activeRide.price ?? 0) * DRIVER_SHARE).toFixed(2)}
                                            </p>
                                            <p className="text-gray-500 text-xs">Total £{(activeRide.price ?? 0).toFixed(2)}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <div className="flex gap-3">
                                            <span className="w-2.5 h-2.5 rounded-full bg-green-400 mt-1 shrink-0" />
                                            <div>
                                                <p className="text-gray-500 text-xs">Pickup</p>
                                                <p className="text-white text-sm">{activeRide.pickup}</p>
                                            </div>
                                        </div>
                                        <div className="ml-1 w-0.5 h-4 bg-gray-700" />
                                        <div className="flex gap-3">
                                            <span className="w-2.5 h-2.5 rounded-full bg-red-400 mt-1 shrink-0" />
                                            <div>
                                                <p className="text-gray-500 text-xs">Destination</p>
                                                <p className="text-white text-sm">{activeRide.destination}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {rideError && (
                                        <p className="text-red-400 text-xs mb-3">{rideError}</p>
                                    )}

                                    {activeRide.status === 'driver_assigned' && (
                                        <button
                                            onClick={handlePickedUp}
                                            disabled={updatingRide}
                                            className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-60 transition text-sm"
                                        >
                                            {updatingRide ? 'Updating…' : 'Picked Up Customer'}
                                        </button>
                                    )}
                                    {activeRide.status === 'in_progress' && (
                                        <button
                                            onClick={handleCompleteRide}
                                            disabled={updatingRide}
                                            className="w-full py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 disabled:opacity-60 transition text-sm"
                                        >
                                            {updatingRide ? 'Completing…' : 'Complete Ride'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Available rides */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    Available Rides
                                </h2>
                                {!driver?.isOnline && (
                                    <span className="text-yellow-400 text-xs font-bold">Go online to see rides</span>
                                )}
                            </div>

                            {acceptError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-3">
                                    <p className="text-red-400 text-sm">{acceptError}</p>
                                </div>
                            )}

                            {ridesLoading ? (
                                <div className="space-y-3">
                                    <SkeletonCard rows={4} />
                                    <SkeletonCard rows={4} />
                                </div>
                            ) : !driver?.isOnline ? (
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                                    <p className="text-4xl mb-3">🚗</p>
                                    <p className="text-gray-400 font-bold">You are offline</p>
                                    <p className="text-gray-600 text-sm mt-1">Toggle Online to see available rides</p>
                                </div>
                            ) : activeRide ? (
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                                    <p className="text-gray-400 text-sm font-bold">Complete your active ride first</p>
                                </div>
                            ) : availableRides.length === 0 ? (
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                                    <p className="text-3xl mb-3">🔍</p>
                                    <p className="text-gray-400 font-bold">No rides available</p>
                                    <p className="text-gray-600 text-sm mt-1">New requests appear here in real time</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {availableRides.map(ride => (
                                        <div key={ride.id}
                                            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition">
                                            <div className="flex items-start justify-between gap-4 mb-3">
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

                                            <div className="space-y-1.5 mb-3">
                                                <div className="flex gap-3">
                                                    <span className="w-2 h-2 rounded-full bg-green-400 mt-1 shrink-0" />
                                                    <div>
                                                        <p className="text-gray-500 text-xs">Pickup</p>
                                                        <p className="text-white text-sm">{ride.pickup}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-3">
                                                    <span className="w-2 h-2 rounded-full bg-red-400 mt-1 shrink-0" />
                                                    <div>
                                                        <p className="text-gray-500 text-xs">Destination</p>
                                                        <p className="text-white text-sm">{ride.destination}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
                                                {ride.distance && <span>📍 {ride.distance}</span>}
                                                {ride.duration && <span>⏱ {ride.duration}</span>}
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
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* EARNINGS TAB (Feature 4)                                   */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === 'earnings' && (
                    <div className="space-y-5">
                        {/* Stat cards */}
                        <div className="grid grid-cols-3 gap-3">
                            <StatCard label="Today" value={`£${todayEarnings.toFixed(2)}`} accent />
                            <StatCard label="This Week" value={`£${weekEarnings.toFixed(2)}`} />
                            <StatCard label="All Time" value={`£${totalEarnings.toFixed(2)}`} />
                        </div>

                        {/* Weekly bar chart */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                                Weekly Earnings
                            </p>
                            <p className="text-yellow-400 font-black text-2xl mb-4">
                                £{weekEarnings.toFixed(2)}
                            </p>
                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart data={weekChartData} barSize={28}>
                                    <XAxis
                                        dataKey="day"
                                        tick={{ fill: '#6B7280', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis hide />
                                    <Tooltip content={<EarningsTooltip />} cursor={{ fill: '#ffffff08' }} />
                                    <Bar dataKey="earnings" fill="#FACC15" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Commission breakdown */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                                All-time breakdown
                            </p>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-300 text-sm">Your earnings (80%)</span>
                                    <span className="text-yellow-400 font-bold">£{totalEarnings.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400 text-sm">Platform (20%)</span>
                                    <span className="text-gray-400 font-bold">£{platformCommission.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t border-gray-800 pt-3">
                                    <span className="text-gray-300 text-sm font-bold">Total collected</span>
                                    <span className="text-white font-bold">
                                        £{(totalEarnings + platformCommission).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-4 flex rounded-full overflow-hidden h-2">
                                <div className="bg-yellow-400" style={{ width: '80%' }} />
                                <div className="bg-gray-700" style={{ width: '20%' }} />
                            </div>
                            <div className="flex justify-between text-xs text-gray-600 mt-1">
                                <span>You 80%</span>
                                <span>Platform 20%</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* HISTORY TAB                                                */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === 'history' && (
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                            Completed Rides ({rideHistory.length})
                        </p>
                        {ridesLoading ? (
                            <div className="space-y-3">
                                {[...Array(3)].map((_, i) => <SkeletonCard key={i} rows={3} />)}
                            </div>
                        ) : rideHistory.length === 0 ? (
                            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                                <p className="text-3xl mb-3">📋</p>
                                <p className="text-gray-400 font-bold">No completed rides yet</p>
                                <p className="text-gray-600 text-sm mt-1">Completed rides will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {rideHistory.map(ride => (
                                    <div key={ride.id}
                                        className="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                                                    <span className="text-white text-sm truncate">{ride.pickup}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                                                    <span className="text-gray-400 text-sm truncate">{ride.destination}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-yellow-400 font-black">
                                                    £{(ride.driverEarnings ?? (ride.price ?? 0) * DRIVER_SHARE).toFixed(2)}
                                                </p>
                                                <p className="text-gray-600 text-xs">
                                                    of £{(ride.price ?? 0).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <p className="text-gray-600 text-xs">
                                                {formatDate(ride.completedAt ?? ride.createdAt)}
                                            </p>
                                            {ride.rideType && (
                                                <span className="text-gray-600 text-xs capitalize bg-gray-800 px-2 py-0.5 rounded-full">
                                                    {ride.rideType}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* PROFILE TAB (Feature 5)                                    */}
                {/* ══════════════════════════════════════════════════════════ */}
                {activeTab === 'profile' && (
                    <div className="space-y-4">
                        {!driver ? (
                            <SkeletonCard rows={6} />
                        ) : (
                            <>
                                {/* Avatar + name */}
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
                                    <div className="w-16 h-16 bg-yellow-400 rounded-2xl flex items-center justify-center shrink-0">
                                        <span className="text-black font-black text-2xl">
                                            {(driver.name ?? '?')[0].toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-black text-lg truncate">{driver.name}</p>
                                        <p className="text-gray-400 text-sm truncate">{driver.email}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Stars rating={driver.rating ?? 5} />
                                            <span className="text-yellow-400 text-xs font-bold">
                                                {(driver.rating ?? 5).toFixed(1)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-3">
                                    <StatCard label="Total Rides" value={driver.totalRides ?? 0} />
                                    <StatCard label="Earnings" value={`£${(driver.earnings ?? 0).toFixed(0)}`} accent />
                                    <StatCard
                                        label="Member Since"
                                        value={driver.createdAt
                                            ? tsToDate(driver.createdAt)?.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                                            : '—'
                                        }
                                    />
                                </div>

                                {/* Vehicle info */}
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Vehicle</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-gray-500 text-xs">Type</p>
                                            <p className="text-white font-bold">{driver.vehicleType ?? '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 text-xs">Registration</p>
                                            <p className="text-white font-bold">{driver.vehicleReg ?? '—'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Edit profile */}
                                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            Personal Info
                                        </p>
                                        {!editMode && (
                                            <button
                                                onClick={() => { setEditMode(true); setEditError(''); }}
                                                className="text-yellow-400 text-xs font-bold hover:text-yellow-300 transition"
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>

                                    {editMode ? (
                                        <>
                                            {editError && (
                                                <p className="text-red-400 text-xs mb-3">{editError}</p>
                                            )}
                                            <div className="space-y-3 mb-4">
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Full Name</label>
                                                    <input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="w-full bg-black border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Phone</label>
                                                    <input
                                                        value={editPhone}
                                                        onChange={e => setEditPhone(e.target.value)}
                                                        className="w-full bg-black border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveProfile}
                                                    disabled={editSaving}
                                                    className="flex-1 py-2.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-60 transition text-sm"
                                                >
                                                    {editSaving ? 'Saving…' : 'Save'}
                                                </button>
                                                <button
                                                    onClick={() => { setEditMode(false); setEditName(driver.name ?? ''); setEditPhone(driver.phone ?? ''); }}
                                                    className="flex-1 py-2.5 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition text-sm"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            <div>
                                                <p className="text-gray-500 text-xs">Full Name</p>
                                                <p className="text-white font-medium">{driver.name ?? '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs">Email</p>
                                                <p className="text-white font-medium">{driver.email ?? '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs">Phone</p>
                                                <p className="text-white font-medium">{driver.phone ?? '—'}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
