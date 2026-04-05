import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DriverEarnings({ driver }) {
    const [completedRides, setCompletedRides] = useState(null);

    useEffect(() => {
        if (!driver?.uid) return;
        const q = query(
            collection(db, 'rides'),
            where('driverId', '==', driver.uid),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(50)
        );
        const unsub = onSnapshot(q, (snap) => {
            setCompletedRides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, [driver]);

    // Build weekly chart data (last 7 days)
    const buildWeeklyData = () => {
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return { label: DAY_LABELS[d.getDay()], date: d.toDateString(), earnings: 0 };
        });
        if (completedRides) {
            completedRides.forEach((ride) => {
                const rideDate = ride.completedAt?.toDate
                    ? ride.completedAt.toDate().toDateString()
                    : null;
                const day = days.find((d) => d.date === rideDate);
                if (day) day.earnings += parseFloat(ride.driverEarnings || 0);
            });
        }
        return days.map((d) => ({ day: d.label, earnings: parseFloat(d.earnings.toFixed(2)) }));
    };

    // Compute month earnings from completed rides
    const computeMonthEarnings = () => {
        if (!completedRides) return 0;
        const now = new Date();
        return completedRides
            .filter((r) => {
                const d = r.completedAt?.toDate ? r.completedAt.toDate() : null;
                return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            })
            .reduce((sum, r) => sum + parseFloat(r.driverEarnings || 0), 0);
    };

    const weeklyData = buildWeeklyData();
    const monthEarnings = computeMonthEarnings();

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload?.length) {
            return (
                <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm">
                    <p className="text-gray-400">{label}</p>
                    <p className="text-yellow-400 font-bold">£{payload[0].value.toFixed(2)}</p>
                </div>
            );
        }
        return null;
    };

    if (!completedRides) {
        return (
            <div className="space-y-4 animate-pulse">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-800 rounded-2xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { label: "Today", value: driver?.todayEarnings || 0 },
                    { label: "This Week", value: driver?.weekEarnings || 0 },
                    { label: "This Month", value: monthEarnings },
                    { label: "All Time", value: driver?.earnings || 0 },
                ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                        <p className="text-xs text-gray-400 mb-1">{label}</p>
                        <p className="text-xl font-black text-yellow-400">£{parseFloat(value).toFixed(2)}</p>
                    </div>
                ))}
            </div>

            {/* Weekly bar chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-sm font-bold text-white mb-4">This Week's Earnings</p>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyData} barSize={28}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${v}`} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(250,204,21,0.05)' }} />
                            <Bar dataKey="earnings" fill="#facc15" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent transactions */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-sm font-bold text-white mb-4">Recent Transactions</p>
                {completedRides.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-3xl mb-2">💷</p>
                        <p className="text-gray-400 text-sm">No earnings yet. Accept your first ride!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {completedRides.slice(0, 10).map((ride) => {
                            const date = ride.completedAt?.toDate
                                ? ride.completedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                : '—';
                            return (
                                <div key={ride.id} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                                    <div className="w-8 h-8 bg-yellow-400/10 rounded-full flex items-center justify-center shrink-0">
                                        <span className="text-sm">🚗</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-gray-400">{date}</p>
                                        <p className="text-sm text-white truncate">
                                            {ride.pickup?.split(',')[0]} → {ride.destination?.split(',')[0]}
                                        </p>
                                    </div>
                                    <p className="text-yellow-400 font-black text-sm shrink-0">
                                        +£{parseFloat(ride.driverEarnings || 0).toFixed(2)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default DriverEarnings;
