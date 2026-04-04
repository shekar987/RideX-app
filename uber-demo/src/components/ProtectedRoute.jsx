import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { sendEmailVerification, reload } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

function ProtectedRoute({ children }) {
    const { user } = useAuth();
    const [checking, setChecking] = useState(true);
    const [isDriver, setIsDriver] = useState(false);

    useEffect(() => {
        // Skip the Firestore check if there's no verified user — the
        // early-return guards below handle those cases synchronously.
        if (!user || !user.emailVerified) {
            setChecking(false);
            return;
        }
        let cancelled = false;
        getDocs(query(collection(db, 'drivers'), where('uid', '==', user.uid)))
            .then((snap) => {
                if (!cancelled) {
                    setIsDriver(!snap.empty);
                    setChecking(false);
                }
            })
            .catch(() => {
                if (!cancelled) setChecking(false);
            });
        return () => { cancelled = true; };
    }, [user]);

    // Not logged in
    if (!user) return <Navigate to="/login?role=customer" replace />;

    // Logged in but email not verified
    if (!user.emailVerified) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md text-center">
                    <p className="text-4xl mb-4">📧</p>
                    <h2 className="text-2xl font-black mb-2">Verify your email</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Please check your inbox and click the verification link before booking a ride.
                        Once verified, refresh this page.
                    </p>
                    <button
                        onClick={() => sendEmailVerification(user).catch(() => {})}
                        className="w-full py-3 mb-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                    >
                        Resend Verification Email
                    </button>
                    <button
                        onClick={() => reload(user).catch(() => window.location.reload())}
                        className="w-full py-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition"
                    >
                        I've verified — Refresh
                    </button>
                </div>
            </div>
        );
    }

    // Still checking Firestore
    if (checking) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-black font-black">R</span>
                </div>
            </div>
        );
    }

    // Driver trying to access a customer page
    if (isDriver) return <Navigate to="/driver/dashboard" replace />;

    return children;
}

export default ProtectedRoute;
