import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Make sure Firestore rules allow:
// - drivers to read/write their own driver document
// - drivers to read rides where status == 'confirmed'
// - drivers to update rides where driverId == their uid

function DriverRoute({ children }) {
    const [status, setStatus] = useState('loading'); // 'loading' | 'approved' | 'denied'

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setStatus('denied');
                return;
            }
            try {
                const q = query(
                    collection(db, 'drivers'),
                    where('uid', '==', user.uid),
                    where('status', '==', 'approved')
                );
                const snap = await getDocs(q);
                setStatus(snap.empty ? 'denied' : 'approved');
            } catch {
                setStatus('denied');
            }
        });
        return unsub;
    }, []);

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                        <span className="text-black font-black text-xl">R</span>
                    </div>
                    <p className="text-white text-sm mt-2">Verifying driver access…</p>
                </div>
            </div>
        );
    }

    if (status === 'denied') {
        return <Navigate to="/driver/login" replace />;
    }

    return children;
}

export default DriverRoute;
