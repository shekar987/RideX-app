import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db } from '../../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNotifications } from '../../../hooks/useNotifications';
import { DRIVER_SHARE } from '../../../constants/fees';
import { getFunctionsBaseUrl } from '../utils/format';
import { SkeletonLine } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';

// ─────────────────────────────────────────────
// Stripe Connect payout setup card — shown in Profile tab
// ─────────────────────────────────────────────
function PayoutSetupCard({ showToast }) {
  const [status,  setStatus]  = useState(null); // null = loading
  const [starting, setStarting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`${getFunctionsBaseUrl()}/connectAccountStatus`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      setStatus(res.ok ? data : { connected: false });
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const startOnboarding = async () => {
    setStarting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`${getFunctionsBaseUrl()}/createConnectAccount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        showToast(data.error || 'Could not start payout setup.', 'error');
        setStarting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      showToast('Could not start payout setup. Please try again.', 'error');
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
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
            ${ready
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : pending
                ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ready ? 'bg-green-400' : pending ? 'bg-yellow-400' : 'bg-gray-500'}`} />
            {ready ? 'Ready to receive payouts' : pending ? 'Verification pending' : 'Not set up'}
          </span>

          <button
            onClick={startOnboarding}
            disabled={starting}
            className="px-4 py-2 bg-yellow-400 text-black text-xs font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 flex-shrink-0"
          >
            {starting ? 'Loading…' : ready ? 'Manage' : pending ? 'Continue setup' : 'Set up payouts'}
          </button>
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
  const { permission, requestPermission } = useNotifications();
  const [saving, setSaving] = useState(false);

  const handleEnable = async () => {
    setSaving(true);
    const fcmToken = await requestPermission();
    if (fcmToken && driverUid) {
      try {
        await updateDoc(doc(db, 'drivers', driverUid), { fcmToken });
        showToast('Notifications enabled!', 'success');
      } catch {
        showToast('Token saved locally but could not sync to server.', 'warning');
      }
    } else if (fcmToken === null && permission !== 'granted') {
      showToast('Notification permission denied.', 'error');
    }
    setSaving(false);
  };

  if (permission === 'granted') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Notifications" subtitle="Push alerts for new ride requests" />
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-green-500/15 border-green-500/30 text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          Enabled
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
      <SectionHeader title="Notifications" subtitle="Get alerted for new ride requests even when the app is in the background" />
      <button
        onClick={handleEnable}
        disabled={saving || permission === 'denied'}
        className="w-full py-2.5 bg-yellow-400 text-black text-sm font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Enabling…' : permission === 'denied' ? 'Blocked — enable in browser settings' : 'Enable Notifications'}
      </button>
    </div>
  );
}

export default function ProfileTab({ driver, setDriver, showToast }) {
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

      <PayoutSetupCard showToast={showToast} />

      <NotificationsCard driverUid={driver?.uid} showToast={showToast} />

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
