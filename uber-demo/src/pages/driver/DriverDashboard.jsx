// DriverDashboard.jsx
// Full-featured driver dashboard for RideX — mirrors Uber Driver app structure.
// Tabs: Rides | Earnings | History | Profile
// Fixed top navbar + fixed bottom tab bar + scrollable content between them.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

import { auth, db } from '../../firebase';
import {
  doc, updateDoc, collection, query, where, orderBy,
  limit, onSnapshot, runTransaction, increment, serverTimestamp,
  getDocs, startAfter,
} from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Play a short three-note chime using Web Audio API */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
}

/** Format a Firestore timestamp or Date into a friendly string */
function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Format a Firestore timestamp into "Today 3:45 PM" style */
function formatDateTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (isToday) return `Today ${timeStr}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${timeStr}`;
}

/** Truncate long strings */
function trunc(str, n = 30) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ─────────────────────────────────────────────
// Skeleton loader atoms
// ─────────────────────────────────────────────
function SkeletonLine({ className = '' }) {
  return <div className={`bg-gray-800 rounded animate-pulse ${className}`} />;
}
function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
      <SkeletonLine className="h-4 w-1/2" />
      <SkeletonLine className="h-3 w-3/4" />
      <SkeletonLine className="h-3 w-2/3" />
    </div>
  );
}

// ─────────────────────────────────────────────
// Toast notification system
// ─────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-24 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all duration-300
            ${t.type === 'success' ? 'bg-green-500 text-white' : ''}
            ${t.type === 'error'   ? 'bg-red-500   text-white' : ''}
            ${t.type === 'warning' ? 'bg-yellow-400 text-black' : ''}
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Stat card atom
// ─────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center flex-1 min-w-0">
      <p className="text-yellow-400 font-black text-lg leading-tight">{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
      <p className="text-gray-500 text-xs mt-1">{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Mapbox active-ride map (inline, no react-map-gl)
// ─────────────────────────────────────────────
function ActiveRideMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!token) return;

    // Dynamically import mapbox-gl to avoid SSR issues
    // eslint-disable-next-line import/no-webpack-loader-syntax
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = token;

      const centerLng = driverLng || pickupLng || -0.1276;
      const centerLat = driverLat || pickupLat || 51.5074;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [centerLng, centerLat],
        zoom: 13,
      });
      mapRef.current = map;

      map.on('load', () => {
        // Driver marker (blue pulsing)
        if (driverLat && driverLng) {
          const el = document.createElement('div');
          el.className = 'driver-dot';
          el.style.cssText = `
            width:18px;height:18px;border-radius:50%;
            background:#3b82f6;border:3px solid white;
            box-shadow:0 0 0 6px rgba(59,130,246,0.35);
            animation:pulse 1.5s infinite;
          `;
          new mapboxgl.Marker(el).setLngLat([driverLng, driverLat]).addTo(map);
        }

        // Pickup marker (green)
        if (pickupLat && pickupLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#22c55e;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([pickupLng, pickupLat]).addTo(map);
        }

        // Destination marker (red)
        if (destLat && destLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#ef4444;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([destLng, destLat]).addTo(map);
        }

        // Fit bounds to show all markers
        const coords = [
          driverLat  && [driverLng, driverLat],
          pickupLat  && [pickupLng, pickupLat],
          destLat    && [destLng, destLat],
        ].filter(Boolean);
        if (coords.length > 1) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50 });
        }
      });
    }).catch(() => {});

    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="w-full h-48 rounded-2xl overflow-hidden border border-gray-800" />
  );
}

