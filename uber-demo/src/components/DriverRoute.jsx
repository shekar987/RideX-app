import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Firestore indexes needed:
// 1. rides: status ASC + driverId ASC + createdAt DESC
// 2. rides: driverId ASC + status ASC + completedAt DESC
// 3. drivers: isOnline ASC + status ASC

// ── Shared loader ─────────────────────────────────────────────────────────────
function Loader({ text = 'Verifying driver access…' }) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-black font-black text-xl">R</span>
                </div>
                <p className="text-white text-sm">{text}</p>
            </div>
        </div>
    );
}

// ── Pending approval screen ───────────────────────────────────────────────────
function PendingScreen() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-yellow-400/10 border border-yellow-400/30 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black mb-2">Application Under Review</h2>
                <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    Your driver application is being reviewed by our team.
                    You'll be notified once approved. This usually takes 24–48 hours.
                </p>
                <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl p-4 mb-6">
                    <p className="text-yellow-400 text-xs font-bold">Status: Pending Approval</p>
                </div>
                <button
                    onClick={() => signOut(auth)}
                    className="w-full py-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-red-500 hover:text-red-400 transition text-sm"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}

// ── Rejected screen ───────────────────────────────────────────────────────────
function RejectedScreen() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black mb-2">Application Rejected</h2>
                <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    Unfortunately your driver application was not approved.
                    Please contact our support team for more information.
                </p>
                <a
                    href="mailto:support@ridex.app"
                    className="block w-full py-3 mb-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition text-sm"
                >
                    Contact Support
                </a>
                <button
                    onClick={() => signOut(auth)}
                    className="w-full py-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition text-sm"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}

// ── Protected route ───────────────────────────────────────────────────────────
function DriverRoute({ children }) {
    // Possible: 'loading' | 'approved' | 'pending' | 'rejected' | 'no_user' | 'customer'
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        // onAuthStateChanged properly restores persisted auth state on refresh,
        // fixing the "logged out on refresh" bug. Never redirect until it fires.
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setStatus('no_user');
                return;
            }
            try {
                const snap = await getDocs(
                    query(collection(db, 'drivers'), where('uid', '==', user.uid))
                );
                if (snap.empty) {
                    setStatus('customer');
                    return;
                }
                // Always fetch fresh status from Firestore on every route check
                const driverStatus = snap.docs[0].data().status;
                setStatus(driverStatus); // 'approved' | 'pending' | 'rejected'
            } catch {
                setStatus('no_user');
            }
        });
        return unsub;
    }, []);

    if (status === 'loading')  return <Loader />;
    if (status === 'customer') return <Navigate to="/login?role=customer" replace />;
    if (status === 'no_user')  return <Navigate to="/driver/login" replace />;
    if (status === 'pending')  return <PendingScreen />;
    if (status === 'rejected') return <RejectedScreen />;
    return children;
}

export default DriverRoute;
