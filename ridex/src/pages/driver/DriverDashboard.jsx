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
import { playNotificationSound, getFunctionsBaseUrl } from './utils/format';
import ToastContainer from './components/Toast';
import StatusBadge from './components/StatusBadge';
import TabIcon from './components/TabIcon';
import ReceiptModal from './components/ReceiptModal';
import RidesTab from './tabs/RidesTab';
import EarningsTab from './tabs/EarningsTab';
import HistoryTab from './tabs/HistoryTab';
import ProfileTab from './tabs/ProfileTab';

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

  // ── Online duration timer ──
  const [onlineMinutes, setOnlineMinutes] = useState(0);
  const onlineStartRef = useRef(null);

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

  // ── Track minutes online this session ──
  useEffect(() => {
    if (!isOnline) {
      onlineStartRef.current = null;
      setOnlineMinutes(0);
      return;
    }
    if (!onlineStartRef.current) onlineStartRef.current = Date.now();
    const tick = () => setOnlineMinutes(Math.floor((Date.now() - onlineStartRef.current) / 60000));
    tick();
    const intervalId = setInterval(tick, 60000);
    return () => clearInterval(intervalId);
  }, [isOnline]);

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

  // ── Complete ride ──
  // Earnings are computed server-side from the ride's stored price (never
  // trusted from the client) and the 80% driver share is transferred via
  // Stripe Connect once payouts are enabled — see functions/index.js completeRide.
  const completeRide = async ride => {
    try {
      const idToken = await auth.currentUser.getIdToken();

      const res = await fetch(`${getFunctionsBaseUrl()}/completeRide`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ rideId: ride.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to complete ride. Please try again.', 'error');
        return;
      }

      setDriver(prev => ({
        ...prev,
        earnings:      (parseFloat(prev?.earnings      || 0) + data.driverEarnings),
        todayEarnings: (parseFloat(prev?.todayEarnings || 0) + data.driverEarnings),
        weekEarnings:  (parseFloat(prev?.weekEarnings  || 0) + data.driverEarnings),
        totalRides:    (parseInt(prev?.totalRides       || 0) + 1),
      }));

      if (!data.transferred) {
        showToast('Ride completed! Set up payouts in your profile to receive earnings.', 'warning');
      }

      setCompletedRide({ ...ride, driverEarnings: data.driverEarnings, platformFee: data.platformFee });
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
              onlineMinutes={onlineMinutes}
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
