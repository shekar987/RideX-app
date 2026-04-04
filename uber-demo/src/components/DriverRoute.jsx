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
    // 'loading' | 'approved' | 'pending_or_rejected' | 'customer'
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setStatus('pending_or_rejected'); // no user → send to driver login
                return;
            }
            try {
                const snap = await getDocs(
                    query(collection(db, 'drivers'), where('uid', '==', user.uid))
                );

                if (snap.empty) {
                    // No driver document — this is a regular customer
                    setStatus('customer');
                    return;
                }

                const driverStatus = snap.docs[0].data().status;
                setStatus(driverStatus === 'approved' ? 'approved' : 'pending_or_rejected');
            } catch {
                setStatus('pending_or_rejected');
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
                    <p className="text-white text-sm">Verifying driver access…</p>
                </div>
            </div>
        );
    }

    // Regular customer tried to access a driver page
    if (status === 'customer') return <Navigate to="/login?role=customer" replace />;

    // Not approved (pending / rejected / not logged in)
    if (status === 'pending_or_rejected') return <Navigate to="/driver/login" replace />;

    return children;
}

export default DriverRoute;
