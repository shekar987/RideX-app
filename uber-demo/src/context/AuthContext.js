import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
} from 'firebase/auth';
import {
    collection,
    addDoc,
    doc,
    onSnapshot,
    serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

const PLACEHOLDER_DRIVER = {
    driverName: 'Driver TBD',
    driverCar:  'Vehicle TBD',
    driverRating: null,
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;

function getAttemptData(email) {
    try {
        const raw = sessionStorage.getItem(`_la_${btoa(email.toLowerCase().trim())}`);
        return raw ? JSON.parse(raw) : { count: 0, lockedUntil: null };
    } catch { return { count: 0, lockedUntil: null }; }
}
function setAttemptData(email, data) {
    try { sessionStorage.setItem(`_la_${btoa(email.toLowerCase().trim())}`, JSON.stringify(data)); } catch {}
}
function clearAttemptData(email) {
    try { sessionStorage.removeItem(`_la_${btoa(email.toLowerCase().trim())}`); } catch {}
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rideDetails, setRideDetails] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });
        return unsub;
    }, []);

    // ── useCallback: stable references so downstream useMemo deps are accurate ─

    const register = useCallback(async (name, email, password) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
        await sendEmailVerification(result.user);
        // onAuthStateChanged fires next and sets the real Firebase User object —
        // do NOT call setUser here with a spread (plain objects lack User methods).
    }, []);

    const login = useCallback(async (email, password) => {
        const now  = Date.now();
        const data = getAttemptData(email);

        if (data.lockedUntil && now < data.lockedUntil) {
            return { success: false, locked: true, lockedUntil: data.lockedUntil, attemptsLeft: 0, error: 'Account temporarily locked.' };
        }
        if (data.lockedUntil && now >= data.lockedUntil) {
            setAttemptData(email, { count: 0, lockedUntil: null });
            data.count = 0; data.lockedUntil = null;
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
            clearAttemptData(email);
            return { success: true, locked: false, attemptsLeft: MAX_ATTEMPTS, error: null };
        } catch (err) {
            const isCredential =
                err.code === 'auth/wrong-password'     ||
                err.code === 'auth/user-not-found'     ||
                err.code === 'auth/invalid-credential' ||
                err.code === 'auth/invalid-email';

            if (isCredential) {
                const newCount = (data.count || 0) + 1;
                const locked   = newCount >= MAX_ATTEMPTS;
                setAttemptData(email, { count: newCount, lockedUntil: locked ? now + LOCKOUT_MS : null });
                return {
                    success: false, locked,
                    lockedUntil: locked ? now + LOCKOUT_MS : null,
                    attemptsLeft: Math.max(0, MAX_ATTEMPTS - newCount),
                    error: locked ? 'Too many failed attempts. Account locked for 15 minutes.' : 'Invalid email or password.',
                };
            }
            return { success: false, locked: false, attemptsLeft: MAX_ATTEMPTS - (data.count || 0), error: 'Login failed. Please try again.' };
        }
    }, []);

    // logout depends on setRideDetails which is stable (React guarantees setState is stable)
    const logout = useCallback(async () => {
        await signOut(auth);
        setRideDetails(null);
    }, []);

    const resetPassword = useCallback(async (email) => {
        await sendPasswordResetEmail(auth, email);
    }, []);

    // saveRide closes over `user` — re-created only when user changes
    const saveRide = useCallback(async (details) => {
        if (!user) return;
        const docRef = await addDoc(collection(db, 'rides'), {
            userId:      user.uid,
            userName:    user.displayName || user.email,
            pickup:      details.pickup,
            destination: details.destination,
            price:       details.price,
            rideType:    details.rideType,
            distance:    details.distance,
            duration:    details.duration,
            passengers:  details.passengers,
            status:      'confirmed',
            driverName:  PLACEHOLDER_DRIVER.driverName,
            driverCar:   PLACEHOLDER_DRIVER.driverCar,
            driverRating: PLACEHOLDER_DRIVER.driverRating,
            driverLat:   details.pickupLat,
            driverLng:   details.pickupLng,
            createdAt:   serverTimestamp(),
        });
        return docRef.id;
    }, [user]);

    const listenToRide = useCallback((rideId, callback) => {
        return onSnapshot(doc(db, 'rides', rideId), (d) => callback({ id: d.id, ...d.data() }));
    }, []);

    // ── useMemo: context value is a stable object; consumers only re-render when
    //    user or rideDetails actually change — not on unrelated parent renders.
    const value = useMemo(() => ({
        user,
        login,
        register,
        logout,
        resetPassword,
        rideDetails,
        setRideDetails,
        saveRide,
        listenToRide,
    }), [user, rideDetails, login, register, logout, resetPassword, saveRide, listenToRide]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-black font-black text-xl">R</span>
                    </div>
                    <p className="text-white font-bold text-lg">RideX</p>
                    <p className="text-gray-500 text-sm mt-1">Loading…</p>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
