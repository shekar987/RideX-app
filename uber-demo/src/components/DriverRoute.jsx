import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

function FullScreenLoader() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-black font-black text-2xl">R</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
                <p className="text-gray-400 text-sm">Verifying driver account…</p>
            </div>
        </div>
    );
}

function PendingPage({ onLogout }) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-yellow-400/10 border border-yellow-400/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-3">Application Under Review</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-8">
                    Our team is reviewing your application. You will receive an email once approved.
                    This usually takes 24–48 hours.
                </p>
                <button
                    onClick={onLogout}
                    className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition border border-gray-700"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

function RejectedPage({ onLogout }) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-3">Application Rejected</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-8">
                    Unfortunately your application was not approved. Please contact support at{' '}
                    <a href="mailto:support@ridex.com" className="text-yellow-400 hover:underline">
                        support@ridex.com
                    </a>
                </p>
                <button
                    onClick={onLogout}
                    className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition border border-gray-700"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

function DriverRoute({ children }) {
    const [state, setState] = useState('loading'); // loading | no-auth | pending | rejected | approved

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setState('no-auth');
                return;
            }
            try {
                const snap = await getDoc(doc(db, 'drivers', user.uid));
                if (!snap.exists()) {
                    setState('no-auth');
                    return;
                }
                const status = snap.data().status;
                if (status === 'pending') setState('pending');
                else if (status === 'rejected') setState('rejected');
                else if (status === 'approved') setState('approved');
                else setState('no-auth');
            } catch {
                setState('no-auth');
            }
        });
        return unsub;
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        window.location.href = '/driver/login';
    };

    if (state === 'loading') return <FullScreenLoader />;
    if (state === 'no-auth') {
        window.location.replace('/driver/login');
        return <FullScreenLoader />;
    }
    if (state === 'pending') return <PendingPage onLogout={handleLogout} />;
    if (state === 'rejected') return <RejectedPage onLogout={handleLogout} />;
    return children;
}

export default DriverRoute;
