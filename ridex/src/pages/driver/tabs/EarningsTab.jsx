import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

import { db } from '../../../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { DRIVER_SHARE } from '../../../constants/fees';
import { formatDateTime, trunc } from '../utils/format';
import { normalizeRide, formatMoney } from '../../../utils/ride';
import { toDateSafe } from '../../../utils/time';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';

// Local calendar-day key (NOT toISOString — that is UTC and shifts the day in BST)
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// ─────────────────────────────────────────────
// TAB 2 — EARNINGS
// ─────────────────────────────────────────────
export default function EarningsTab({ driver, active = true }) {
  const [chartData,    setChartData]    = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [recentTxns,   setRecentTxns]   = useState([]);
  const [error,        setError]        = useState('');
  const [reloadKey,    setReloadKey]    = useState(0);

  // The chart lives inside a hidden tab panel. Mount it the first time the tab
  // is shown (so ResponsiveContainer never measures a 0×0 box) and keep it
  // mounted after that (so the bar animation doesn't replay on every visit).
  const [chartMounted, setChartMounted] = useState(false);
  useEffect(() => { if (active) setChartMounted(true); }, [active]);

  useEffect(() => {
    if (!driver?.uid) return undefined;
    setChartLoading(true);
    setError('');

    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', driver.uid),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(100),
    );

    const unsub = onSnapshot(q, snap => {
      // Build the 7-day window at snapshot time, so a dashboard left open
      // overnight buckets against today, not the day it was opened.
      const days  = {};
      const order = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        days[key] = { day: d.toLocaleDateString('en-GB', { weekday: 'short' }), earnings: 0 };
        order.push(key);
      }
      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      windowStart.setDate(windowStart.getDate() - 6);

      const txns = [];
      snap.docs.forEach(docSnap => {
        const r = normalizeRide(docSnap.id, docSnap.data());
        // Rides completed by the old client-side flow have no driverEarnings
        const stored = Number(r.driverEarnings);
        r.driverEarnings = Number.isFinite(stored) ? stored : r.price * DRIVER_SHARE;
        const ts = toDateSafe(r.completedAt);
        if (ts && ts >= windowStart) {
          const key = dayKey(ts);
          if (days[key]) days[key].earnings += r.driverEarnings;
        }
        txns.push(r);
      });

      setChartData(order.map(k => ({ day: days[k].day, earnings: Number(days[k].earnings.toFixed(2)) })));
      setRecentTxns(txns.slice(0, 10));
      setChartLoading(false);
    }, () => {
      setChartLoading(false);
      setError('Could not load your earnings. Check your connection and retry.');
    });

    return () => unsub();
  }, [driver?.uid, reloadKey]);

  const CustomTooltip = ({ active: tipActive, payload, label }) => {
    if (tipActive && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
          <p className="text-gray-400 text-xs">{label}</p>
          <p className="text-yellow-400 font-black">{formatMoney(Number(payload[0]?.value ?? 0))}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">

      {/* Summary KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Today"       value={formatMoney(driver?.todayEarnings ?? 0)} accent large />
        <StatCard label="This Week"   value={formatMoney(driver?.weekEarnings  ?? 0)} large />
        <StatCard label="All Time"    value={formatMoney(driver?.earnings      ?? 0)} large />
        <StatCard label="Total Rides" value={Number(driver?.totalRides) || 0} large />
      </div>

      {/* Weekly bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Last 7 Days" />
        {chartLoading ? (
          <div className="h-40 sm:h-56 flex items-center justify-center" role="status" aria-label="Loading earnings">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div role="alert" className="h-40 sm:h-56 flex flex-col items-center justify-center text-center gap-3 px-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="px-5 py-2.5 min-h-[44px] bg-gray-800 text-gray-200 text-sm font-semibold rounded-xl hover:bg-gray-700 transition"
            >
              Retry
            </button>
          </div>
        ) : chartMounted ? (
          <div className="h-40 sm:h-56">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 160 }}>
              <BarChart data={chartData} barSize={24}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="earnings" fill="#facc15" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 sm:h-56" aria-hidden="true" />
        )}
      </div>

      {/* Recent transactions */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-sm shadow-black/40">
        <SectionHeader title="Recent Transactions" />
        {chartLoading ? (
          <div className="space-y-3 py-2" aria-hidden="true">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : error ? (
          <p className="text-gray-600 text-sm text-center py-6">Unavailable right now.</p>
        ) : recentTxns.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {recentTxns.map(r => (
              <div key={r.id} className="py-3.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 text-xs">{formatDateTime(r.completedAt) || 'Pending…'}</p>
                  <p className="text-white text-sm truncate mt-0.5">
                    {trunc(r.pickupAddress, 20)} → {trunc(r.destinationAddress, 20)}
                  </p>
                </div>
                <p className="text-yellow-400 font-black flex-shrink-0 tabular-nums">{formatMoney(r.driverEarnings)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
