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
    <div className="fixed bottom-[5.5rem] right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]">
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
// KPI stat card — primary accent (earnings) vs neutral
// ─────────────────────────────────────────────
function StatCard({ label, value, children, sub, accent = false, large = false }) {
  return (
    <div className={`rounded-2xl p-4 flex-1 min-w-0 flex flex-col gap-1 shadow-sm
      ${accent
        ? 'bg-yellow-400/5 border border-yellow-400/25'
        : 'bg-gray-900 border border-gray-800'
      }`}>
      <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 leading-none">{label}</p>
      {children ?? (
        <p className={`font-black leading-tight ${large ? 'text-3xl' : 'text-xl'} ${accent ? 'text-yellow-400' : 'text-white'}`}>
          {value}
        </p>
      )}
      {sub && <p className="text-xs text-gray-400 leading-none">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Status badge — semantic colors
// ─────────────────────────────────────────────
function StatusBadge({ online }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
      ${online
        ? 'bg-green-500/15 border-green-500/30 text-green-400'
        : 'bg-red-500/15   border-red-500/30   text-red-400'
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

// ─────────────────────────────────────────────
// SVG tab icons — outline style, active = filled/bold
// ─────────────────────────────────────────────
function TabIcon({ id, active }) {
  const w = active ? 2.25 : 1.75;
  if (id === 'rides') return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2h1l2-4h12l2 4h1a2 2 0 012 2v6a2 2 0 01-2 2h-2" />
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
    </svg>
  );
  if (id === 'earnings') return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v1m0 10v1M9 9.5A2.5 2.5 0 0112 8c1.38 0 2.5.9 2.5 2s-1.12 2-2.5 2-2.5.9-2.5 2 1.12 2 2.5 2a2.5 2.5 0 002.5-1.5" />
    </svg>
  );
  if (id === 'history') return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l3.5 2" />
    </svg>
  );
  if (id === 'profile') return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
  return null;
}

// ─────────────────────────────────────────────
// Section header — consistent across all tabs
// ─────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h2 className="text-white font-black text-base leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Empty state component — icon, message, optional hint
// ─────────────────────────────────────────────
function EmptyState({ icon, title, body, hint, cta, onCta }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-gray-600">
        {icon}
      </div>
      <div>
        <p className="text-white font-bold text-base">{title}</p>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{body}</p>
      </div>
      {hint && (
        <div className="bg-gray-800/60 rounded-xl px-4 py-2">
          <p className="text-gray-500 text-xs">{hint}</p>
        </div>
      )}
      {cta && (
        <button
          onClick={onCta}
          className="mt-1 px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-xl transition"
        >
          {cta}
        </button>
      )}
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

        if (pickupLat && pickupLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#22c55e;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([pickupLng, pickupLat]).addTo(map);
        }

        if (destLat && destLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#ef4444;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([destLng, destLat]).addTo(map);
        }

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
    <div ref={containerRef} className="w-full h-48 rounded-2xl overflow-hidden border border-gray-800 shadow-lg shadow-black/40" />
  );
}

// ─────────────────────────────────────────────
// Receipt modal (shown after completing a ride)
// ─────────────────────────────────────────────
function ReceiptModal({ ride, onClose }) {
  if (!ride) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-white font-black text-2xl text-center mb-1">Ride Complete!</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Great job! Here's your summary.</p>

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
          className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 active:bg-yellow-500 transition text-lg"
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
  otpInput, setOtpInput, otpError, setOtpError, verifyOtp,
  onlineMinutes,
}) {
  function fmtOnlineTime(mins) {
    if (mins < 1) return 'Just started';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const [countdown, setCountdown]       = useState(15);
  const [popupRide, setPopupRide]       = useState(null);
  const countdownRef                    = useRef(null);
  const prevRidesLen                    = useRef(0);

  useEffect(() => {
    if (availableRides.length > prevRidesLen.current && availableRides.length > 0) {
      setPopupRide(availableRides[0]);
      setCountdown(15);
    }
    prevRidesLen.current = availableRides.length;
  }, [availableRides]);

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
    driver_assigned: { bg: 'bg-yellow-400',  text: 'text-black', label: 'Head to Pickup',        dot: 'bg-black/20' },
    arrived:         { bg: 'bg-blue-600',     text: 'text-white', label: 'Waiting for Customer',  dot: 'bg-white/20' },
    in_progress:     { bg: 'bg-green-500',    text: 'text-white', label: 'Ride in Progress',      dot: 'bg-white/20' },
  };

  return (
    <div className="space-y-5">

      {/* ── KPI cards — 2x2 grid for better readability ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Today's Earnings"
          value={`£${parseFloat(driver?.todayEarnings || 0).toFixed(2)}`}
          accent
        />
        <StatCard
          label="Total Rides"
          value={driver?.totalRides || 0}
          sub="all time"
        />
        <StatCard
          label="Rating"
          value={`${parseFloat(driver?.rating || 5).toFixed(1)}`}
          sub="out of 5.0"
        />
        <StatCard label="Status">
          <div className="mt-0.5">
            <StatusBadge online={isOnline} />
          </div>
          <p className="text-xs text-gray-500 leading-none mt-0.5">
            {isOnline ? 'Receiving requests' : 'Not visible'}
          </p>
        </StatCard>
      </div>

      {/* ── Trust strip — shown only when online ── */}
      {isOnline && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-green-400 text-xs font-semibold">Online {fmtOnlineTime(onlineMinutes)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-600 text-xs">Next payout</span>
            <span className="text-yellow-400 text-xs font-black">£{parseFloat(driver?.weekEarnings || 0).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* ── Ride request popup ── */}
      {popupRide && isOnline && (
        <div className="fixed top-16 left-0 right-0 z-[150] px-4 animate-slide-down">
          <div className="bg-gray-900 border-2 border-yellow-400 rounded-2xl p-4 shadow-2xl shadow-black/60">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-yellow-400 font-semibold mb-0.5">New Ride Request</p>
                <h3 className="text-white font-black text-lg leading-tight">{popupRide.customerName || 'Customer'}</h3>
              </div>
              <div className="text-right">
                <span className="text-yellow-400 font-black text-2xl leading-none">{countdown}</span>
                <p className="text-gray-500 text-[10px]">seconds</p>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-gray-300 truncate">{trunc(popupRide.pickupAddress, 40)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                <span className="text-gray-300 truncate">{trunc(popupRide.destinationAddress, 40)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-500 text-xs">{popupRide.distance} mi · {popupRide.duration} mins</span>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Your earnings</p>
                <p className="text-yellow-400 font-black text-base">
                  £{(parseFloat(popupRide.price || 0) * 0.8).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Countdown progress bar */}
            <div className="h-1 bg-gray-800 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / 15) * 100}%` }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { handleAcceptRide(popupRide.id); dismissPopup(); }}
                className="flex-1 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 active:bg-green-600 transition"
              >
                Accept
              </button>
              <button
                onClick={dismissPopup}
                className="flex-1 py-3 bg-gray-800 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 active:bg-gray-600 transition"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Offline banner ── */}
      {!isOnline && !activeRide && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 12.728A9 9 0 0118.364 5.636z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
            </svg>
          </div>
          <p className="text-white font-bold text-base mb-1">You're offline</p>
          <p className="text-gray-500 text-sm mb-5 leading-relaxed">
            Go online to start receiving ride requests in your area.
          </p>
          <button
            onClick={toggleOnline}
            className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            Go Online
          </button>
        </div>
      )}

      {/* ── Active ride ── */}
      {activeRide && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`${statusBanner[activeRide.status]?.bg || 'bg-gray-700'} ${statusBanner[activeRide.status]?.text || 'text-white'} rounded-2xl px-5 py-4 flex items-center gap-3`}>
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusBanner[activeRide.status]?.dot || 'bg-white/20'} animate-pulse`} />
            <span className="font-black text-lg">{statusBanner[activeRide.status]?.label || 'Active Ride'}</span>
          </div>

          {/* Customer info */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Passenger</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 shadow-md shadow-yellow-400/20">
                <span className="text-black font-black text-xl">
                  {(activeRide.customerName || 'C')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-tight">{activeRide.customerName || 'Customer'}</p>
                {activeRide.customerPhone && (
                  <a href={`tel:${activeRide.customerPhone}`} className="text-yellow-400 text-sm hover:underline">
                    {activeRide.customerPhone}
                  </a>
                )}
                <p className="text-gray-400 text-sm">Rated {activeRide.customerRating || '5.0'} / 5.0</p>
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Route</p>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
                <span className="w-0.5 flex-1 bg-gray-700 my-1.5" />
                <span className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
              </div>
              <div className="flex-1 space-y-3.5">
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">{activeRide.pickupAddress}</p>
                  <p className="text-gray-600 text-xs mt-0.5">Pickup</p>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight">{activeRide.destinationAddress}</p>
                  <p className="text-gray-600 text-xs mt-0.5">Destination</p>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-xs mt-3 pt-3 border-t border-gray-800">{activeRide.distance} mi · approx {activeRide.duration} mins</p>
          </div>

          {/* Fare breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Fare</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total fare</span>
                <span className="text-white font-semibold">£{parseFloat(activeRide.price || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Platform fee (20%)</span>
                <span className="text-gray-500">-£{(parseFloat(activeRide.price || 0) * 0.2).toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-800 pt-2.5 flex justify-between items-baseline">
                <span className="text-white font-bold text-sm">Your earnings (80%)</span>
                <span className="text-yellow-400 font-black text-2xl">
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
                className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 active:bg-blue-700 transition text-lg shadow-md shadow-blue-600/20"
              >
                Arrived at Pickup
              </button>
            )}
            {activeRide.status === 'arrived' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-black/40">
                <div>
                  <p className="text-white font-bold text-center text-base">Enter Customer's Ride Code</p>
                  <p className="text-gray-500 text-xs text-center mt-1">Ask the customer to show their 4-digit code</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={otpInput}
                    onChange={e => { setOtpInput(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                    placeholder="- - - -"
                    className="flex-1 bg-black border border-gray-800 rounded-xl px-4 py-3 text-center text-2xl font-black tracking-widest focus:border-yellow-400 outline-none text-yellow-400 placeholder-gray-700 transition"
                  />
                  <button
                    onClick={() => verifyOtp(activeRide)}
                    disabled={otpInput.length !== 4}
                    className="px-6 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 active:bg-green-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Start
                  </button>
                </div>
                {otpError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                    <p className="text-red-400 text-sm text-center">{otpError}</p>
                  </div>
                )}
              </div>
            )}
            {activeRide.status === 'in_progress' && (
              <button
                onClick={() => completeRide(activeRide)}
                className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 active:bg-yellow-500 transition text-lg shadow-md shadow-yellow-400/20"
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
          {/* Live indicator — confirms GPS is active and driver is visible */}
          <div className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3 mb-5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <p className="text-green-400 text-sm font-semibold">You're live — customers can see you nearby</p>
          </div>
          <SectionHeader title="Available Rides" subtitle="New requests appear automatically" />

          {availableLoading ? (
            <div className="space-y-3">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : availableRides.length === 0 ? (
            <div className="space-y-3">
              <EmptyState
                icon={
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2m-4 12h4a2 2 0 002-2v-6a2 2 0 00-2-2h-4m-4 0V8m0 8v-4m0 0H9m4 0h-4" />
                  </svg>
                }
                title="Quiet right now"
                body="No ride requests in your area. New requests will appear here automatically."
                hint="Peak demand: 7–9 am  ·  12–2 pm  ·  5–8 pm  ·  Fri & Sat nights"
              />
              {/* Driver tips panel */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Tips to get more rides</p>
                {[
                  'Move to busy areas — city centre, airports, or train stations',
                  'Keep your rating high: be punctual and keep the car clean',
                  'Accept requests quickly — faster responses improve your rank',
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1.5" />
                    <p className="text-gray-400 text-sm leading-snug">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRides.map(ride => (
                <div key={ride.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
                  {/* Customer header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-yellow-400/20">
                        <span className="text-black font-black text-sm">
                          {(ride.customerName || 'C')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-bold leading-tight">{ride.customerName || 'Customer'}</p>
                        <p className="text-gray-600 text-xs">{formatTime(ride.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold text-base">£{parseFloat(ride.price || 0).toFixed(2)}</p>
                      <p className="text-gray-600 text-[10px] uppercase tracking-widest">total fare</p>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="flex gap-2.5 mb-4">
                    <div className="flex flex-col items-center pt-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
                      <span className="w-0.5 flex-1 bg-gray-700 my-1" />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                    </div>
                    <div className="flex-1 space-y-2.5">
                      <p className="text-gray-200 text-sm leading-tight truncate">{ride.pickupAddress}</p>
                      <p className="text-gray-200 text-sm leading-tight truncate">{ride.destinationAddress}</p>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
                    <p className="text-gray-500 text-xs">{ride.distance} mi · {ride.duration} mins</p>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest">Your earnings</p>
                      <p className="text-yellow-400 font-black text-base">
                        £{(parseFloat(ride.price || 0) * 0.8).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Accept button */}
                  <button
                    onClick={() => handleAcceptRide(ride.id)}
                    disabled={!!acceptingId}
                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-yellow-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
  const [chartData,    setChartData]    = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [recentTxns,   setRecentTxns]  = useState([]);

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

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today"       value={`£${parseFloat(driver?.todayEarnings || 0).toFixed(2)}`} accent large />
        <StatCard label="This Week"   value={`£${parseFloat(driver?.weekEarnings  || 0).toFixed(2)}`} large />
        <StatCard label="All Time"    value={`£${parseFloat(driver?.earnings      || 0).toFixed(2)}`} large />
        <StatCard label="Total Rides" value={driver?.totalRides || 0} large />
      </div>

      {/* Weekly bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Last 7 Days" />
        {chartLoading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={24}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="earnings" fill="#facc15" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent transactions */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Recent Transactions" />
        {recentTxns.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {recentTxns.map((r, i) => (
              <div key={r.id || i} className="py-3.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 text-xs">{formatDateTime(r.completedAt)}</p>
                  <p className="text-white text-sm truncate mt-0.5">
                    {trunc(r.pickupAddress, 20)} → {trunc(r.destinationAddress, 20)}
                  </p>
                </div>
                <p className="text-yellow-400 font-black flex-shrink-0">£{parseFloat(r.driverEarnings || 0).toFixed(2)}</p>
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
  const [rides,       setRides]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastDoc,     setLastDoc]     = useState(null);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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
    <EmptyState
      icon={
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      }
      title="No completed rides yet"
      body="Accept your first ride to start building your trip history."
    />
  );

  return (
    <div className="space-y-3">
      {rides.map(r => (
        <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-gray-500 text-xs">{formatDateTime(r.completedAt)}</p>
              <p className="text-gray-400 text-xs mt-0.5">Passenger: {r.customerName || 'Unknown'}</p>
            </div>
            <span className="bg-green-500/15 border border-green-500/25 text-green-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest flex-shrink-0">
              Completed
            </span>
          </div>

          <div className="flex gap-2.5 mb-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="w-0.5 flex-1 bg-gray-800 my-1" />
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-white text-sm leading-tight truncate">{r.pickupAddress}</p>
              <p className="text-white text-sm leading-tight truncate">{r.destinationAddress}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-800">
            <span className="text-gray-600 text-xs">{r.distance} mi · {r.duration} mins</span>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Earnings</p>
              <p className="text-yellow-400 font-black">£{parseFloat(r.driverEarnings || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-3 bg-gray-900 border border-gray-800 text-gray-400 font-semibold rounded-xl hover:bg-gray-800 active:bg-gray-700 transition disabled:opacity-60"
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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center shadow-sm shadow-black/40">
        <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md shadow-yellow-400/20">
          <span className="text-black font-black text-3xl">
            {(driver?.name || 'D')[0].toUpperCase()}
          </span>
        </div>
        <p className="text-white font-black text-xl leading-tight">{driver?.name || 'Driver'}</p>
        <p className="text-gray-500 text-sm mt-0.5">{driver?.email || ''}</p>
        <div className="flex items-center justify-center gap-1 mt-2">
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          <span className="text-yellow-400 font-bold">{parseFloat(driver?.rating || 5).toFixed(1)}</span>
          <span className="text-gray-600 text-sm">/ 5.0</span>
        </div>
        {driver?.createdAt && (
          <p className="text-gray-600 text-xs mt-2">
            Member since {driver.createdAt.toDate
              ? driver.createdAt.toDate().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
              : ''}
          </p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Rides"    value={driver?.totalRides || 0} />
        <StatCard label="All Time"       value={`£${parseFloat(driver?.earnings || 0).toFixed(0)}`} accent />
        <StatCard label="Rating"         value={`${parseFloat(driver?.rating || 5).toFixed(1)}`} />
      </div>

      {/* Editable info */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-sm shadow-black/40">
        <SectionHeader title="Personal Information" />
        {[
          { label: 'Full Name', key: 'name',  type: 'text' },
          { label: 'Phone',     key: 'phone', type: 'tel'  },
          { label: 'City',      key: 'city',  type: 'text' },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <label className="text-gray-500 text-xs font-medium block mb-1.5">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
            />
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Saving…
            </>
          ) : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Vehicle info (read-only) */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-1 shadow-sm shadow-black/40">
        <SectionHeader title="Vehicle Information" />
        {[
          { label: 'Vehicle Type',         value: driver?.vehicleType },
          { label: 'Make & Model',         value: driver?.vehicleMake },
          { label: 'Registration',         value: driver?.vehicleReg },
          { label: 'Year',                 value: driver?.vehicleYear },
          { label: 'Driving Licence No.',  value: driver?.licenceNumber },
          { label: 'Country',              value: driver?.country },
        ].map(({ label, value }) => value ? (
          <div key={label} className="flex justify-between items-center py-2.5 border-b border-gray-800 last:border-0">
            <span className="text-gray-500 text-sm">{label}</span>
            <span className="text-white text-sm font-semibold">{value}</span>
          </div>
        ) : null)}
        <p className="text-gray-700 text-xs pt-3">
          Vehicle details cannot be changed after approval. Contact support to update.
        </p>
      </div>

      {/* Account */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Account" />
        <button
          onClick={handleLogout}
          className="w-full py-3 border border-red-500/40 text-red-400 font-bold rounded-xl hover:bg-red-500/10 active:bg-red-500/20 transition"
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
  const [availableRides,   setAvailableRides]   = useState([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [activeRide,       setActiveRide]       = useState(null);
  const [acceptingId,      setAcceptingId]      = useState(null);

  // ── OTP verification ──
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');

  // ── Receipt modal ──
  const [showReceipt,   setShowReceipt]   = useState(false);
  const [completedRide, setCompletedRide] = useState(null);

  // ── Toast notifications ──
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Auth + driver data ──
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

        const parse = v => {
          if (!v) return undefined;
          if ('stringValue'   in v) return v.stringValue;
          if ('doubleValue'   in v) return v.doubleValue;
          if ('integerValue'  in v) return Number(v.integerValue);
          if ('booleanValue'  in v) return v.booleanValue;
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
  // Declared here so both the GPS and active-ride useEffects can share it.
  const driverUid = driver?.uid;
  useEffect(() => {
    if (!isOnline || !driverUid) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        updateDoc(doc(db, 'drivers', driverUid), {
          currentLat: pos.coords.latitude,
          currentLng: pos.coords.longitude,
          lastSeen:   serverTimestamp(),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, driverUid]);

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
    let initialized = false;
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

      if (initialized && rides.length > prevRidesRef.current.length) playNotificationSound();
      initialized = true;
      prevRidesRef.current = rides;
      setAvailableRides(rides);
      setAvailableLoading(false);
    }, () => setAvailableLoading(false));
    return () => unsub();
  }, [driver, isOnline]);

  // ── Active ride listener ──
  useEffect(() => {
    if (!driverUid) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driverUid),
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
  }, [driverUid]);

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

  // ── OTP verification before starting ride ──
  const verifyOtp = async (ride) => {
    if (otpInput !== ride.otp) {
      setOtpError('Wrong code. Ask the customer to check their app.');
      return;
    }
    setOtpError('');
    setOtpInput('');
    await updateRideStatus(ride.id, 'in_progress');
  };

  // ── Complete ride (single transaction) ──
  const completeRide = async ride => {
    try {
      const driverEarnings = parseFloat(ride.price || 0) * 0.8;
      const platformFee    = parseFloat(ride.price || 0) * 0.2;

      const rideRef   = doc(db, 'rides',   ride.id);
      const driverRef = doc(db, 'drivers', driver.uid);

      await runTransaction(db, async transaction => {
        transaction.update(rideRef, {
          status:         'completed',
          completedAt:    serverTimestamp(),
          driverEarnings: driverEarnings,
          platformFee:    platformFee,
        });
        transaction.update(driverRef, {
          earnings:      increment(driverEarnings),
          todayEarnings: increment(driverEarnings),
          weekEarnings:  increment(driverEarnings),
          totalRides:    increment(1),
        });
      });

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

  // ── Loading state ──
  if (!driver) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-black font-black text-2xl">R</span>
          </div>
          <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Tab definitions ──
  const tabs = [
    { id: 'rides',    label: 'Rides'    },
    { id: 'earnings', label: 'Earnings' },
    { id: 'history',  label: 'History'  },
    { id: 'profile',  label: 'Profile'  },
  ];

  return (
    <div className="min-h-screen bg-black">

      {/* ── Fixed top navbar ── */}
      <nav
        aria-label="Driver dashboard navigation"
        className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/60 h-16 flex items-center px-4 gap-3"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md shadow-yellow-400/20">
            <span className="text-black font-black text-sm" aria-hidden="true">R</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight">RideX</span>
        </div>

        {/* Driver name — centred */}
        <div className="flex-1 text-center min-w-0 px-2">
          <p className="text-white font-bold text-sm leading-tight truncate">{driver.name}</p>
          <p className="text-gray-600 text-[10px] uppercase tracking-widest">Driver</p>
        </div>

        {/* Online / offline toggle */}
        <button
          onClick={toggleOnline}
          disabled={togglingOnline}
          aria-pressed={isOnline}
          aria-label={isOnline ? 'Go offline' : 'Go online'}
          className="flex-shrink-0 disabled:opacity-60 transition-opacity rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <StatusBadge online={isOnline} />
        </button>
      </nav>

      {/* ── Scrollable content area ── */}
      <main className="pt-16 pb-24 px-4 min-h-screen">
        <div className="max-w-lg mx-auto py-5">

          {/* Each section is always mounted but hidden when inactive — preserves
              scroll position and prevents re-fetching Firestore listeners on tab switch */}
          <section id="rides-panel" role="tabpanel" aria-labelledby="rides-tab" hidden={activeTab !== 'rides'}>
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
              otpInput={otpInput}
              setOtpInput={setOtpInput}
              otpError={otpError}
              setOtpError={setOtpError}
              verifyOtp={verifyOtp}
            />
          </section>

          <section id="earnings-panel" role="tabpanel" aria-labelledby="earnings-tab" hidden={activeTab !== 'earnings'}>
            <EarningsTab driver={driver} />
          </section>

          <section id="history-panel" role="tabpanel" aria-labelledby="history-tab" hidden={activeTab !== 'history'}>
            <HistoryTab driver={driver} />
          </section>

          <section id="profile-panel" role="tabpanel" aria-labelledby="profile-tab" hidden={activeTab !== 'profile'}>
            <ProfileTab driver={driver} setDriver={setDriver} showToast={showToast} />
          </section>
        </div>
      </main>

      {/* ── Fixed bottom tab bar ── */}
      <nav aria-label="Tab navigation" className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-gray-800/60 z-50 pb-safe">
        <div role="tablist" aria-label="Dashboard sections" className="flex">
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={active}
                aria-controls={`${tab.id}-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-400
                  ${active ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'}`}
              >
                {/* Active pill background */}
                {active && (
                  <span className="absolute inset-x-3 inset-y-1.5 rounded-xl bg-yellow-400/10 pointer-events-none" aria-hidden="true" />
                )}
                <span className="relative z-10" aria-hidden="true">
                  <TabIcon id={tab.id} active={active} />
                </span>
                <span className={`relative z-10 text-[10px] font-bold leading-none ${active ? 'text-yellow-400' : 'text-gray-600'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
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
