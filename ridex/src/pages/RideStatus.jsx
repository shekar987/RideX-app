import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useNotifications } from '../hooks/useNotifications';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Ride Confirmed', desc: 'Your ride is confirmed'           },
  { label: 'En Route',       desc: 'On the way to pick you up'        },
  { label: 'Ride Started',   desc: 'Enjoy your ride!'                 },
  { label: 'Arrived',        desc: 'You have reached your destination'},
];

// Driver writes: confirmed → driver_assigned → arrived → in_progress → completed
const STATUS_MAP = {
  confirmed:       0,
  driver_assigned: 1,
  arrived:         1,
  in_progress:     2,
  completed:       3,
};

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

// ── Step icon SVGs ────────────────────────────────────────────────────────────

function StepIcon({ index }) {
  const icons = [
    // Confirmed — check circle
    <path key="0" strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    // En Route — car
    <path key="1" strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 011.373-1.903L5 8h14l2.627 1.097A2 2 0 0123 11v4a2 2 0 01-2 2h-2m-14 0h14m-14 0a2 2 0 100 4 2 2 0 000-4zm14 0a2 2 0 100 4 2 2 0 000-4z" />,
    // Ride Started — road / navigation
    <path key="2" strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />,
    // Arrived — flag
    <path key="3" strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />,
  ];

  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      {icons[index]}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Live Mapbox map ───────────────────────────────────────────────────────────
function LiveMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng, firestoreStatus }) {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const mapboxRef       = useRef(null);
  const driverMarkerRef = useRef(null);

  // Initialise map + static pickup/destination pins once
  useEffect(() => {
    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!containerRef.current || !token) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (mapRef.current) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [pickupLng || -0.1276, pickupLat || 51.5074],
        zoom: 13,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (pickupLat && pickupLng) {
          const el = document.createElement('div');
          el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;';
          new mapboxgl.Marker(el).setLngLat([pickupLng, pickupLat]).addTo(map);
        }
        if (destLat && destLng) {
          const el = document.createElement('div');
          el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid white;';
          new mapboxgl.Marker(el).setLngLat([destLng, destLat]).addTo(map);
        }
      });
    }).catch(() => {});

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update driver marker on GPS position changes
  useEffect(() => {
    if (!driverLat || !driverLng || !mapboxRef.current) return;
    const map     = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map) return;

    const run = () => {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLngLat([driverLng, driverLat]);
        try {
          if (!map.getBounds().contains([driverLng, driverLat])) {
            map.easeTo({ center: [driverLng, driverLat], duration: 600 });
          }
        } catch (_) {}
      } else {
        const el = document.createElement('div');
        el.style.cssText = `
          width:20px;height:20px;border-radius:50%;
          background:#3b82f6;border:3px solid white;
          box-shadow:0 0 0 8px rgba(59,130,246,0.25);
        `;
        driverMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([driverLng, driverLat])
          .addTo(map);

        const isInProgress = firestoreStatus === 'in_progress';
        const tLat = isInProgress ? destLat : pickupLat;
        const tLng = isInProgress ? destLng : pickupLng;

        if (tLat && tLng) {
          const b = new mapboxgl.LngLatBounds([driverLng, driverLat], [driverLng, driverLat]);
          b.extend([tLng, tLat]);
          map.fitBounds(b, { padding: 70, maxZoom: 16 });
        } else {
          map.flyTo({ center: [driverLng, driverLat], zoom: 14 });
        }
      }
    };

    if (map.isStyleLoaded()) { run(); } else { map.once('load', run); }
  }, [driverLat, driverLng, firestoreStatus, pickupLat, pickupLng, destLat, destLng]);

  return (
    <div ref={containerRef} className="w-full h-56 rounded-2xl overflow-hidden border border-gray-800" />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function RideStatus() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { rideDetails: ctxRide, listenToRide, logout, user } = useAuth();
  const rideDetails = ctxRide ?? state?.ride;

  const [status,    setStatus]    = useState(0);
  const [liveRide,  setLiveRide]  = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);

  const rideId        = rideDetails?.rideId;
  const lastUpdateRef = useRef(0);
  const tokenSavedRef = useRef(false);

  // Foreground message handler — show an in-app toast for ride updates
  const handleForegroundMessage = useCallback((payload) => {
    // Foreground messages are shown as in-app feedback only; background
    // messages are handled by the service worker (shown as OS notifications).
    const body = payload.notification?.body || '';
    if (body) {
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed;bottom:6rem;left:50%;transform:translateX(-50%);
        background:#facc15;color:#000;padding:.75rem 1.25rem;
        border-radius:1rem;font-weight:700;font-size:.875rem;
        box-shadow:0 4px 24px rgba(0,0,0,.5);z-index:9999;
        white-space:nowrap;pointer-events:none;
      `;
      el.textContent = body;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  }, []);

  const { permission, requestPermission } = useNotifications({
    onForegroundMessage: handleForegroundMessage,
  });

  // Once permission is granted, save the FCM token to the ride doc so the
  // Cloud Function can notify this customer on driver-assigned / arrived / complete.
  const handleEnableNotifications = useCallback(async () => {
    const fcmToken = await requestPermission();
    if (fcmToken && rideId && !tokenSavedRef.current) {
      try {
        await updateDoc(doc(db, 'rides', rideId), { customerFcmToken: fcmToken });
        tokenSavedRef.current = true;
      } catch (_) {}
    }
  }, [requestPermission, rideId]);

  // Subscribe to ride document for live status + driver info
  useEffect(() => {
    if (!rideId) return;
    const unsub = listenToRide(rideId, data => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 1000) return;
      lastUpdateRef.current = now;
      setLiveRide(data);
    });
    return unsub;
  }, [rideId, listenToRide]);

  // Map Firestore status → progress step (never go backwards)
  useEffect(() => {
    if (!liveRide?.status) return;
    const step = STATUS_MAP[liveRide.status] ?? 0;
    setStatus(cur => Math.max(cur, step));
  }, [liveRide]);

  // Subscribe to driver document for live GPS once a driver is assigned
  useEffect(() => {
    if (!liveRide?.driverId) return;
    const unsub = onSnapshot(doc(db, 'drivers', liveRide.driverId), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.currentLat && d.currentLng) {
        setDriverLoc({ lat: d.currentLat, lng: d.currentLng });
      }
    });
    return () => unsub();
  }, [liveRide?.driverId]);

  // Demo simulation: auto-advances steps when there is no real rideId
  useEffect(() => {
    if (rideId) return;
    if (status >= STEPS.length - 1) return;
    const timer = setTimeout(() => setStatus(s => s + 1), 4000);
    return () => clearTimeout(timer);
  }, [rideId, status]);

  if (!rideDetails) return <Navigate to="/book" replace />;

  const pickupLat = liveRide?.pickupLat      ?? rideDetails?.pickupLat;
  const pickupLng = liveRide?.pickupLng      ?? rideDetails?.pickupLng;
  const destLat   = liveRide?.destinationLat ?? rideDetails?.destinationLat;
  const destLng   = liveRide?.destinationLng ?? rideDetails?.destinationLng;
  const showMap   = !!(liveRide?.driverId && status >= 1 && status < STEPS.length - 1);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <a href="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
          <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
            <span className="text-black font-black text-xs">R</span>
          </div>
          <span className="text-lg font-black">RideX</span>
        </a>
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

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-md mx-auto space-y-6">

          {/* Current status banner */}
          <section aria-labelledby="status-heading" className="bg-gray-900 rounded-2xl p-6">
            <div className="bg-black rounded-xl p-5 text-center">
              <div className="flex justify-center mb-3 text-yellow-400">
                <StepIcon index={status} />
              </div>
              <h1 id="status-heading" className="text-xl font-bold text-yellow-400">{STEPS[status].label}</h1>
              <p className="text-gray-400 text-sm mt-1">{STEPS[status].desc}</p>
            </div>
          </section>

          {/* Notification opt-in — shown only when permission not yet decided */}
          {permission === 'default' && status < STEPS.length - 1 && (
            <section aria-label="Enable ride notifications">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-yellow-400 text-sm font-semibold leading-snug">
                  Get notified when your driver arrives
                </p>
                <button
                  onClick={handleEnableNotifications}
                  className="flex-shrink-0 px-3 py-1.5 bg-yellow-400 text-black text-xs font-black rounded-xl hover:bg-yellow-300 transition"
                >
                  Allow
                </button>
              </div>
            </section>
          )}

          {/* Live driver map */}
          {showMap && (
            <section aria-label="Live driver location">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Live Driver Location</p>
              <LiveMap
                driverLat={driverLoc?.lat}
                driverLng={driverLoc?.lng}
                pickupLat={pickupLat}
                pickupLng={pickupLng}
                destLat={destLat}
                destLng={destLng}
                firestoreStatus={liveRide?.status}
              />
              <div className="flex items-center gap-5 mt-2.5 px-1" aria-label="Map legend">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" aria-hidden="true" />Driver
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" aria-hidden="true" />Pickup
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" aria-hidden="true" />Destination
                </span>
              </div>
            </section>
          )}

          {/* Driver info card */}
          {liveRide?.driverName && (
            <section aria-label="Your driver" className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-4">Your Driver</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <span className="text-black font-black text-2xl">
                    {liveRide.driverName[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg">{liveRide.driverName}</p>
                  {liveRide.driverCar && (
                    <p className="text-gray-400 text-sm">{liveRide.driverCar}</p>
                  )}
                  {liveRide.driverRating && (
                    <p className="text-yellow-400 text-sm" aria-label={`Rating: ${parseFloat(liveRide.driverRating).toFixed(1)} stars`}>
                      ★ {parseFloat(liveRide.driverRating).toFixed(1)}
                    </p>
                  )}
                </div>
                {liveRide.driverPhone && (
                  <a
                    href={`tel:${liveRide.driverPhone}`}
                    className={`w-10 h-10 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center flex-shrink-0 ${ring}`}
                    aria-label="Call driver"
                  >
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* OTP — shown once driver is assigned, until ride completes */}
          {liveRide?.otp && status >= 1 && status < STEPS.length - 1 && (
            <section aria-label="Ride verification code" className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-1">Your ride code</p>
              <p className="text-xs text-gray-500 mb-4">Share this with your driver when they arrive</p>
              <div className="flex justify-center gap-3" aria-label={`Code: ${liveRide.otp}`}>
                {liveRide.otp.split('').map((digit, i) => (
                  <div key={i} aria-hidden="true" className="w-14 h-14 bg-black border-2 border-yellow-400 rounded-xl flex items-center justify-center text-2xl font-black text-yellow-400">
                    {digit}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Progress steps */}
          <section aria-label="Ride progress" className="bg-gray-900 rounded-2xl p-6">
            <p className="text-gray-400 text-sm mb-4">Ride Progress</p>
            <ol className="space-y-3 list-none">
              {STEPS.map((step, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                    ${index <= status ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-500'}`}
                    aria-hidden="true"
                  >
                    {index < status ? <CheckIcon /> : <span className="text-sm font-bold">{index + 1}</span>}
                  </div>
                  <p className={index <= status ? 'text-white font-semibold' : 'text-gray-500'}>
                    {step.label}
                    {index === status && <span className="sr-only"> (current)</span>}
                    {index < status && <span className="sr-only"> (complete)</span>}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* Fare */}
          <section aria-label="Fare summary" className="bg-gray-900 rounded-2xl p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-sm">Total Fare</p>
                <p className="text-3xl font-bold text-yellow-400">£{parseFloat(rideDetails.price).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-sm">Payment</p>
                <div className="flex items-center gap-1.5 justify-end mt-0.5">
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="font-semibold text-sm">Card</span>
                </div>
              </div>
            </div>
          </section>

          {/* Book another ride — shown when ride is complete */}
          {status === STEPS.length - 1 && (
            <button
              onClick={() => navigate('/book')}
              className={`w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}
            >
              Book Another Ride
            </button>
          )}

        </div>
      </main>
    </div>
  );
}

export default RideStatus;
