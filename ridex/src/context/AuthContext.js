import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    reload,
} from 'firebase/auth';
import {
    collection,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
    checkLockout,
    recordFailedAttempt,
    clearAttemptData,
    clearAllAttemptData,
    MAX_ATTEMPTS,
} from '../utils/loginAttempts';
import { readJson, writeJson, removeKey, clearByPrefix } from '../utils/storage';

const AuthContext = createContext(null);

// The in-flight booking (BookRide → Payment → RideStatus) is mirrored to
// sessionStorage so a page reload mid-checkout does not lose the ride.
const CURRENT_RIDE_KEY = 'ridex_current_ride';

// Firestore never rejects a write while offline — it queues it. Without a
// timeout the Confirm button would spin forever on a dead connection.
const SAVE_RIDE_TIMEOUT_MS = 15000;

const CREDENTIAL_ERROR_CODES = [
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-credential',
    'auth/invalid-email',
];

export function AuthProvider({ children }) {
    const [user,          setUser]          = useState(null);
    // reload() mutates the Firebase User in place (same object reference), so the
    // verified flag lives in its own state — otherwise nothing re-renders after
    // the customer clicks their verification link.
    const [emailVerified, setEmailVerified] = useState(false);
    const [loading,       setLoading]       = useState(true);
    const [rideDetails,   setRideState]     = useState(() => readJson(CURRENT_RIDE_KEY, null, 'session'));

    // ── Auth state ────────────────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            // Unverified sessions stay signed in (pending driver applications need
            // an ID token); route guards gate on `emailVerified` instead.
            setUser(firebaseUser);
            setEmailVerified(!!firebaseUser?.emailVerified);
            setLoading(false);
        });
        return unsub;
    }, []);

    // ── Current ride (in-memory + sessionStorage mirror) ─────────────────────
    const setRideDetails = useCallback((details) => {
        setRideState(details);
        if (details) writeJson(CURRENT_RIDE_KEY, details, 'session');
        else removeKey(CURRENT_RIDE_KEY, 'session');
    }, []);

    // ── Register ──────────────────────────────────────────────────────────────
    // Returns { verificationSent }. Once the Auth account exists we must NOT throw
    // on a follow-up failure (rate limit, network blip): the caller would show
    // "registration failed", and retrying would hit email-already-in-use — a
    // dead end. The success screen offers a resend instead.
    const register = useCallback(async (name, email, password) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        let verificationSent = true;
        try {
            await sendEmailVerification(result.user, {
                url: window.location.origin + '/login',
                handleCodeInApp: false,
            });
        } catch {
            verificationSent = false;
        }
        try { await updateProfile(result.user, { displayName: name }); } catch { /* cosmetic */ }
        // onAuthStateChanged fires next and sets the real Firebase User object —
        // do NOT call setUser here with a spread (plain objects lack User methods).
        return { verificationSent };
    }, []);

    // ── Login (with client-side attempt limiter) ─────────────────────────────
    const login = useCallback(async (email, password) => {
        const lock = checkLockout(email);
        if (lock.locked) {
            return { success: false, locked: true, lockedUntil: lock.lockedUntil, attemptsLeft: 0, error: 'Account temporarily locked.' };
        }

        try {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            clearAttemptData(email);
            return { success: true, locked: false, attemptsLeft: MAX_ATTEMPTS, error: null, emailVerified: credential.user.emailVerified };
        } catch (err) {
            const code = err?.code;
            if (CREDENTIAL_ERROR_CODES.includes(code)) {
                const r = recordFailedAttempt(email);
                return {
                    success: false,
                    locked: r.locked,
                    lockedUntil: r.lockedUntil,
                    attemptsLeft: r.attemptsLeft,
                    error: r.locked ? 'Too many failed attempts. Account locked for 15 minutes.' : 'Invalid email or password.',
                };
            }
            const error =
                code === 'auth/too-many-requests'       ? 'Too many attempts. Please wait a few minutes and try again.' :
                code === 'auth/network-request-failed'  ? 'Network error. Check your connection and try again.' :
                                                          'Login failed. Please try again.';
            return { success: false, locked: false, attemptsLeft: Math.max(0, MAX_ATTEMPTS - (lock.data.count || 0)), error, code };
        }
    }, []);

    // ── Logout ────────────────────────────────────────────────────────────────
    // Always clears per-user client caches, even if signOut itself fails, so the
    // next person on a shared device never sees the previous user's rides.
    const logout = useCallback(async () => {
        try {
            await signOut(auth);
        } finally {
            setRideState(null);
            removeKey(CURRENT_RIDE_KEY, 'session');
            clearByPrefix('ridex_', 'local');
            clearAllAttemptData();
        }
    }, []);

    const resetPassword = useCallback(async (email) => {
        await sendPasswordResetEmail(auth, email);
    }, []);

    // ── Refresh the user after e.g. clicking the verification link ───────────
    // Resolves true when the email is now verified. Throws on auth errors so the
    // caller can fall back to a hard reload.
    const refreshUser = useCallback(async () => {
        const current = auth.currentUser;
        if (!current) return false;
        await reload(current);
        const ok = !!auth.currentUser?.emailVerified;
        setEmailVerified(ok);
        return ok;
    }, []);

    // ── Save a booked ride ────────────────────────────────────────────────────
    // Throws 'NOT_AUTHENTICATED' | 'INVALID_PRICE' | 'TIMEOUT' | Firestore errors.
    // Uses a pre-generated id so a timed-out create can be compensated with a
    // queued cancel — no orphaned 'confirmed' ride left for drivers to accept.
    const saveRide = useCallback(async (details) => {
        if (!user) throw new Error('NOT_AUTHENTICATED');
        const price = Number(details?.price);
        if (!Number.isFinite(price) || price <= 0) throw new Error('INVALID_PRICE');

        const otp = String(Math.floor(1000 + Math.random() * 9000));
        const ref = doc(collection(db, 'rides'));
        const customerName = user.displayName || user.email;

        // Both canonical and legacy field names are written so every reader
        // (driver tabs, admin, history) sees the same values.
        const payload = {
            userId:             user.uid,
            userName:           customerName,
            customerName,
            pickup:             details.pickup,
            pickupAddress:      details.pickup,
            pickupLat:          details.pickupLat,
            pickupLng:          details.pickupLng,
            destination:        details.destination,
            destinationAddress: details.destination,
            destinationLat:     details.destinationLat,
            destinationLng:     details.destinationLng,
            price,
            rideType:           details.rideType,
            distance:           details.distance,
            duration:           details.duration,
            passengers:         details.passengers,
            status:             'confirmed',
            driverId:           null,
            driverName:         null,
            otp,
            createdAt:          serverTimestamp(),
        };

        let timer;
        try {
            await Promise.race([
                setDoc(ref, payload),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error('TIMEOUT')), SAVE_RIDE_TIMEOUT_MS);
                }),
            ]);
            return ref.id;
        } catch (err) {
            if (err?.message === 'TIMEOUT') {
                // The create may still land when the connection returns; queue a
                // cancel behind it (owner may set confirmed → cancelled per rules).
                updateDoc(ref, { status: 'cancelled' }).catch(() => {});
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }, [user]);

    // ── Live ride listener ────────────────────────────────────────────────────
    // onData(null) when the document does not exist; onError for permission /
    // network failures (previously swallowed, leaving the status page frozen).
    const listenToRide = useCallback((rideId, onData, onError) => {
        return onSnapshot(
            doc(db, 'rides', rideId),
            (d) => {
                if (!d.exists()) { onData(null); return; }
                onData({ id: d.id, ...d.data() });
            },
            (err) => { if (onError) onError(err); },
        );
    }, []);

    // ── Context value — memoised so consumers only re-render on real changes ─
    const value = useMemo(() => ({
        user,
        emailVerified,
        loading,
        login,
        register,
        logout,
        resetPassword,
        refreshUser,
        rideDetails,
        setRideDetails,
        saveRide,
        listenToRide,
    }), [user, emailVerified, loading, rideDetails, login, register, logout, resetPassword, refreshUser, setRideDetails, saveRide, listenToRide]);

    if (loading) {
        return (
            <div className="min-h-screen min-h-dvh bg-black flex items-center justify-center" role="status" aria-label="Loading">
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
