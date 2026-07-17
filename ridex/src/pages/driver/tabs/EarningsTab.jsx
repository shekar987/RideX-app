import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

import { db } from '../../../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { formatDateTime, trunc } from '../utils/format';
import StatCard from '../components/StatCard';
import SectionHeader from '../components/SectionHeader';

// ─────────────────────────────────────────────
// TAB 2 — EARNINGS
// ─────────────────────────────────────────────
export default function EarningsTab({ driver }) {
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
