import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db } from '../../../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNotifications, describeNotificationFailure } from '../../../hooks/useNotifications';
import { DRIVER_SHARE } from '../../../constants/fees';
import { getFunctionsBaseUrl } from '../utils/format';
import { fetchJson } from '../../../utils/net';
import { formatMoney, initialOf } from '../../../utils/ride';
import { toDateSafe } from '../../../utils/time';
import { SkeletonLine } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const STRIPE_CONNECT_ORIGIN = 'https://connect.stripe.com';

// ─────────────────────────────────────────────
// Stripe Connect payout setup card — shown in Profile tab
// Status is fetched the first time the Profile tab is opened (not on every
// dashboard load — the status endpoint calls the Stripe API).
// ─────────────────────────────────────────────
function PayoutSetupCard({ showToast, active = true }) {
  const [status,   setStatus]   = useState(null); // null = loading / not yet fetched
  const [starting, setStarting] = useState(false);
  const checkedRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const user = auth.currentUser;
      const baseUrl = getFunctionsBaseUrl();
      if (!user || !baseUrl) { setStatus({ connected: false, unavailable: true }); return; }
      const idToken = await user.getIdToken();
      const { res, data } = await fetchJson(`${baseUrl}/connectAccountStatus`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setStatus(res.ok ? data : { connected: false, unavailable: true });
    } catch {
      setStatus({ connected: false, unavailable: true });
    }
  }, []);

  useEffect(() => {
    if (active && !checkedRef.current) {
      checkedRef.current = true;
      checkStatus();
    }
  }, [active, checkStatus]);

  const startOnboarding = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const user = auth.currentUser;
      const baseUrl = getFunctionsBaseUrl();
      if (!user || !baseUrl) { showToast('Payout setup is unavailable right now.', 'error'); return; }
      const idToken = await user.getIdToken();
      const { res, data } = await fetchJson(`${baseUrl}/createConnectAccount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      }, { timeoutMs: 20000 });
      // Only ever follow a Stripe-hosted onboarding link
      if (!res.ok || typeof data.url !== 'string' || !data.url.startsWith(STRIPE_CONNECT_ORIGIN)) {
        showToast(data.error || 'Could not start payout setup.', 'error');
        return;
      }
      window.location.assign(data.url);
    } catch {
      showToast('Could not start payout setup. Please try again.', 'error');
    } finally {
      setStarting(false);
    }
  };

  const ready   = status?.connected && status.payoutsEnabled;
  const pending = status?.connected && !status.payoutsEnabled;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
      <SectionHeader title="Payouts" subtitle={`Powered by Stripe Connect — your ${DRIVER_SHARE * 100}% share is paid out automatically`} />

      {status === null ? (
        <SkeletonLine className="h-10 w-full" />
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border min-w-0 self-start
            ${ready
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : pending
                ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-green-400' : pending ? 'bg-yellow-400' : 'bg-gray-500'}`} aria-hidden="true" />
            <span className="truncate">
              {ready ? 'Ready to receive payouts' : pending ? 'Verification pending' : status.unavailable ? 'Status unavailable' : 'Not set up'}
            </span>
          </span>

          <div className="flex gap-2 sm:flex-shrink-0">
            {status.unavailable && (
              <button
                type="button"
                onClick={checkStatus}
                className="px-4 py-3 min-h-[44px] bg-gray-800 text-gray-300 text-sm font-bold rounded-xl hover:bg-gray-700 transition"
              >
                Refresh
              </button>
            )}
            <button
              type="button"
              onClick={startOnboarding}
              disabled={starting}
              className="flex-1 sm:flex-none px-4 py-3 min-h-[44px] bg-yellow-400 text-black text-sm font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60"
            >
              {starting ? 'Loading…' : ready ? 'Manage' : pending ? 'Continue setup' : 'Set up payouts'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Push notification opt-in card — shown in Profile tab
// Saves the FCM token to the driver's Firestore doc so Cloud Functions
// can push "new ride available" alerts even when the app is in the background.
// ─────────────────────────────────────────────
function NotificationsCard({ driverUid, showToast }) {
  const { supported, permission, requestPermission } = useNotifications();
  const [saving, setSaving] = useState(false);

  const handleEnable = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Use the RESULT, not the hook's `permission` state — that is stale in this closure
      const { token, reason } = await requestPermission();
      if (token && driverUid) {
        try {
          await updateDoc(doc(db, 'drivers', driverUid), { fcmToken: token });
          showToast('Notifications enabled!', 'success');
        } catch {
          showToast('Permission granted but the token could not be saved — try again later.', 'warning');
        }
      } else {
        showToast(describeNotificationFailure(reason), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!supported) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Notifications" subtitle="Push alerts for new ride requests" />
        <p className="text-gray-500 text-sm leading-relaxed">
          {describeNotificationFailure('unsupported')}
        </p>
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Notifications" subtitle="Push alerts for new ride requests" />
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-green-500/15 border-green-500/30 text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
          Enabled
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
      <SectionHeader title="Notifications" subtitle="Get alerted for new ride requests even when the app is in the background" />
      <button
        type="button"
        onClick={handleEnable}
        disabled={saving || permission === 'denied'}
        className="w-full py-3 bg-yellow-400 text-black text-sm font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Enabling…' : permission === 'denied' ? 'Blocked — enable in browser settings' : 'Enable Notifications'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB 4 — PROFILE
// ─────────────────────────────────────────────
export default function ProfileTab({ driver, setDriver, showToast, active = true }) {
  const navigate = useNavigate();
  const [form,       setForm]       = useState({ name: '', phone: '', city: '' });
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const savedTimerRef = useRef(null);

  useEffect(() => {
    if (driver) {
      setForm({ name: driver.name || '', phone: driver.phone || '', city: driver.city || '' });
    }
  }, [driver]);

  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  const handleSave = async () => {
    if (!driver?.uid || saving) return;
    const name  = form.name.trim();
    const phone = form.phone.trim();
    const city  = form.city.trim();
    if (name.length < 2)                 { showToast('Please enter your name.', 'error'); return; }
    if (phone && !PHONE_RE.test(phone))  { showToast('Please enter a valid phone number.', 'error'); return; }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'drivers', driver.uid), { name, phone, city });
      setDriver(prev => ({ ...prev, name, phone, city }));
      setSaved(true);
      showToast('Profile updated successfully!', 'success');
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 3000);
    } catch (_) {
      showToast('Failed to save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Go offline BEFORE signing out — otherwise a logged-out driver keeps
  // receiving assignments from dispatch.
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (driver?.uid) {
        await updateDoc(doc(db, 'drivers', driver.uid), { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
      }
      await signOut(auth);
      navigate('/driver/login');
    } catch (_) {
      showToast('Could not sign out. Check your connection and try again.', 'error');
      setLoggingOut(false);
    }
  };

  const memberSince = toDateSafe(driver?.createdAt);

  return (
    <div className="space-y-5">

      {/* Profile header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center shadow-sm shadow-black/40">
        <div className="w-20 h-20 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md shadow-yellow-400/20" aria-hidden="true">
          <span className="text-black font-black text-3xl">{initialOf(driver?.name, 'D')}</span>
        </div>
        <p className="text-white font-black text-xl leading-tight break-words">{driver?.name || 'Driver'}</p>
        <p className="text-gray-500 text-sm mt-0.5 break-all px-2">{driver?.email || ''}</p>
        <div className="flex items-center justify-center gap-1 mt-2">
          <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
          <span className="text-yellow-400 font-bold">{(Number(driver?.rating) || 5).toFixed(1)}</span>
          <span className="text-gray-600 text-sm">/ 5.0</span>
        </div>
        {memberSince && (
          <p className="text-gray-600 text-xs mt-2">
            Member since {memberSince.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Quick stats — 2 columns on phones (3 columns squeeze the labels), 3 from sm: */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total Rides" value={Number(driver?.totalRides) || 0} />
        <StatCard label="All Time"    value={formatMoney(driver?.earnings ?? 0)} accent />
        <div className="col-span-2 sm:col-span-1 flex">
          <StatCard label="Rating" value={`${(Number(driver?.rating) || 5).toFixed(1)}`} />
        </div>
      </div>

      <PayoutSetupCard showToast={showToast} active={active} />

      <NotificationsCard driverUid={driver?.uid} showToast={showToast} />

      {/* Editable info */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4 shadow-sm shadow-black/40">
        <SectionHeader title="Personal Information" />
        {[
          { label: 'Full Name', key: 'name',  type: 'text', autoComplete: 'name' },
          { label: 'Phone',     key: 'phone', type: 'tel',  autoComplete: 'tel' },
          { label: 'City',      key: 'city',  type: 'text', autoComplete: 'address-level2' },
        ].map(({ label, key, type, autoComplete }) => (
          <div key={key}>
            <label htmlFor={`profile-${key}`} className="text-gray-500 text-xs font-medium block mb-1.5">{label}</label>
            <input
              id={`profile-${key}`}
              type={type}
              autoComplete={autoComplete}
              value={form[key]}
              onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-yellow-400 transition"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
        ].filter(row => row.value).map(({ label, value }) => (
          <div key={label} className="flex justify-between items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
            <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
            <span className="text-white text-sm font-semibold text-right min-w-0 break-all">{String(value)}</span>
          </div>
        ))}
        <p className="text-gray-700 text-xs pt-3">
          Vehicle details cannot be changed after approval. Contact support to update.
        </p>
      </div>

      {/* Account */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Account" />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full py-3 border border-red-500/40 text-red-400 font-bold rounded-xl hover:bg-red-500/10 active:bg-red-500/20 transition disabled:opacity-60"
        >
          {loggingOut ? 'Signing out…' : 'Log Out'}
        </button>
      </div>
    </div>
  );
}