// ─────────────────────────────────────────────
// Receipt modal (shown after completing a ride)
// ─────────────────────────────────────────────
function ReceiptModal({ ride, onClose }) {
  if (!ride) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-sm animate-fade-in">
        {/* Animated check */}
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-white font-black text-2xl text-center mb-1">Ride Complete!</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Great job! Here's your summary.</p>

        {/* Route */}
        <div className="bg-black rounded-xl p-4 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-gray-300 truncate">{ride.pickupAddress}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="text-gray-300 truncate">{ride.destinationAddress}</span>
          </div>
          <p className="text-gray-500 text-xs mt-2">{ride.distance} mi · {ride.duration} mins</p>
        </div>

        {/* Payment breakdown */}
        <div className="bg-black rounded-xl p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Customer paid</span>
            <span className="text-white font-semibold">£{parseFloat(ride.price || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Platform fee (20%)</span>
            <span className="text-red-400 font-semibold">-£{parseFloat(ride.platformFee || 0).toFixed(2)}</span>
          </div>
          <div className="border-t border-gray-800 pt-2 flex justify-between">
            <span className="text-white font-bold">Your earnings</span>
            <span className="text-yellow-400 font-black text-xl">£{parseFloat(ride.driverEarnings || 0).toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 transition text-lg"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 1 — RIDES
// ─────────────────────────────────────────────
function RidesTab({
  driver, isOnline, toggleOnline,
  availableRides, availableLoading,
  activeRide,
  handleAcceptRide, updateRideStatus, completeRide,
  acceptingId,
}) {
  // Countdown state for ride request popup
  const [countdown, setCountdown]       = useState(15);
  const [popupRide, setPopupRide]       = useState(null);
  const countdownRef                    = useRef(null);
  const prevRidesLen                    = useRef(0);

  // Show popup when a new ride appears in availableRides
  useEffect(() => {
    if (availableRides.length > prevRidesLen.current && availableRides.length > 0) {
      setPopupRide(availableRides[0]);
      setCountdown(15);
    }
    prevRidesLen.current = availableRides.length;
  }, [availableRides]);

  // Countdown timer for popup
  useEffect(() => {
    if (!popupRide) return;
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownRef.current); setPopupRide(null); return 15; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [popupRide]);

  const dismissPopup = () => { clearInterval(countdownRef.current); setPopupRide(null); };

  const statusBanner = {
    driver_assigned: { bg: 'bg-yellow-400', text: 'text-black', label: '🚗 Head to Pickup' },
    arrived:         { bg: 'bg-blue-600',   text: 'text-white', label: '📍 Waiting for Customer' },
    in_progress:     { bg: 'bg-green-500',  text: 'text-white', label: '🛣️ Ride in Progress' },
  };

  return (
    <div className="space-y-4">
      {/* ── Stats row ── */}
      <div className="flex gap-3">
        <StatCard label="Today's Earnings" value={`£${parseFloat(driver?.todayEarnings || 0).toFixed(2)}`} />
        <StatCard label="Total Rides"      value={driver?.totalRides || 0} />
        <StatCard label="Rating"           value={`★ ${parseFloat(driver?.rating || 5).toFixed(1)}`} />
        <StatCard
          label="Status"
          value={isOnline ? '🟢' : '🔴'}
          sub={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* ── Ride request popup ── */}
      {popupRide && isOnline && (
        <div className="fixed top-16 left-0 right-0 z-[150] px-4 animate-slide-down">
          <div className="bg-gray-900 border-2 border-yellow-400 rounded-2xl p-4 shadow-2xl">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-white font-black text-lg">New Ride Request 🚗</h3>
              <span className="text-yellow-400 font-black text-xl">{countdown}s</span>
            </div>

            <p className="text-white font-bold mb-1">{popupRide.customerName || 'Customer'}</p>

            <div className="space-y-1 mb-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-gray-300 truncate">{trunc(popupRide.pickupAddress, 40)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-gray-300 truncate">{trunc(popupRide.destinationAddress, 40)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-3 text-sm">
              <span className="text-gray-400">{popupRide.distance} mi · {popupRide.duration} mins</span>
              <span className="text-yellow-400 font-black text-base">
                £{(parseFloat(popupRide.price || 0) * 0.8).toFixed(2)} earnings
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-700 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 15) * 100}%` }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { handleAcceptRide(popupRide.id); dismissPopup(); }}
                className="flex-1 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 transition"
              >
                Accept
              </button>
              <button
                onClick={dismissPopup}
                className="flex-1 py-3 bg-gray-700 text-white font-bold rounded-xl hover:bg-gray-600 transition"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Offline banner ── */}
      {!isOnline && !activeRide && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl p-5 text-center">
          <p className="text-yellow-400 font-bold text-base mb-1">You are offline</p>
          <p className="text-gray-400 text-sm mb-4">Go online to start receiving ride requests.</p>
          <button
            onClick={toggleOnline}
            className="px-6 py-2.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
          >
            Go Online
          </button>
        </div>
      )}

      {/* ── Active ride ── */}
      {activeRide && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`${statusBanner[activeRide.status]?.bg || 'bg-gray-700'} ${statusBanner[activeRide.status]?.text || 'text-white'} rounded-2xl p-4 text-center font-black text-xl`}>
            {statusBanner[activeRide.status]?.label || 'Active Ride'}
          </div>

          {/* Customer info */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-400 text-xs mb-3 uppercase tracking-widest">Customer</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-black font-black text-xl">
                  {(activeRide.customerName || 'C')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{activeRide.customerName || 'Customer'}</p>
                {activeRide.customerPhone && (
                  <a href={`tel:${activeRide.customerPhone}`} className="text-yellow-400 text-sm hover:underline">
                    {activeRide.customerPhone}
                  </a>
                )}
                <p className="text-gray-400 text-sm">★ {activeRide.customerRating || '5.0'}</p>
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-400 text-xs mb-3 uppercase tracking-widest">Route</p>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
                <span className="w-0.5 flex-1 bg-gray-700 my-1" />
                <span className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-white text-sm font-semibold">{activeRide.pickupAddress}</p>
                  <p className="text-gray-500 text-xs">Pickup</p>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{activeRide.destinationAddress}</p>
                  <p className="text-gray-500 text-xs">Destination</p>
                </div>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-3">{activeRide.distance} mi · {activeRide.duration} mins</p>
          </div>

          {/* Fare breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-400 text-xs mb-3 uppercase tracking-widest">Fare</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total fare</span>
                <span className="text-white font-semibold">£{parseFloat(activeRide.price || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Platform fee (20%)</span>
                <span className="text-gray-400">-£{(parseFloat(activeRide.price || 0) * 0.2).toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-800 pt-2 flex justify-between">
                <span className="text-white font-bold">Your earnings (80%)</span>
                <span className="text-yellow-400 font-black text-xl">
                  £{(parseFloat(activeRide.price || 0) * 0.8).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Map */}
          <ActiveRideMap
            driverLat={driver?.currentLat}
            driverLng={driver?.currentLng}
            pickupLat={activeRide.pickupLat}
            pickupLng={activeRide.pickupLng}
            destLat={activeRide.destinationLat}
            destLng={activeRide.destinationLng}
          />

          {/* Action button */}
          <div className="space-y-3">
            {activeRide.status === 'driver_assigned' && (
              <button
                onClick={() => updateRideStatus(activeRide.id, 'arrived')}
                className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 transition text-lg"
              >
                Arrived at Pickup
              </button>
            )}
            {activeRide.status === 'arrived' && (
              <button
                onClick={() => updateRideStatus(activeRide.id, 'in_progress')}
                className="w-full py-4 bg-green-500 text-white font-black rounded-2xl hover:bg-green-400 transition text-lg"
              >
                Start Ride
              </button>
            )}
            {activeRide.status === 'in_progress' && (
              <button
                onClick={() => completeRide(activeRide)}
                className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 transition text-lg"
              >
                Complete Ride
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Available rides (online, no active ride) ── */}
      {isOnline && !activeRide && (
        <div>
          <h2 className="text-white font-black text-lg mb-3">Available Rides</h2>

          {availableLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : availableRides.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-4xl mb-3">🚦</p>
              <p className="text-white font-bold mb-1">No ride requests right now</p>
              <p className="text-gray-500 text-sm">Stay online to receive requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRides.map(ride => (
                <div key={ride.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  {/* Customer header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-black font-black">
                          {(ride.customerName || 'C')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-bold">{ride.customerName || 'Customer'}</p>
                        <p className="text-gray-500 text-xs">{formatTime(ride.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">£{parseFloat(ride.price || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-xs">total</p>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="flex gap-2 mb-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      <span className="w-0.5 flex-1 bg-gray-700 my-1" />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-gray-300 text-sm truncate">{ride.pickupAddress}</p>
                      <p className="text-gray-300 text-sm truncate">{ride.destinationAddress}</p>
                    </div>
                  </div>

                  {/* Meta + earnings */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-gray-500 text-xs">{ride.distance} mi · {ride.duration} mins</p>
                    <div className="text-right">
                      <p className="text-gray-400 text-xs">Your earnings</p>
                      <p className="text-yellow-400 font-black">
                        £{(parseFloat(ride.price || 0) * 0.8).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Accept button */}
                  <button
                    onClick={() => handleAcceptRide(ride.id)}
                    disabled={!!acceptingId}
                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {acceptingId === ride.id ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Accepting…
                      </>
                    ) : 'Accept Ride'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 2 — EARNINGS
// ─────────────────────────────────────────────
function EarningsTab({ driver }) {
  const [chartData,   setChartData]   = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [recentTxns,  setRecentTxns]  = useState([]);

  // Build last 7 days chart data from completed rides
  useEffect(() => {
    if (!driver?.uid) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driver.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(q, snap => {
      const days = {};
      // Pre-fill last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-GB', { weekday: 'short' });
        days[key] = { day: key, earnings: 0 };
      }

      const txns = [];
      snap.docs.forEach(docSnap => {
        const r = { id: docSnap.id, ...docSnap.data() };
        const ts = r.completedAt?.toDate ? r.completedAt.toDate() : null;
        if (ts && ts >= sevenDaysAgo) {
          const key = ts.toLocaleDateString('en-GB', { weekday: 'short' });
          if (days[key]) days[key].earnings += parseFloat(r.driverEarnings || 0);
        }
        txns.push(r);
      });

      setChartData(Object.values(days).map(d => ({ ...d, earnings: parseFloat(d.earnings.toFixed(2)) })));
      setRecentTxns(txns.slice(0, 10));
      setChartLoading(false);
    }, () => setChartLoading(false));

    return () => unsub();
  }, [driver?.uid]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
          <p className="text-gray-400 text-xs">{label}</p>
          <p className="text-yellow-400 font-black">£{payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">Today</p>
          <p className="text-yellow-400 font-black text-2xl">£{parseFloat(driver?.todayEarnings || 0).toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">This Week</p>
          <p className="text-yellow-400 font-black text-2xl">£{parseFloat(driver?.weekEarnings || 0).toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">All Time</p>
          <p className="text-yellow-400 font-black text-2xl">£{parseFloat(driver?.earnings || 0).toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-gray-400 text-xs mb-1">Total Rides</p>
          <p className="text-yellow-400 font-black text-2xl">{driver?.totalRides || 0}</p>
        </div>
      </div>

      {/* Weekly bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <p className="text-white font-bold mb-4">Last 7 Days</p>
        {chartLoading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={24}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="earnings" fill="#facc15" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent transactions */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <p className="text-white font-bold mb-4">Recent Transactions</p>
        {recentTxns.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {recentTxns.map((r, i) => (
              <div key={r.id || i} className="py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-gray-400 text-xs">{formatDateTime(r.completedAt)}</p>
                  <p className="text-white text-sm truncate">
                    {trunc(r.pickupAddress, 20)} → {trunc(r.destinationAddress, 20)}
                  </p>
                </div>
                <p className="text-yellow-400 font-black">£{parseFloat(r.driverEarnings || 0).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 3 — HISTORY
// ─────────────────────────────────────────────
function HistoryTab({ driver }) {
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial load
  useEffect(() => {
    if (!driver?.uid) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driver.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRides(data);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [driver?.uid]);

  // Load more
  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'rides'),
        where('driverId', '==', driver.uid),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        startAfter(lastDoc),
        limit(20),
      );
      const snap = await getDocs(q);
      const more = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRides(prev => [...prev, ...more]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
    } catch (_) {}
    setLoadingMore(false);
  };

  if (loading) return (
    <div className="space-y-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
  );

  if (rides.length === 0) return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
      <p className="text-4xl mb-3">🚗</p>
      <p className="text-white font-bold mb-1">No completed rides yet</p>
      <p className="text-gray-500 text-sm">Accept your first ride to get started!</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {rides.map(r => (
        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-gray-400 text-xs">{formatDateTime(r.completedAt)}</p>
              <p className="text-gray-400 text-xs mt-0.5">Customer: {r.customerName || 'Unknown'}</p>
            </div>
            <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-full">
              Completed ✓
            </span>
          </div>

          <div className="flex gap-2 mb-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="w-0.5 flex-1 bg-gray-700 my-1" />
              <span className="w-2 h-2 rounded-full bg-red-400" />
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="text-white text-sm truncate">{r.pickupAddress}</p>
              <p className="text-white text-sm truncate">{r.destinationAddress}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{r.distance} mi · {r.duration} mins</span>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Your earnings</p>
              <p className="text-yellow-400 font-black">£{parseFloat(r.driverEarnings || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition disabled:opacity-60"
        >
          {loadingMore ? 'Loading…' : 'Load More'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 4 — PROFILE
// ─────────────────────────────────────────────
function ProfileTab({ driver, setDriver, showToast }) {
  const navigate = useNavigate();
  const [form,   setForm]   = useState({ name: '', phone: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Pre-fill form from driver data
  useEffect(() => {
    if (driver) {
      setForm({ name: driver.name || '', phone: driver.phone || '', city: driver.city || '' });
    }
  }, [driver]);

  const handleSave = async () => {
    if (!driver?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'drivers', driver.uid), {
        name:  form.name.trim(),
        phone: form.phone.trim(),
        city:  form.city.trim(),
      });
      setDriver(prev => ({ ...prev, name: form.name, phone: form.phone, city: form.city }));
      setSaved(true);
      showToast('Profile updated successfully!', 'success');
      setTimeout(() => setSaved(false), 3000);
    } catch (_) {
      showToast('Failed to save. Please try again.', 'error');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/driver/login');
    } catch (_) {}
  };

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-black font-black text-3xl">
            {(driver?.name || 'D')[0].toUpperCase()}
          </span>
        </div>
        <p className="text-white font-black text-xl">{driver?.name || 'Driver'}</p>
        <p className="text-gray-400 text-sm">{driver?.email || ''}</p>
        <p className="text-yellow-400 font-bold mt-1">★ {parseFloat(driver?.rating || 5).toFixed(1)}</p>
        {driver?.createdAt && (
          <p className="text-gray-500 text-xs mt-1">
            Member since {driver.createdAt.toDate
              ? driver.createdAt.toDate().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
              : ''}
          </p>
        )}
      </div>

      {/* Quick stats */}
      <div className="flex gap-3">
        <StatCard label="Total Rides"    value={driver?.totalRides || 0} />
        <StatCard label="All Time Earn." value={`£${parseFloat(driver?.earnings || 0).toFixed(0)}`} />
        <StatCard label="Rating"         value={`★ ${parseFloat(driver?.rating || 5).toFixed(1)}`} />
      </div>

      {/* Editable info */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <p className="text-white font-bold">Personal Information</p>
        {[
          { label: 'Full Name', key: 'name',  type: 'text' },
          { label: 'Phone',     key: 'phone', type: 'tel'  },
          { label: 'City',      key: 'city',  type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="text-gray-400 text-xs block mb-1">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
            />
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Saving…
            </>
          ) : saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Vehicle info (read-only) */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <p className="text-white font-bold">Vehicle Information</p>
        {[
          { label: 'Vehicle Type',          value: driver?.vehicleType },
          { label: 'Make & Model',          value: driver?.vehicleMake },
          { label: 'Registration',          value: driver?.vehicleReg },
          { label: 'Year',                  value: driver?.vehicleYear },
          { label: 'Driving Licence No.',   value: driver?.licenceNumber },
          { label: 'Country',               value: driver?.country },
        ].map(({ label, value }) => value ? (
          <div key={label} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
            <span className="text-gray-400 text-sm">{label}</span>
            <span className="text-white text-sm font-semibold">{value}</span>
          </div>
        ) : null)}
        <p className="text-gray-600 text-xs mt-2">
          Vehicle details cannot be changed after approval. Contact support to update.
        </p>
      </div>

      {/* Logout */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <p className="text-white font-bold mb-3">Account</p>
        <button
          onClick={handleLogout}
          className="w-full py-3 border border-red-500/50 text-red-400 font-bold rounded-xl hover:bg-red-500/10 transition"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DriverDashboard() {
  const navigate = useNavigate();

  // ── Core state ──
  const [driver,          setDriver]          = useState(null);
  const [isOnline,        setIsOnline]        = useState(false);
  const [activeTab,       setActiveTab]       = useState('rides');
  const [togglingOnline,  setTogglingOnline]  = useState(false);

  // ── Ride state ──
  const [availableRides,  setAvailableRides]  = useState([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [activeRide,      setActiveRide]      = useState(null);
  const [acceptingId,     setAcceptingId]     = useState(null);

  // ── Receipt modal ──
  const [showReceipt,  setShowReceipt]  = useState(false);
  const [completedRide, setCompletedRide] = useState(null);

  // ── Toast notifications ──
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  /** showToast(message, 'success' | 'error' | 'warning') */
  const showToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Auth + driver data ──
  // Uses the Firestore REST API (not SDK) to avoid the "client is offline"
  // error that the SDK throws immediately after onAuthStateChanged fires.
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async user => {
      if (!user) { navigate('/driver/login'); return; }
      try {
        const idToken   = await user.getIdToken();
        const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
        const restUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;

        const res = await fetch(restUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (res.status === 404) { navigate('/driver/login'); return; }
        if (!res.ok) throw new Error(`Firestore REST ${res.status}`);

        const json   = await res.json();
        const fields = json.fields || {};

        // Convert Firestore REST field format { stringValue, doubleValue, … } → plain JS object
        const parse = v => {
          if (!v) return undefined;
          if ('stringValue'  in v) return v.stringValue;
          if ('doubleValue'  in v) return v.doubleValue;
          if ('integerValue' in v) return Number(v.integerValue);
          if ('booleanValue' in v) return v.booleanValue;
          if ('timestampValue' in v) return { toDate: () => new Date(v.timestampValue) };
          return undefined;
        };

        const data = Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, parse(v)])
        );

        setDriver({ uid: user.uid, ...data });
        setIsOnline(data.isOnline || false);
      } catch (_) {
        navigate('/driver/login');
      }
    });
    return () => unsubAuth();
  }, [navigate]);

  // ── GPS location tracking when online ──
  useEffect(() => {
    if (!isOnline || !driver) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        updateDoc(doc(db, 'drivers', driver.uid), {
          currentLat: pos.coords.latitude,
          currentLng: pos.coords.longitude,
          lastSeen:   serverTimestamp(),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, driver]);

  // ── Available rides listener ──
  const prevRidesRef = useRef([]);
  useEffect(() => {
    if (!driver || !isOnline) {
      setAvailableRides([]);
      setAvailableLoading(false);
      return;
    }
    setAvailableLoading(true);
    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'confirmed'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            customerName:       data.customerName       || data.userName    || 'Customer',
            pickupAddress:      data.pickupAddress      || data.pickup      || 'Pickup location',
            destinationAddress: data.destinationAddress || data.destination || 'Destination',
            price:              data.price              || data.fare        || 0,
            distance:           data.distance           || '—',
            duration:           data.duration           || '—',
          };
        })
        .filter(r => !r.driverId || r.driverId === '' || r.driverId === null);

      if (rides.length > prevRidesRef.current.length) playNotificationSound();
      prevRidesRef.current = rides;
      setAvailableRides(rides);
      setAvailableLoading(false);
    }, () => setAvailableLoading(false));
    return () => unsub();
  }, [driver, isOnline]);

  // ── Active ride listener ──
  useEffect(() => {
    if (!driver) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driver.uid),
      where('status', 'in', ['driver_assigned', 'arrived', 'in_progress']),
    );
    const unsub = onSnapshot(q, snap => {
      if (snap.empty) { setActiveRide(null); return; }
      const rideData = snap.docs[0].data();
      setActiveRide({
        id: snap.docs[0].id,
        ...rideData,
        customerName:       rideData.customerName       || rideData.userName    || 'Customer',
        pickupAddress:      rideData.pickupAddress      || rideData.pickup      || 'Pickup location',
        destinationAddress: rideData.destinationAddress || rideData.destination || 'Destination',
        price:              rideData.price              || rideData.fare        || 0,
        distance:           rideData.distance           || '—',
        duration:           rideData.duration           || '—',
      });
    });
    return () => unsub();
  }, [driver]);

  // ── Toggle online status ──
  const toggleOnline = async () => {
    if (!driver || togglingOnline) return;
    setTogglingOnline(true);
    try {
      const newStatus = !isOnline;
      await updateDoc(doc(db, 'drivers', driver.uid), {
        isOnline:  newStatus,
        lastSeen:  serverTimestamp(),
      });
      setIsOnline(newStatus);
      showToast(newStatus ? 'You are now online!' : 'You are now offline.', 'warning');
    } catch (_) {
      showToast('Failed to update status.', 'error');
    }
    setTogglingOnline(false);
  };

  // ── Accept ride (Firestore transaction) ──
  const handleAcceptRide = async rideId => {
    if (!driver || acceptingId) return;
    setAcceptingId(rideId);
    try {
      await runTransaction(db, async transaction => {
        const rideRef  = doc(db, 'rides', rideId);
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('Ride no longer exists');
        const existingDriver = rideSnap.data().driverId;
        if (existingDriver !== null && existingDriver !== '' && existingDriver !== undefined) {
          throw new Error('Ride already taken');
        }
        transaction.update(rideRef, {
          driverId:     driver.uid,
          driverName:   driver.name,
          driverCar:    `${driver.vehicleType || ''} • ${driver.vehicleReg || ''}`.trim(),
          driverRating: driver.rating,
          driverPhone:  driver.phone,
          status:       'driver_assigned',
          assignedAt:   serverTimestamp(),
        });
      });
      showToast('Ride accepted! Head to pickup location.', 'success');
      setActiveTab('rides');
    } catch (err) {
      if (err.message === 'Ride already taken') {
        showToast('Sorry, this ride was taken by another driver.', 'error');
      } else {
        showToast('Failed to accept ride. Please try again.', 'error');
      }
    }
    setAcceptingId(null);
  };

  // ── Update ride status ──
  const updateRideStatus = async (rideId, status) => {
    try {
      await updateDoc(doc(db, 'rides', rideId), { status, updatedAt: serverTimestamp() });
      if (status === 'arrived')     showToast('Marked as arrived at pickup.', 'success');
      if (status === 'in_progress') showToast('Ride started! Drive safely.', 'success');
    } catch (_) {
      showToast('Failed to update ride status.', 'error');
    }
  };

  // ── Complete ride ──
  const completeRide = async ride => {
    try {
      const driverEarnings = parseFloat(ride.price || 0) * 0.8;
      const platformFee    = parseFloat(ride.price || 0) * 0.2;

      await updateDoc(doc(db, 'rides', ride.id), {
        status:         'completed',
        completedAt:    serverTimestamp(),
        driverEarnings: driverEarnings,
        platformFee:    platformFee,
      });

      await updateDoc(doc(db, 'drivers', driver.uid), {
        earnings:      increment(driverEarnings),
        todayEarnings: increment(driverEarnings),
        weekEarnings:  increment(driverEarnings),
        totalRides:    increment(1),
      });

      // Refresh local driver state
      setDriver(prev => ({
        ...prev,
        earnings:      (parseFloat(prev?.earnings      || 0) + driverEarnings),
        todayEarnings: (parseFloat(prev?.todayEarnings || 0) + driverEarnings),
        weekEarnings:  (parseFloat(prev?.weekEarnings  || 0) + driverEarnings),
        totalRides:    (parseInt(prev?.totalRides       || 0) + 1),
      }));

      setCompletedRide({ ...ride, driverEarnings, platformFee });
      setShowReceipt(true);
    } catch (_) {
      showToast('Failed to complete ride. Please try again.', 'error');
    }
  };

  // ─── Loading state ───
  if (!driver) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-black font-black text-2xl">R</span>
          </div>
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ─── Tab definitions ───
  const tabs = [
    { id: 'rides',    label: 'Rides',    icon: '🚗' },
    { id: 'earnings', label: 'Earnings', icon: '💰' },
    { id: 'history',  label: 'History',  icon: '🕐' },
    { id: 'profile',  label: 'Profile',  icon: '👤' },
  ];

  return (
    <div className="min-h-screen bg-black">

      {/* ── Fixed top navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-gray-800 h-16 flex items-center px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-black font-black text-sm">R</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight">RideX</span>
        </div>

        {/* Driver name */}
        <div className="text-center flex-1">
          <p className="text-white font-bold text-sm leading-tight">{driver.name}</p>
          <p className="text-gray-500 text-xs">Driver</p>
        </div>

        {/* Online/offline toggle */}
        <div className="flex-1 flex justify-end">
          <button
            onClick={toggleOnline}
            disabled={togglingOnline}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition
              ${isOnline
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-red-500/20   text-red-400   border border-red-500/40'}
              disabled:opacity-60`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'} ${isOnline ? 'animate-pulse' : ''}`} />
            {togglingOnline ? '…' : isOnline ? 'Online' : 'Offline'}
          </button>
        </div>
      </nav>

      {/* ── Scrollable content area ── */}
      <main className="pt-16 pb-20 px-4 min-h-screen">
        <div className="max-w-lg mx-auto py-4">

          {activeTab === 'rides' && (
            <RidesTab
              driver={driver}
              isOnline={isOnline}
              toggleOnline={toggleOnline}
              availableRides={availableRides}
              availableLoading={availableLoading}
              activeRide={activeRide}
              handleAcceptRide={handleAcceptRide}
              updateRideStatus={updateRideStatus}
              completeRide={completeRide}
              acceptingId={acceptingId}
            />
          )}

          {activeTab === 'earnings' && <EarningsTab driver={driver} />}

          {activeTab === 'history' && <HistoryTab driver={driver} />}

          {activeTab === 'profile' && (
            <ProfileTab driver={driver} setDriver={setDriver} showToast={showToast} />
          )}
        </div>
      </main>

      {/* ── Fixed bottom tab bar ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex z-50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition
              ${activeTab === tab.id ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-[10px] font-bold">{tab.label}</span>
            {activeTab === tab.id && (
              <span className="absolute -top-px w-8 h-0.5 bg-yellow-400 rounded-full" />
            )}
          </button>
        ))}
      </nav>

      {/* ── Toast container ── */}
      <ToastContainer toasts={toasts} />

      {/* ── Receipt modal ── */}
      {showReceipt && completedRide && (
        <ReceiptModal
          ride={completedRide}
          onClose={() => { setShowReceipt(false); setCompletedRide(null); }}
        />
      )}
    </div>
  );
}
