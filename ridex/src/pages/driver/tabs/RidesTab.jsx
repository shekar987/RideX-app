import { useState, useEffect, useRef } from 'react';

import { DRIVER_SHARE, PLATFORM_SHARE } from '../../../constants/fees';
import { trunc, formatTime } from '../utils/format';
import { formatMoney, initialOf, telHref } from '../../../utils/ride';
import { SkeletonCard } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import SectionHeader from '../components/SectionHeader';
import EmptyState from '../components/EmptyState';
import ActiveRideMap from '../components/ActiveRideMap';

const POPUP_SECONDS = 15;

// "Just started" / "42m" / "2h 5m" — guards NaN and clock skew
function fmtOnlineTime(mins) {
  const m = Number(mins);
  if (!Number.isFinite(m) || m < 1) return 'Just started';
  if (m < 60) return `${Math.floor(m)}m`;
  const h = Math.floor(m / 60), r = Math.floor(m % 60);
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ─────────────────────────────────────────────
// TAB 1 — RIDES
// ─────────────────────────────────────────────
export default function RidesTab({
  driver, isOnline, toggleOnline,
  availableRides, availableLoading, incomingRide,
  activeRide,
  handleAcceptRide, updateRideStatus, completeRide,
  acceptingId, completing = false,
  otpInput, setOtpInput, otpError, setOtpError, verifyOtp,
  onlineMinutes,
  active = true,
}) {
  const [countdown,     setCountdown]     = useState(POPUP_SECONDS);
  const [popupRide,     setPopupRide]     = useState(null);
  const [popupAccepting, setPopupAccepting] = useState(false);
  const countdownRef = useRef(null);

  // The dashboard hands us a ride only when it is genuinely new (not on
  // reconnect / re-order), so every popup is a real request.
  useEffect(() => {
    if (!incomingRide) return;
    setPopupRide(incomingRide);
    setCountdown(POPUP_SECONDS);
  }, [incomingRide]);

  // Countdown — stops when the popup closes, the driver goes offline, or the
  // ride disappears from the marketplace (someone else accepted it).
  useEffect(() => {
    if (!popupRide || !isOnline) { setPopupRide(null); return undefined; }
    if (!availableRides.some(r => r.id === popupRide.id)) { setPopupRide(null); return undefined; }
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownRef.current); setPopupRide(null); return POPUP_SECONDS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [popupRide, isOnline, availableRides]);

  const dismissPopup = () => { clearInterval(countdownRef.current); setPopupRide(null); };

  // Accept from the popup — stays open with a spinner until the transaction
  // resolves, so a failure is visible and the driver can decide what to do.
  const acceptFromPopup = async () => {
    if (!popupRide || popupAccepting) return;
    setPopupAccepting(true);
    try {
      const ok = await handleAcceptRide(popupRide.id);
      if (ok) dismissPopup();
    } finally {
      setPopupAccepting(false);
    }
  };

  const statusBanner = {
    driver_assigned: { bg: 'bg-yellow-400',  text: 'text-black', label: 'Head to Pickup',        dot: 'bg-black/20' },
    arrived:         { bg: 'bg-blue-600',     text: 'text-white', label: 'Waiting for Customer',  dot: 'bg-white/20' },
    in_progress:     { bg: 'bg-green-500',    text: 'text-white', label: 'Ride in Progress',      dot: 'bg-white/20' },
  };

  const hasOtp = !!String(activeRide?.otp ?? '').trim();

  return (
    <div className="space-y-5">

      {/* ── KPI cards — 2x2 grid ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Earnings" value={formatMoney(driver?.todayEarnings ?? 0)} accent />
        <StatCard label="Total Rides" value={Number(driver?.totalRides) || 0} sub="all time" />
        <StatCard label="Rating" value={`${(Number(driver?.rating) || 5).toFixed(1)}`} sub="out of 5.0" />
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" aria-hidden="true" />
            <span className="text-green-400 text-xs font-semibold truncate">Online {fmtOnlineTime(onlineMinutes)}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-gray-600 text-xs">Next payout</span>
            <span className="text-yellow-400 text-xs font-black tabular-nums">{formatMoney(driver?.weekEarnings ?? 0)}</span>
          </div>
        </div>
      )}

      {/* ── Ride request popup — sits just below the navbar, clear of the notch ── */}
      {popupRide && isOnline && (
        <div className="fixed top-[calc(4rem+env(safe-area-inset-top,0px))] left-0 right-0 z-[150] px-4 animate-slideDown">
          <div role="alertdialog" aria-labelledby="popup-title" className="bg-gray-900 border-2 border-yellow-400 rounded-2xl p-4 shadow-2xl shadow-black/60 max-w-lg mx-auto">
            <div className="flex justify-between items-start gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-yellow-400 font-semibold mb-0.5">New Ride Request</p>
                <h3 id="popup-title" className="text-white font-black text-lg leading-tight truncate">{popupRide.customerName || 'Customer'}</h3>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-yellow-400 font-black text-2xl leading-none tabular-nums">{countdown}</span>
                <p className="text-gray-500 text-[10px]">seconds</p>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
                <span className="text-gray-300 truncate min-w-0 flex-1">{trunc(popupRide.pickupAddress, 60)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" aria-hidden="true" />
                <span className="text-gray-300 truncate min-w-0 flex-1">{trunc(popupRide.destinationAddress, 60)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center gap-3 mb-3">
              <span className="text-gray-500 text-xs truncate min-w-0">{popupRide.distance} mi · {popupRide.duration} mins</span>
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Your earnings</p>
                <p className="text-yellow-400 font-black text-base tabular-nums">
                  {formatMoney(popupRide.price * DRIVER_SHARE)}
                </p>
              </div>
            </div>

            {/* Countdown progress bar */}
            <div className="h-1 bg-gray-800 rounded-full mb-4 overflow-hidden" aria-hidden="true">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / POPUP_SECONDS) * 100}%` }}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={acceptFromPopup}
                disabled={popupAccepting || !!acceptingId}
                className="flex-1 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 active:bg-green-600 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {popupAccepting ? <><Spinner />Accepting…</> : 'Accept'}
              </button>
              <button
                type="button"
                onClick={dismissPopup}
                disabled={popupAccepting}
                className="flex-1 py-3 bg-gray-800 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 active:bg-gray-600 transition disabled:opacity-60"
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
          <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4" aria-hidden="true">
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
            type="button"
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
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusBanner[activeRide.status]?.dot || 'bg-white/20'} animate-pulse`} aria-hidden="true" />
            <span className="font-black text-lg">{statusBanner[activeRide.status]?.label || 'Active Ride'}</span>
          </div>

          {/* Customer info */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Passenger</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 shadow-md shadow-yellow-400/20" aria-hidden="true">
                <span className="text-black font-black text-xl">{initialOf(activeRide.customerName, 'C')}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-lg leading-tight truncate">{activeRide.customerName || 'Customer'}</p>
                {telHref(activeRide.customerPhone) && (
                  <a href={telHref(activeRide.customerPhone)} className="inline-flex items-center min-h-[44px] text-yellow-400 text-sm hover:underline">
                    {activeRide.customerPhone}
                  </a>
                )}
                <p className="text-gray-400 text-sm">Rated {activeRide.customerRating ?? '5.0'} / 5.0</p>
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">Route</p>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1" aria-hidden="true">
                <span className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
                <span className="w-0.5 flex-1 bg-gray-700 my-1.5" />
                <span className="w-3 h-3 rounded-full bg-red-400 flex-shrink-0" />
              </div>
              <div className="flex-1 min-w-0 space-y-3.5">
                <div>
                  <p className="text-white text-sm font-semibold leading-tight break-words">{activeRide.pickupAddress}</p>
                  <p className="text-gray-600 text-xs mt-0.5">Pickup</p>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold leading-tight break-words">{activeRide.destinationAddress}</p>
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
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-400">Total fare</span>
                <span className="text-white font-semibold tabular-nums">{formatMoney(activeRide.price)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-400">Platform fee ({PLATFORM_SHARE * 100}%)</span>
                <span className="text-gray-500 tabular-nums">-{formatMoney(activeRide.price * PLATFORM_SHARE)}</span>
              </div>
              <div className="border-t border-gray-800 pt-2.5 flex justify-between items-baseline gap-3">
                <span className="text-white font-bold text-sm min-w-0">Your earnings ({DRIVER_SHARE * 100}%)</span>
                <span className="text-yellow-400 font-black text-xl sm:text-2xl tabular-nums flex-shrink-0">
                  {formatMoney(activeRide.price * DRIVER_SHARE)}
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
            active={active}
          />

          {/* Action button */}
          <div className="space-y-3">
            {activeRide.status === 'driver_assigned' && (
              <button
                type="button"
                onClick={() => updateRideStatus(activeRide.id, 'arrived', 'driver_assigned')}
                className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 active:bg-blue-700 transition text-lg shadow-md shadow-blue-600/20"
              >
                Arrived at Pickup
              </button>
            )}
            {activeRide.status === 'arrived' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-black/40">
                {hasOtp ? (
                  <>
                    <div>
                      <p className="text-white font-bold text-center text-base">Enter Customer's Ride Code</p>
                      <p className="text-gray-500 text-xs text-center mt-1">Ask the customer to show their 4-digit code</p>
                    </div>
                    <div className="flex gap-2">
                      <label htmlFor="otp-input" className="sr-only">Ride code</label>
                      <input
                        id="otp-input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        value={otpInput}
                        onChange={e => { setOtpInput(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                        placeholder="- - - -"
                        className="flex-1 min-w-0 bg-black border border-gray-800 rounded-xl px-4 py-3 text-center text-2xl font-black tracking-widest focus:border-yellow-400 outline-none text-yellow-400 placeholder-gray-700 transition"
                      />
                      <button
                        type="button"
                        onClick={() => verifyOtp(activeRide)}
                        disabled={otpInput.length !== 4}
                        className="px-6 py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 active:bg-green-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Start
                      </button>
                    </div>
                    {otpError && (
                      <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                        <p className="text-red-400 text-sm text-center">{otpError}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm text-center">This ride has no verification code.</p>
                    <button
                      type="button"
                      onClick={() => verifyOtp(activeRide)}
                      className="w-full py-4 bg-green-500 text-white font-black rounded-2xl hover:bg-green-400 active:bg-green-600 transition text-lg"
                    >
                      Start Ride
                    </button>
                  </>
                )}
              </div>
            )}
            {activeRide.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => completeRide(activeRide)}
                disabled={completing}
                className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 active:bg-yellow-500 transition text-lg shadow-md shadow-yellow-400/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {completing ? <><Spinner />Completing…</> : 'Complete Ride'}
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
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" aria-hidden="true" />
            <p className="text-green-400 text-sm font-semibold">You're live — customers can see you nearby</p>
          </div>
          <SectionHeader title="Available Rides" subtitle="New requests appear automatically" />

          {availableLoading ? (
            <div className="space-y-3" role="status" aria-label="Loading ride requests">
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
                ].map(tip => (
                  <div key={tip} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1.5" aria-hidden="true" />
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
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-yellow-400/20" aria-hidden="true">
                        <span className="text-black font-black text-sm">{initialOf(ride.customerName, 'C')}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold leading-tight truncate">{ride.customerName || 'Customer'}</p>
                        <p className="text-gray-600 text-xs">{formatTime(ride.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white font-bold text-base tabular-nums">{formatMoney(ride.price)}</p>
                      <p className="text-gray-600 text-[10px] uppercase tracking-widest">total fare</p>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="flex gap-2.5 mb-4">
                    <div className="flex flex-col items-center pt-1" aria-hidden="true">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
                      <span className="w-0.5 flex-1 bg-gray-700 my-1" />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <p className="text-gray-200 text-sm leading-tight truncate">{ride.pickupAddress}</p>
                      <p className="text-gray-200 text-sm leading-tight truncate">{ride.destinationAddress}</p>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-800">
                    <p className="text-gray-500 text-xs truncate min-w-0">{ride.distance} mi · {ride.duration} mins</p>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest">Your earnings</p>
                      <p className="text-yellow-400 font-black text-base tabular-nums">{formatMoney(ride.price * DRIVER_SHARE)}</p>
                    </div>
                  </div>

                  {/* Accept button */}
                  <button
                    type="button"
                    onClick={() => handleAcceptRide(ride.id)}
                    disabled={!!acceptingId}
                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-yellow-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    {acceptingId === ride.id ? <><Spinner />Accepting…</> : 'Accept Ride'}
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
