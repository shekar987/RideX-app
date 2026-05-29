import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const STEPS = [
  { label: 'Ride Confirmed', icon: '✅', desc: 'Your ride is confirmed' },
  { label: 'En Route',       icon: '🚗', desc: 'On the way to pick you up' },
  { label: 'Ride Started',   icon: '🛣️', desc: 'Enjoy your ride!' },
  { label: 'Arrived',        icon: '🏁', desc: 'You have reached your destination' },
];

// Driver writes: confirmed → driver_assigned → arrived → in_progress → completed
const STATUS_MAP = {
  confirmed:       0,
  driver_assigned: 1,
  arrived:         1,  // driver at pickup door, customer still sees "En Route"
  in_progress:     2,
  completed:       3,
};

// ─────────────────────────────────────────────
// Live Mapbox map — shows driver moving toward pickup or destination
// ─────────────────────────────────────────────
function LiveMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng, firestoreStatus }) {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const mapboxRef       = useRef(null);
  const driverMarkerRef = useRef(null);

  // Initialise map + static pickup/destination pins once
  useEffect(() => {
    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!token || !containerRef.current) return;

    // eslint-disable-next-line import/no-webpack-loader-syntax
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
        // Green pickup pin
        if (pickupLat && pickupLng) {
          const el = document.createElement('div');
          el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;';
          new mapboxgl.Marker(el).setLngLat([pickupLng, pickupLat]).addTo(map);
        }
        // Red destination pin
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

  // Add / update driver marker whenever GPS position changes
  useEffect(() => {
    if (!driverLat || !driverLng || !mapboxRef.current) return;
    const map    = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map) return;

    const run = () => {
      if (driverMarkerRef.current) {
        // Subsequent update — just move the dot
        driverMarkerRef.current.setLngLat([driverLng, driverLat]);
        // Pan only if driver has drifted off screen
        try {
          if (!map.getBounds().contains([driverLng, driverLat])) {
            map.easeTo({ center: [driverLng, driverLat], duration: 600 });
          }
        } catch (_) {}
      } else {
        // First fix — create dot and fit map to show driver + target pin
        const el = document.createElement('div');
        el.style.cssText = `
          width:20px;height:20px;border-radius:50%;
          background:#3b82f6;border:3px solid white;
          box-shadow:0 0 0 8px rgba(59,130,246,0.25);
        `;
        driverMarkerRef.current = new mapboxgl.Marker(el)
          .setLngLat([driverLng, driverLat])
          .addTo(map);

        // Fit to driver + pickup when en route; driver + destination when in ride
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

    if (map.isStyleLoaded()) {
      run();
    } else {
      map.once('load', run);
    }
  }, [driverLat, driverLng, firestoreStatus, pickupLat, pickupLng, destLat, destLng]);

  return (
    <div ref={containerRef} className="w-full h-56 rounded-2xl overflow-hidden border border-gray-800" />
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
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

  // Demo simulation so UI flows without a real driver in testing
  useEffect(() => {
    if (status >= STEPS.length - 1) return;
    const timer = setTimeout(() => setStatus(s => s + 1), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!rideDetails) return <Navigate to="/book" replace />;

  // Coords: prefer live Firestore data, fall back to what BookRide stored locally
  const pickupLat = liveRide?.pickupLat      ?? rideDetails?.pickupLat;
  const pickupLng = liveRide?.pickupLng      ?? rideDetails?.pickupLng;
  const destLat   = liveRide?.destinationLat ?? rideDetails?.destinationLat;
  const destLng   = liveRide?.destinationLng ?? rideDetails?.destinationLng;

  // Show map while a driver is assigned and ride is still active
  const showMap = !!(liveRide?.driverId && status >= 1 && status < STEPS.length - 1);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-black font-black text-xs">R</span>
          </div>
          <h1 className="text-lg font-black">RideX</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm hidden md:block">{user?.displayName || user?.email}</p>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="px-4 py-8">
        <div className="max-w-md mx-auto space-y-6">

          {/* Current status banner */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <div className="bg-black rounded-xl p-4 text-center">
              <p className="text-4xl mb-2">{STEPS[status].icon}</p>
              <p className="text-xl font-bold text-yellow-400">{STEPS[status].label}</p>
              <p className="text-gray-400 text-sm mt-1">{STEPS[status].desc}</p>
            </div>
          </div>

          {/* Live driver map */}
          {showMap && (
            <div>
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
              <div className="flex items-center gap-5 mt-2.5 px-1">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />Driver
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />Pickup
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />Destination
                </span>
              </div>
            </div>
          )}

          {/* Driver info card — appears once a driver accepts */}
          {liveRide?.driverName && (
            <div className="bg-gray-900 rounded-2xl p-6">
              <p className="text-gray-400 text-sm mb-4">Your Driver</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
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
                    <p className="text-yellow-400 text-sm">★ {parseFloat(liveRide.driverRating).toFixed(1)}</p>
                  )}
                </div>
                {liveRide.driverPhone && (
                  <a
                    href={`tel:${liveRide.driverPhone}`}
                    className="w-10 h-10 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center flex-shrink-0"
                    aria-label="Call driver"
                  >
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Progress steps */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <p className="text-gray-400 text-sm mb-4">Ride Progress</p>
            {STEPS.map((step, index) => (
              <div key={index} className="flex items-center gap-3 mb-3 last:mb-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                  ${index <= status ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                  {index < status ? '✓' : index + 1}
                </div>
                <p className={`${index <= status ? 'text-white font-semibold' : 'text-gray-500'}`}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>

          {/* Fare */}
          <div className="bg-gray-900 rounded-2xl p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-sm">Total Fare</p>
                <p className="text-3xl font-bold text-yellow-400">£{parseFloat(rideDetails.price).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-sm">Payment</p>
                <p className="font-semibold">💳 Card</p>
              </div>
            </div>
          </div>

          {/* Done — only shown when ride is complete */}
          {status === STEPS.length - 1 && (
            <button
              onClick={() => navigate('/book')}
              className="w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition"
            >
              Book Another Ride
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

export default RideStatus;
