// DriverDashboard.jsx
// Full-featured driver dashboard for RideX — mirrors Uber Driver app structure.
// Tabs: Rides | Earnings | History | Profile
// Fixed top navbar + fixed bottom tab bar + scrollable content between them.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db } from '../../firebase';
import {
  doc, updateDoc, collection, query, where, orderBy,
  limit, onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { playNotificationSound, primeAudio, getFunctionsBaseUrl } from './utils/format';
import { fetchJson, isAbortError, isOffline } from '../../utils/net';
import { normalizeRide } from '../../utils/ride';
import { readJson, writeJson, removeKey } from '../../utils/storage';
import ToastContainer from './components/Toast';
import StatusBadge from './components/StatusBadge';
import TabIcon from './components/TabIcon';
import ReceiptModal from './components/ReceiptModal';
import RidesTab from './tabs/RidesTab';
import EarningsTab from './tabs/EarningsTab';
import HistoryTab from './tabs/HistoryTab';
import ProfileTab from './tabs/ProfileTab';

// How often the driver's GPS fix is copied onto the active ride document so the
// customer can watch them approach (rules only allow these three fields).
const GPS_MIRROR_INTERVAL_MS = 5000;
// Consecutive failed GPS writes before the driver is warned they are invisible
const GPS_FAILURE_TOAST_AFTER = 3;
const REST_TIMEOUT_MS = 10000;
const TOAST_MS = 3500;

// ── Firestore REST value → JS ────────────────────────────────────────────────
// The driver doc is read via REST (not the SDK) because the SDK reports "client
// is offline" right after auth-state changes. Timestamps are wrapped so both
// `.toDate()` and the shared toMillis() helper understand them.
function parseRestValue(v) {
  if (!v) return undefined;
  if ('stringValue'    in v) return v.stringValue;
  if ('doubleValue'    in v) return v.doubleValue;
  if ('integerValue'   in v) return Number(v.integerValue);
  if ('booleanValue'   in v) return v.booleanValue;
  if ('nullValue'      in v) return null;
  if ('timestampValue' in v) {
    const d = new Date(v.timestampValue);
    return { toDate: () => d, toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
  }
  if ('mapValue'   in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, parseRestValue(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseRestValue);
  return undefined;
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DriverDashboard() {
  const navigate = useNavigate();

  // ── Core state ──
  const [driver,          setDriver]          = useState(null);
  const [loadError,       setLoadError]       = useState(null); // profile fetch failed (network / 5xx)
  const [reloadKey,       setReloadKey]       = useState(0);
  const [isOnline,        setIsOnline]        = useState(false);
  const [activeTab,       setActiveTab]       = useState('rides');
  const [togglingOnline,  setTogglingOnline]  = useState(false);

  // ── Ride state ──
  const [availableRides,   setAvailableRides]   = useState([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [incomingRide,     setIncomingRide]     = useState(null); // a genuinely new request → popup
  const [activeRide,       setActiveRide]       = useState(null);
  const [acceptingId,      setAcceptingId]      = useState(null);
  const [completing,       setCompleting]       = useState(false);
  const acceptingRef  = useRef(false);   // refs, not state: two taps in one frame both see stale state
  const completingRef = useRef(false);

  // ── OTP verification ──
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');

  // ── Receipt modal ──
  const [showReceipt,   setShowReceipt]   = useState(false);
  const [completedRide, setCompletedRide] = useState(null);

  // ── Toast notifications (timers tracked so unmount clears them) ──
  const [toasts, setToasts] = useState([]);
  const toastIdRef     = useRef(0);
  const toastTimersRef = useRef(new Set());

  // ── Online duration timer ──
  const [onlineMinutes, setOnlineMinutes] = useState(0);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_MS);
    toastTimersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  // ── Auth + driver data ──
  useEffect(() => {
    let cancelled = false;
    const unsubAuth = onAuthStateChanged(auth, async user => {
      if (!user) { navigate('/driver/login'); return; }
      setLoadError(null);
      try {
        const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
        if (!projectId) throw new Error('CONFIG');

        const idToken = await user.getIdToken();
        const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;
        const { res, data: json } = await fetchJson(
          restUrl,
          { headers: { Authorization: `Bearer ${idToken}` } },
          { timeoutMs: REST_TIMEOUT_MS },
        );
        if (cancelled) return;

        // 404 = no driver profile (customer account); 401/403 = unusable session
        if (res.status === 404 || res.status === 401 || res.status === 403) { navigate('/driver/login'); return; }
        if (!res.ok) throw new Error(`Firestore REST ${res.status}`);

        const fields = json.fields || {};
        const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parseRestValue(v)]));

        // Re-check approval status on every load — a driver's session can outlive
        // an admin rejecting them after their last login, so this can't only be
        // checked at sign-in time (see DriverLogin.jsx LoginForm).
        if (data.status && data.status !== 'approved') {
          await signOut(auth);
          navigate('/driver/login');
          return;
        }

        setDriver({ uid: user.uid, ...data });
        setIsOnline(data.isOnline || false);
      } catch (err) {
        if (cancelled) return;
        // A transient network problem must NOT log the driver out mid-shift —
        // show a retry screen instead of bouncing to the login page.
        setLoadError(
          err?.message === 'CONFIG'
            ? 'App configuration error — please contact support.'
            : (isAbortError(err) || isOffline())
              ? 'Could not reach the server. Check your connection and retry.'
              : 'Could not load your profile. Please retry.'
        );
      }
    });
    return () => { cancelled = true; unsubAuth(); };
  }, [navigate, reloadKey]);

  // ── GPS location tracking when online ──
  // The watchPosition callback closes over the render it was created in, so the
  // active ride id lives in a ref that is kept current separately.
  const driverUid       = driver?.uid;
  const activeRideIdRef = useRef(null);
  const lastMirrorRef   = useRef(0);
  useEffect(() => {
    activeRideIdRef.current = activeRide?.id ?? null;
    lastMirrorRef.current   = 0; // mirror immediately after accepting
  }, [activeRide?.id]);

  useEffect(() => {
    if (!isOnline || !driverUid) return undefined;
    if (!('geolocation' in navigator)) {
      showToast('Location is not available on this device.', 'error');
      return undefined;
    }
    let failures = 0;
    let warnedTimeout = false;

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        updateDoc(doc(db, 'drivers', driverUid), {
          currentLat: lat,
          currentLng: lng,
          lastSeen:   serverTimestamp(),
        })
          .then(() => { failures = 0; })
          .catch(() => {
            failures += 1;
            if (failures === GPS_FAILURE_TOAST_AFTER) {
              showToast('Your location is not syncing — customers cannot see you. Check your connection.', 'warning');
            }
          });

        // Mirror onto the active ride (throttled) so the customer sees you approach.
        const rideId = activeRideIdRef.current;
        if (rideId && Date.now() - lastMirrorRef.current >= GPS_MIRROR_INTERVAL_MS) {
          lastMirrorRef.current = Date.now();
          updateDoc(doc(db, 'rides', rideId), {
            driverLat:        lat,
            driverLng:        lng,
            driverLocationAt: serverTimestamp(),
          }).catch(() => { /* ride just completed, or rules not yet deployed */ });
        }
      },
      err => {
        if (err?.code === 1) {
          // PERMISSION_DENIED — being "online" without a location is meaningless
          showToast('Location permission denied — you have been taken offline. Allow location access to receive rides.', 'error');
          updateDoc(doc(db, 'drivers', driverUid), { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
          setIsOnline(false);
        } else if (err?.code === 3) {
          if (!warnedTimeout) {
            warnedTimeout = true;
            showToast('Waiting for a GPS fix… move to an open area if this persists.', 'warning');
          }
        } else {
          showToast('Location is temporarily unavailable.', 'warning');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, driverUid, showToast]);

  // ── Track minutes online this shift (persisted so a refresh keeps the clock) ──
  useEffect(() => {
    if (!driverUid) return undefined;
    const key = `ridex_online_start_${driverUid}`;
    if (!isOnline) {
      removeKey(key);
      setOnlineMinutes(0);
      return undefined;
    }
    let start = Number(readJson(key, 0));
    if (!start || start > Date.now()) {
      start = Date.now();
      writeJson(key, start);
    }
    const tick = () => setOnlineMinutes(Math.max(0, Math.floor((Date.now() - start) / 60000)));
    tick();
    const intervalId = setInterval(tick, 30000);
    // Background tabs throttle timers — catch up when the driver returns
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOnline, driverUid]);

  // ── Available rides listener ──
  // Keyed on the uid (not the driver object) so saving the profile or completing
  // a ride does not tear the listener down. New rides are detected by id, not by
  // list length, so reconnects and re-orders never trigger a false alert.
  const seenRideIdsRef = useRef(new Set());
  useEffect(() => {
    if (!driverUid || !isOnline) {
      setAvailableRides([]);
      setAvailableLoading(false);
      setIncomingRide(null);
      seenRideIdsRef.current = new Set();
      return undefined;
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
        .map(d => normalizeRide(d.id, d.data()))
        .filter(r => !r.driverId); // legacy rides store '' instead of null

      const seen  = seenRideIdsRef.current;
      const fresh = rides.filter(r => !seen.has(r.id));
      rides.forEach(r => seen.add(r.id));

      if (initialized && fresh.length > 0) {
        playNotificationSound();
        setIncomingRide(fresh[0]);
      }
      initialized = true;
      setAvailableRides(rides);
      setAvailableLoading(false);
    }, () => {
      setAvailableLoading(false);
      showToast('Could not load ride requests — check your connection.', 'error');
    });
    return () => unsub();
  }, [driverUid, isOnline, showToast]);

  // ── Active ride listener ──
  useEffect(() => {
    if (!driverUid) return undefined;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driverUid),
      where('status', 'in', ['driver_assigned', 'arrived', 'in_progress']),
    );
    const unsub = onSnapshot(q, snap => {
      if (snap.empty) { setActiveRide(null); return; }
      const d = snap.docs[0];
      setActiveRide(normalizeRide(d.id, d.data()));
    }, () => {
      showToast('Lost connection to your active ride — check your connection.', 'error');
    });
    return () => unsub();
  }, [driverUid, showToast]);

  // ── Toggle online status ──
  const toggleOnline = async () => {
    if (!driver || togglingOnline) return;
    const newStatus = !isOnline;
    if (newStatus) {
      if (!('geolocation' in navigator) || !window.isSecureContext) {
        showToast('Location access is required to go online.', 'error');
        return;
      }
      primeAudio(); // user gesture → later ride chimes are allowed by autoplay policy
    }
    setTogglingOnline(true);
    try {
      await updateDoc(doc(db, 'drivers', driver.uid), {
        isOnline: newStatus,
        lastSeen: serverTimestamp(),
      });
      setIsOnline(newStatus);
      showToast(newStatus ? 'You are now online!' : 'You are now offline.', 'warning');
    } catch (_) {
      showToast('Failed to update status. Check your connection.', 'error');
    } finally {
      setTogglingOnline(false);
    }
  };

  // ── Accept ride (Firestore transaction) ── returns true on success
  const handleAcceptRide = async rideId => {
    if (!driver || acceptingRef.current) return false;
    acceptingRef.current = true;
    setAcceptingId(rideId);
    try {
      await runTransaction(db, async transaction => {
        const rideRef  = doc(db, 'rides', rideId);
        const rideSnap = await transaction.get(rideRef);
        if (!rideSnap.exists()) throw new Error('GONE');
        const current = rideSnap.data();
        if (current.driverId) throw new Error('TAKEN');
        if (current.status !== 'confirmed') throw new Error('GONE'); // cancelled between listing and tap
        transaction.update(rideRef, {
          driverId:     driver.uid,
          driverName:   driver.name || 'Your driver',
          driverCar:    [driver.vehicleType, driver.vehicleReg].filter(Boolean).join(' • '),
          driverRating: Number.isFinite(Number(driver.rating)) ? Number(driver.rating) : 5,
          driverPhone:  driver.phone || null,
          status:       'driver_assigned',
          assignedAt:   serverTimestamp(),
        });
      });
      showToast('Ride accepted! Head to the pickup location.', 'success');
      setActiveTab('rides');
      return true;
    } catch (err) {
      if (err?.message === 'TAKEN')      showToast('Sorry, this ride was taken by another driver.', 'error');
      else if (err?.message === 'GONE')  showToast('This ride is no longer available.', 'warning');
      else                               showToast('Failed to accept ride. Please try again.', 'error');
      return false;
    } finally {
      acceptingRef.current = false;
      setAcceptingId(null);
    }
  };

  // ── Update ride status ── `expectedPrev` guards double taps / stale UI
  const updateRideStatus = async (rideId, status, expectedPrev) => {
    if (expectedPrev && activeRide?.status !== expectedPrev) return false;
    try {
      await updateDoc(doc(db, 'rides', rideId), { status, updatedAt: serverTimestamp() });
      if (status === 'arrived')     showToast('Marked as arrived at pickup.', 'success');
      if (status === 'in_progress') showToast('Ride started! Drive safely.', 'success');
      return true;
    } catch (_) {
      showToast('Failed to update ride status.', 'error');
      return false;
    }
  };

  // ── OTP verification before starting ride ──
  // Rides created before the OTP feature have no code — those start directly.
  const verifyOtp = async ride => {
    const expected = String(ride?.otp ?? '').trim();
    const entered  = String(otpInput ?? '').trim();
    if (expected && entered !== expected) {
      setOtpError('Wrong code. Ask the customer to check their app.');
      return;
    }
    setOtpError('');
    const ok = await updateRideStatus(ride.id, 'in_progress', 'arrived');
    if (ok) setOtpInput(''); // keep what they typed if the write failed
  };

  // ── Complete ride ──
  // Earnings are computed server-side from the ride's stored price (never
  // trusted from the client) and the 80% driver share is transferred via
  // Stripe Connect once payouts are enabled — see functions/index.js completeRide.
  const completeRide = async ride => {
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    try {
      if (!auth.currentUser) { navigate('/driver/login'); return; }
      const baseUrl = getFunctionsBaseUrl();
      if (!baseUrl) { showToast('App configuration error — please contact support.', 'error'); return; }

      const idToken = await auth.currentUser.getIdToken();
      const { res, data } = await fetchJson(`${baseUrl}/completeRide`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ rideId: ride.id }),
      }, { timeoutMs: 20000 });

      // 409 = already completed (e.g. a retry after a dropped response) — the
      // active-ride listener clears the card by itself.
      if (res.status === 409) { showToast('This ride has already been completed.', 'warning'); return; }
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to complete ride. Please try again.', 'error');
        return;
      }

      const earned = Number(data.driverEarnings) || 0;
      setDriver(prev => ({
        ...prev,
        earnings:      (Number(prev?.earnings)      || 0) + earned,
        todayEarnings: (Number(prev?.todayEarnings) || 0) + earned,
        weekEarnings:  (Number(prev?.weekEarnings)  || 0) + earned,
        totalRides:    (Number(prev?.totalRides)    || 0) + 1,
      }));

      if (!data.transferred) {
        showToast('Ride completed! Set up payouts in your profile to receive earnings.', 'warning');
      }

      setCompletedRide({ ...ride, driverEarnings: earned, platformFee: Number(data.platformFee) || 0 });
      setShowReceipt(true);
    } catch (err) {
      showToast(
        isAbortError(err)
          ? 'The server took too long to respond. Check the ride status before retrying.'
          : 'Failed to complete ride. Please try again.',
        'error',
      );
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  };

  // ── Loading / error state ──
  if (!driver) {
    return (
      <div className="min-h-screen min-h-dvh bg-black flex items-center justify-center px-5">
        {loadError ? (
          <div role="alert" className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <p className="text-white font-bold mb-2">Couldn't load your dashboard</p>
            <p className="text-gray-400 text-sm mb-5">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={async () => { try { await signOut(auth); } catch (_) {} navigate('/driver/login'); }}
              className="w-full py-3 mt-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4" role="status" aria-label="Loading dashboard">
            <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-black font-black text-2xl">R</span>
            </div>
            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
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
    <div className="min-h-screen min-h-dvh bg-black">

      {/* ── Fixed top navbar (padded under the notch / status bar) ── */}
      <nav
        aria-label="Driver dashboard navigation"
        className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-gray-800/60 pt-safe"
      >
        <div className="h-16 flex items-center px-4 gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md shadow-yellow-400/20">
              <span className="text-black font-black text-sm" aria-hidden="true">R</span>
            </div>
            <span className="text-white font-black text-lg tracking-tight">RideX</span>
          </div>

          {/* Driver name — centred */}
          <div className="flex-1 text-center min-w-0 px-2">
            <p className="text-white font-bold text-sm leading-tight truncate">{driver.name || 'Driver'}</p>
            <p className="hidden sm:block text-gray-600 text-[10px] uppercase tracking-widest">Driver</p>
          </div>

          {/* Online / offline toggle — the most-used control, so a full 44px target */}
          <button
            type="button"
            onClick={toggleOnline}
            disabled={togglingOnline}
            aria-pressed={isOnline}
            aria-label={isOnline ? 'Go offline' : 'Go online'}
            className="flex-shrink-0 min-h-[44px] min-w-[44px] px-1 flex items-center justify-center disabled:opacity-60 transition-opacity rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <StatusBadge online={isOnline} />
          </button>
        </div>
      </nav>

      {/* ── Scrollable content area — clears the navbar (+notch) and tab bar (+home indicator) ── */}
      <main className="pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] px-4">
        <div className="max-w-lg md:max-w-2xl mx-auto py-5">

          {/* Each section is always mounted but hidden when inactive — preserves
              scroll position and prevents re-fetching Firestore listeners on tab switch */}
          <section id="rides-panel" role="tabpanel" aria-labelledby="rides-tab" hidden={activeTab !== 'rides'}>
            <RidesTab
              driver={driver}
              isOnline={isOnline}
              toggleOnline={toggleOnline}
              availableRides={availableRides}
              availableLoading={availableLoading}
              incomingRide={incomingRide}
              activeRide={activeRide}
              handleAcceptRide={handleAcceptRide}
              updateRideStatus={updateRideStatus}
              completeRide={completeRide}
              acceptingId={acceptingId}
              completing={completing}
              otpInput={otpInput}
              setOtpInput={setOtpInput}
              otpError={otpError}
              setOtpError={setOtpError}
              verifyOtp={verifyOtp}
              onlineMinutes={onlineMinutes}
              active={activeTab === 'rides'}
            />
          </section>

          <section id="earnings-panel" role="tabpanel" aria-labelledby="earnings-tab" hidden={activeTab !== 'earnings'}>
            <EarningsTab driver={driver} active={activeTab === 'earnings'} />
          </section>

          <section id="history-panel" role="tabpanel" aria-labelledby="history-tab" hidden={activeTab !== 'history'}>
            <HistoryTab driver={driver} showToast={showToast} active={activeTab === 'history'} />
          </section>

          <section id="profile-panel" role="tabpanel" aria-labelledby="profile-tab" hidden={activeTab !== 'profile'}>
            <ProfileTab driver={driver} setDriver={setDriver} showToast={showToast} active={activeTab === 'profile'} />
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
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${tab.id}-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] gap-1 transition-colors
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
