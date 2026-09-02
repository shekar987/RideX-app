import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Navigate, useLocation, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useNotifications, describeNotificationFailure } from '../hooks/useNotifications';
import { formatMoney, initialOf, telHref } from '../utils/ride';

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
const isNum = v => typeof v === 'number' && Number.isFinite(v);

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
// Initialises once; pins and the driver dot are UPDATED as props change (the
// old version drew pins only from the coords present at mount, so a ride that
// loaded a moment later never got any).
function LiveMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng, firestoreStatus }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const mapboxRef    = useRef(null);
  const markersRef   = useRef({ driver: null, pickup: null, dest: null });
  const loadedRef    = useRef(false);
  const [ready,  setReady]  = useState(false);
  const [failed, setFailed] = useState(false);
  const token = process.env.REACT_APP_MAPBOX_TOKEN;

  useEffect(() => {
    if (!containerRef.current || !token) return undefined;
    let cancelled = false;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [isNum(pickupLng) ? pickupLng : -0.1276, isNum(pickupLat) ? pickupLat : 51.5074],
        zoom: 13,
      });
      mapRef.current = map;
      map.on('error', () => { if (!loadedRef.current) setFailed(true); });
      map.on('load', () => {
        if (cancelled) { map.remove(); return; }
        loadedRef.current = true;
        setReady(true);
      });
    }).catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markersRef.current = { driver: null, pickup: null, dest: null };
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pickup / destination pins
  useEffect(() => {
    const map = mapRef.current, mapboxgl = mapboxRef.current;
    if (!ready || !map || !mapboxgl) return;
    const upsert = (key, lng, lat, color) => {
      if (!isNum(lat) || !isNum(lng)) { markersRef.current[key]?.remove(); markersRef.current[key] = null; return; }
      if (markersRef.current[key]) { markersRef.current[key].setLngLat([lng, lat]); return; }
      const el = document.createElement('div');
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;`;
      markersRef.current[key] = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map);
    };
    upsert('pickup', pickupLng, pickupLat, '#22c55e');
    upsert('dest',   destLng,   destLat,   '#ef4444');
  }, [ready, pickupLat, pickupLng, destLat, destLng]);

  // Driver dot + camera
  useEffect(() => {
    const map = mapRef.current, mapboxgl = mapboxRef.current;
    if (!ready || !map || !mapboxgl || !isNum(driverLat) || !isNum(driverLng)) return;
    const first = !markersRef.current.driver;
    if (first) {
      const el = document.createElement('div');
      el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;animation:driverPulse 1.5s infinite;';
      markersRef.current.driver = new mapboxgl.Marker(el).setLngLat([driverLng, driverLat]).addTo(map);
    } else {
      markersRef.current.driver.setLngLat([driverLng, driverLat]);
    }
    try {
      const target = firestoreStatus === 'in_progress' ? [destLng, destLat] : [pickupLng, pickupLat];
      if (first && isNum(target[0]) && isNum(target[1])) {
        const b = new mapboxgl.LngLatBounds([driverLng, driverLat], [driverLng, driverLat]);
        b.extend(target);
        map.fitBounds(b, { padding: 60, maxZoom: 16 });
      } else if (first) {
        map.flyTo({ center: [driverLng, driverLat], zoom: 14 });
      } else if (!map.getBounds().contains([driverLng, driverLat])) {
        map.easeTo({ center: [driverLng, driverLat], duration: 600 });
      }
    } catch (_) { /* map mid-teardown */ }
  }, [ready, driverLat, driverLng, firestoreStatus, pickupLat, pickupLng, destLat, destLng]);

  if (!token || failed) {
    return (
      <div className="w-full h-64 sm:h-80 lg:h-96 rounded-2xl border border-gray-800 bg-gray-900 flex items-center justify-center text-gray-500 text-sm">
        Map unavailable
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Live driver map"
      className="w-full h-64 sm:h-80 lg:h-96 rounded-2xl overflow-hidden border border-gray-800"
    />
  );
}

// ── Shared page chrome ────────────────────────────────────────────────────────
function Shell({ user, onLogout, children }) {
  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col">
      <header className="flex justify-between items-center px-5 md:px-6 py-4 border-b border-gray-800">
        <Link to="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
          <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
            <span className="text-black font-black text-xs">R</span>
          </div>
          <span className="text-lg font-black">RideX</span>
        </Link>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm hidden md:block truncate max-w-[200px]">{user?.displayName || user?.email}</p>
          <button
            type="button"
            onClick={onLogout}
            className={`text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-4 py-2.5 sm:py-1.5 rounded-full ${ring}`}
          >
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 px-5 md:px-6 py-8 pb-safe">
        <div className="max-w-md mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

function InfoCard({ title, body, children }) {
  return (
    <section className="bg-gray-900 rounded-2xl p-6 text-center" role="status">
      <p className="text-white font-bold text-lg mb-1">{title}</p>
      {body && <p className="text-gray-400 text-sm mb-5 leading-relaxed">{body}</p>}
      {children}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function RideStatus() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { rideId: paramId } = useParams();
  const { rideDetails: ctxRide, listenToRide, logout, user } = useAuth();

  // The URL param wins; context / navigation state is only trusted for that same
  // ride (a deep link to ride B must never show ride A's price from context).
  const candidate = ctxRide ?? state?.ride ?? null;
  const rideId    = paramId ?? candidate?.rideId ?? null;
  const details   = candidate && (!paramId || candidate.rideId === paramId) ? candidate : null;

  const [status,      setStatus]      = useState(0);
  const [liveRide,    setLiveRide]    = useState(undefined); // undefined = loading, null = not found
  const [error,       setError]       = useState('');
  const [reloadKey,   setReloadKey]   = useState(0);
  const [toast,       setToast]       = useState('');
  const [notifBusy,   setNotifBusy]   = useState(false);
  const [notifNotice, setNotifNotice] = useState('');
  const tokenSavedRef = useRef(false);
  const toastTimerRef = useRef(null);

  // Foreground push messages → in-app toast (React state, not a raw DOM node)
  const handleForegroundMessage = useCallback((payload) => {
    const body = payload?.notification?.body || '';
    if (!body) return;
    setToast(body);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 4000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const { supported, permission, requestPermission } = useNotifications({
    onForegroundMessage: handleForegroundMessage,
  });

  // Once permission is granted, save the FCM token to the ride doc so the
  // Cloud Function can notify this customer on driver-assigned / arrived / complete.
  const handleEnableNotifications = useCallback(async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    setNotifNotice('');
    try {
      const { token, reason } = await requestPermission();
      if (!token) { setNotifNotice(describeNotificationFailure(reason)); return; }
      if (rideId && !tokenSavedRef.current) {
        try {
          await updateDoc(doc(db, 'rides', rideId), { customerFcmToken: token });
          tokenSavedRef.current = true;
          setNotifNotice('Notifications on — we’ll alert you when your driver arrives.');
        } catch {
          setNotifNotice('Permission granted, but we could not link notifications to this ride. Please try again.');
        }
      }
    } finally {
      setNotifBusy(false);
    }
  }, [notifBusy, requestPermission, rideId]);

  // Subscribe to the ride document for live status, driver info and driver GPS
  useEffect(() => {
    if (!rideId) return undefined;
    setLiveRide(undefined);
    setError('');
    setStatus(0);
    const unsub = listenToRide(
      rideId,
      data => { setLiveRide(data); setError(''); },
      err => {
        // Rules deny reads of rides you don't own — treat like "not found" and
        // never reveal whether the id exists.
        if (err?.code === 'permission-denied') setLiveRide(null);
        else setError('Lost connection to your ride. Check your connection.');
      },
    );
    return unsub;
  }, [rideId, listenToRide, reloadKey]);

  // Map Firestore status → progress step (never go backwards)
  useEffect(() => {
    const step = STATUS_MAP[liveRide?.status];
    if (step === undefined) return;
    setStatus(cur => Math.max(cur, step));
  }, [liveRide]);

  const handleLogout = async () => {
    try { await logout(); } finally { navigate('/'); }
  };

  // Nothing to show at all → back to booking
  if (!rideId && !details) return <Navigate to="/book" replace />;

  // Legacy/local booking that never reached Firestore
  if (!rideId) {
    return (
      <Shell user={user} onLogout={handleLogout}>
        <InfoCard title="We couldn't confirm your ride" body="This booking was not saved, so no driver can see it. Please book again.">
          <button type="button" onClick={() => navigate('/book')} className={`w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}>
            Book again
          </button>
        </InfoCard>
      </Shell>
    );
  }

  if (liveRide === undefined && !details) {
    return (
      <Shell user={user} onLogout={handleLogout}>
        {error ? (
          <InfoCard title="Couldn't load your ride" body={error}>
            <button type="button" onClick={() => setReloadKey(k => k + 1)} className={`w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}>
              Retry
            </button>
          </InfoCard>
        ) : (
          <InfoCard title="Loading your ride…">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" aria-hidden="true" />
          </InfoCard>
        )}
      </Shell>
    );
  }

  if (liveRide === null) {
    return (
      <Shell user={user} onLogout={handleLogout}>
        <InfoCard title="Ride not found" body="This ride doesn't exist or isn't linked to your account.">
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => navigate('/history')} className={`flex-1 py-3 border border-gray-700 text-gray-300 font-bold rounded-xl hover:border-gray-500 transition ${ring}`}>My rides</button>
            <button type="button" onClick={() => navigate('/book')} className={`flex-1 py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}>Book a ride</button>
          </div>
        </InfoCard>
      </Shell>
    );
  }

  const pickupLat  = liveRide?.pickupLat      ?? details?.pickupLat;
  const pickupLng  = liveRide?.pickupLng      ?? details?.pickupLng;
  const destLat    = liveRide?.destinationLat ?? details?.destinationLat;
  const destLng    = liveRide?.destinationLng ?? details?.destinationLng;
  const price      = liveRide?.price          ?? details?.price;
  const driverLoc  = isNum(liveRide?.driverLat) && isNum(liveRide?.driverLng)
    ? { lat: liveRide.driverLat, lng: liveRide.driverLng }
    : null;
  const isCancelled = liveRide?.status === 'cancelled';
  const isDone      = status === STEPS.length - 1;
  const showMap     = !!(liveRide?.driverId && status >= 1 && !isDone && !isCancelled);
  const driverCar   = String(liveRide?.driverCar ?? '').replace(/[•\s]/g, '') ? liveRide.driverCar : '';
  const ratingNum   = Number(liveRide?.driverRating);

  return (
    <Shell user={user} onLogout={handleLogout}>

      {error && (
        <div role="alert" className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-yellow-400 text-sm min-w-0">{error}</p>
          <button type="button" onClick={() => setReloadKey(k => k + 1)} className={`flex-shrink-0 text-sm font-bold text-yellow-400 underline px-2 py-2 ${ring} rounded`}>Retry</button>
        </div>
      )}

      {/* Cancelled — terminal state */}
      {isCancelled ? (
        <InfoCard title="Ride cancelled" body="This ride was cancelled before a driver was assigned. You have not been charged for the journey.">
          <button type="button" onClick={() => navigate('/book')} className={`w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}>
            Book another ride
          </button>
        </InfoCard>
      ) : (
        <>
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

          {/* Notification opt-in — shown only when supported and not yet decided */}
          {supported && permission === 'default' && !isDone && (
            <section aria-label="Enable ride notifications">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-yellow-400 text-sm font-semibold leading-snug min-w-0">
                  Get notified when your driver arrives
                </p>
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  disabled={notifBusy}
                  className={`flex-shrink-0 px-4 py-2.5 min-h-[44px] bg-yellow-400 text-black text-sm font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 ${ring}`}
                >
                  {notifBusy ? 'Enabling…' : 'Allow'}
                </button>
              </div>
            </section>
          )}
          {notifNotice && (
            <p role="status" className="text-gray-400 text-xs px-1 -mt-3">{notifNotice}</p>
          )}

          {/* Live driver map — driver position is mirrored onto the ride document */}
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
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 px-1" aria-label="Map legend">
                {driverLoc ? (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" aria-hidden="true" />Driver
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">Waiting for driver location…</span>
                )}
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
                  <span className="text-black font-black text-2xl">{initialOf(liveRide.driverName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg truncate">{liveRide.driverName}</p>
                  {driverCar && <p className="text-gray-400 text-sm truncate">{driverCar}</p>}
                  {Number.isFinite(ratingNum) && (
                    <p className="text-yellow-400 text-sm" aria-label={`Rating: ${ratingNum.toFixed(1)} stars`}>
                      ★ {ratingNum.toFixed(1)}
                    </p>
                  )}
                </div>
                {telHref(liveRide.driverPhone) && (
                  <a
                    href={telHref(liveRide.driverPhone)}
                    className={`w-11 h-11 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center flex-shrink-0 ${ring}`}
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
          {liveRide?.otp && status >= 1 && !isDone && (
            <section aria-label="Ride verification code" className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-1">Your ride code</p>
              <p className="text-xs text-gray-500 mb-4">Share this with your driver when they arrive</p>
              <div className="flex justify-center gap-2 sm:gap-3" aria-label={`Code: ${String(liveRide.otp).split('').join(' ')}`}>
                {String(liveRide.otp).split('').map((digit, i) => (
                  <div key={i} aria-hidden="true" className="w-12 h-12 sm:w-14 sm:h-14 bg-black border-2 border-yellow-400 rounded-xl flex items-center justify-center text-2xl font-black text-yellow-400 tabular-nums">
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
                <li key={step.label} className="flex items-center gap-3">
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
            <div className="flex justify-between items-center gap-4">
              <div className="min-w-0">
                <p className="text-gray-400 text-sm">Total Fare</p>
                <p className="text-2xl sm:text-3xl font-bold text-yellow-400 tabular-nums">{formatMoney(price)}</p>
              </div>
              <div className="text-right flex-shrink-0">
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
          {isDone && (
            <button
              type="button"
              onClick={() => navigate('/book')}
              className={`w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition ${ring}`}
            >
              Book Another Ride
            </button>
          )}
        </>
      )}

      {/* Foreground push toast */}
      {toast && (
        <div
          role="status"
          className="fixed left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto sm:max-w-sm bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-[100] bg-yellow-400 text-black px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl break-words text-center pointer-events-none"
        >
          {toast}
        </div>
      )}
    </Shell>
  );
}

export default RideStatus;
