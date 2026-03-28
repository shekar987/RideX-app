import { createContext, useContext, useState, useEffect } from 'react';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'firebase/auth';
import {
    collection,
    addDoc,
    doc,
    onSnapshot,
    serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rideDetails, setRideDetails] = useState(null);
    const [currentRide, setCurrentRide] = useState(null);

    // Listen for auth state changes
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });
        return unsub;
    }, []);

    // Register
    const register = async (name, email, password) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name });
        setUser({ ...result.user, displayName: name });
    };

    // Login
    const login = async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    };

    // Logout
    const logout = async () => {
        await signOut(auth);
        setCurrentRide(null);
    };

    // Save ride to Firestore
    const saveRide = async (details) => {
        if (!user) return;
        const docRef = await addDoc(collection(db, 'rides'), {
            userId: user.uid,
            userName: user.displayName || user.email,
            pickup: details.pickup,
            destination: details.destination,
            price: details.price,
            rideType: details.rideType,
            distance: details.distance,
            duration: details.duration,
            passengers: details.passengers,
            status: 'confirmed',
            driverName: 'James Wilson',
            driverCar: 'Toyota Camry',
            driverRating: 4.9,
            driverLat: details.pickupLat,
            driverLng: details.pickupLng,
            createdAt: serverTimestamp(),
        });
        return docRef.id;
    };

    // Listen to ride updates in real time
    const listenToRide = (rideId, callback) => {
        const { doc, onSnapshot: snap } = require('firebase/firestore');
        const rideRef = doc(db, 'rides', rideId);
        return snap(rideRef, (d) => callback({ id: d.id, ...d.data() }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-black font-black text-xl">R</span>
                    </div>
                    <p className="text-white font-bold text-lg">RideX</p>
                    <p className="text-gray-500 text-sm mt-1">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{
            user, login, register, logout,
            rideDetails, setRideDetails,
            currentRide, setCurrentRide,
            saveRide, listenToRide
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}