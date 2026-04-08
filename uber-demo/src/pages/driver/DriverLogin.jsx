import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const COUNTRIES = ['UK', 'USA', 'Canada', 'Australia', 'India', 'UAE', 'Other'];
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Luxury', 'Motorbike'];
const VEHICLE_YEARS = Array.from({ length: 10 }, (_, i) => 2024 - i);

function firebaseErrorMessage(code) {
    const map = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || 'Something went wrong. Please try again.';
}

function PasswordStrength({ password }) {
    const getStrength = () => {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        return score;
    };
    const score = getStrength();
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];
    if (!password) return null;
    return (
        <div className="mt-2">
            <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-gray-700'}`}
                    />
                ))}
            </div>
            <p className="text-xs text-gray-400">{score > 0 ? labels[score] : ''}</p>
        </div>
    );
}

function DriverLogin() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('login'); // 'login' | 'register'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [regError, setRegError] = useState(''); // error shown near register submit button
    const [registered, setRegistered] = useState(false); // full-screen success state
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [resetSent, setResetSent] = useState(false);

    // Login fields
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // Register fields
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        city: '',
        country: 'UK',
        vehicleType: 'Sedan',
        vehicleMake: '',
        vehicleReg: '',
        vehicleYear: '2022',
        licenceNumber: '',
        terms: false,
    });
    const [profilePhoto, setProfilePhoto] = useState(null);
    const fileRef = useRef(null);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
            await auth.currentUser.reload();

            if (!auth.currentUser.emailVerified) {
                await signOut(auth);
                setError('Please verify your email before logging in.');
                setLoading(false);
                return;
            }

            const snap = await getDoc(doc(db, 'drivers', auth.currentUser.uid));
            if (!snap.exists()) {
                await signOut(auth);
                setError('No driver account found. Please register first.');
                setLoading(false);
                return;
            }

            const status = snap.data().status;
            if (status === 'pending') {
                setError("Your account is pending admin approval. We'll notify you by email within 24-48 hours.");
                setLoading(false);
                return;
            }
            if (status === 'rejected') {
                setError('Your application was rejected. Contact support@ridex.com');
                setLoading(false);
                return;
            }
            navigate('/driver/dashboard');
        } catch (err) {
            setError(firebaseErrorMessage(err.code));
        }
        setLoading(false);
    };

    const handleForgotPassword = async () => {
        if (!loginEmail) { setError('Enter your email above first.'); return; }
        try {
            await sendPasswordResetEmail(auth, loginEmail);
            setResetSent(true);
            setError('');
        } catch (err) {
            setError(firebaseErrorMessage(err.code));
        }
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setProfilePhoto(reader.result);
        reader.readAsDataURL(file);
    };

    const handleRegisterChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setRegError('');

        if (!formData.name.trim()) { setRegError('Full name is required.'); return; }
        if (!formData.email.trim()) { setRegError('Email is required.'); return; }
        if (formData.password.length < 6) { setRegError('Password must be at least 6 characters.'); return; }
        if (formData.password !== formData.confirmPassword) { setRegError('Passwords do not match.'); return; }
        if (!formData.phone.trim()) { setRegError('Phone number is required.'); return; }
        if (!formData.city.trim()) { setRegError('City is required.'); return; }
        if (!formData.vehicleMake.trim()) { setRegError('Vehicle make & model is required.'); return; }
        if (!formData.vehicleReg.trim()) { setRegError('Vehicle registration number is required.'); return; }
        if (!formData.licenceNumber.trim()) { setRegError('Driving licence number is required.'); return; }
        if (!formData.terms) { setRegError('You must accept the Terms & Conditions.'); return; }

        setLoading(true);
        const withTimeout = (promise, ms, label) =>
            Promise.race([
                promise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
                ),
            ]);

        try {
            // Step 1 — create Firebase Auth account
            let credential;
            try {
                credential = await withTimeout(
                    createUserWithEmailAndPassword(auth, formData.email, formData.password),
                    20000, 'auth'
                );
            } catch (err) {
                if (err.message?.startsWith('timeout')) {
                    setRegError('Could not reach Firebase. Check your internet connection and try again.');
                } else {
                    setRegError(firebaseErrorMessage(err.code));
                }
                setLoading(false);
                return;
            }

            const user = credential.user;

            // Step 2 — send verification email and update profile WHILE AUTHENTICATED
            try {
                await withTimeout(
                    sendEmailVerification(user, {
                        url: window.location.origin + '/driver/login',
                        handleCodeInApp: false,
                    }),
                    8000, 'email'
                );
            } catch { /* non-fatal */ }
            updateProfile(user, { displayName: formData.name }).catch(() => {});

            // Step 3 — save pending driver profile as the authenticated user.
            try {
                await withTimeout(
                    setDoc(doc(db, 'drivers', user.uid), {
                        uid: user.uid,
                        name: formData.name.trim(),
                        email: formData.email.trim(),
                        phone: formData.phone.trim(),
                        city: formData.city.trim(),
                        country: formData.country,
                        vehicleType: formData.vehicleType,
                        vehicleMake: formData.vehicleMake.trim(),
                        vehicleReg: formData.vehicleReg.trim().toUpperCase(),
                        vehicleYear: String(formData.vehicleYear),
                        licenceNumber: formData.licenceNumber.trim().toUpperCase(),
                        profilePhoto: profilePhoto || '',
                        status: 'pending',
                        isOnline: false,
                        rating: 5.0,
                        totalRides: 0,
                        earnings: 0,
                        todayEarnings: 0,
                        weekEarnings: 0,
                        createdAt: serverTimestamp(),
                    }),
                    20000,
                    'firestore'
                );
            } catch (err) {
                if (err.message?.startsWith('timeout')) {
                    setRegError('Profile save timed out. Please check your connection.');
                } else {
                    setRegError(`Profile save failed: ${err.message}. Contact support@ridex.com.`);
                }
                setLoading(false);
                return;
            }

            // Step 4 — sign out and require email verification before login.
            await signOut(auth).catch(() => {});
            setRegistered(true);
        } catch (err) {
            setRegError(firebaseErrorMessage(err?.code));
        }
        setLoading(false);
    };

    const inputClass = 'w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm';
    const labelClass = 'block text-xs text-gray-400 mb-1.5 font-medium';

    // ── Full-screen success after registration ────────────────────────────────
    if (registered) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
                <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-3">Registration Successful! 🎉</h2>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        Please check your email to verify your account. Once verified, our team will review
                        your application within <span className="text-yellow-400 font-bold">24–48 hours</span>.
                    </p>
                    <div className="bg-black rounded-xl p-4 mb-6 text-left space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-green-400">✓</span>
                            <span className="text-gray-300">Account created</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-yellow-400">→</span>
                            <span className="text-gray-300">Verify your email</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">○</span>
                            <span className="text-gray-500">Admin review (24–48 hrs)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500">○</span>
                            <span className="text-gray-500">Start driving!</span>
                        </div>
                    </div>
                    <button
                        onClick={() => { setRegistered(false); setMode('login'); }}
                        className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-10">
            {/* Back + Logo */}
            <div className="w-full max-w-md mb-6">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm mb-6"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Home
                </button>
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-black font-black text-sm">R</span>
                    </div>
                    <span className="text-xl font-black">RideX</span>
                </div>

                {/* Role tabs */}
                <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
                    <button
                        onClick={() => navigate('/login')}
                        className="flex-1 py-2 text-sm font-bold rounded-lg text-gray-400 hover:text-white transition"
                    >
                        Customer
                    </button>
                    <button className="flex-1 py-2 text-sm font-bold rounded-lg bg-yellow-400 text-black">
                        Driver 🚗
                    </button>
                </div>

                {/* Login / Register toggle */}
                <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
                    <button
                        onClick={() => { setMode('login'); setError(''); setRegError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => { setMode('register'); setError(''); setRegError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${mode === 'register' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Register
                    </button>
                </div>
            </div>

            <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6">
                {/* Role badge */}
                <div className="inline-flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-3 py-1.5 mb-5">
                    <span className="text-yellow-400 text-xs font-bold">Signing in as Driver 🚗</span>
                </div>

                <h2 className="text-2xl font-black mb-1">
                    {mode === 'login' ? 'Welcome back' : 'Become a Driver'}
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                    {mode === 'login' ? 'Sign in to your driver account.' : 'Join the RideX driver community.'}
                </p>

                {/* Login-level messages */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                        <p className="text-red-400 text-sm">{error}</p>
                        {error.includes('verify your email') && (
                            <button
                                className="text-yellow-400 text-xs mt-2 hover:underline"
                                onClick={async () => {
                                    try {
                                        if (auth.currentUser) await sendEmailVerification(auth.currentUser);
                                    } catch { /* ignore */ }
                                }}
                            >
                                Resend verification email
                            </button>
                        )}
                    </div>
                )}
                {resetSent && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-4">
                        <p className="text-blue-400 text-sm">Password reset email sent! Check your inbox.</p>
                    </div>
                )}

                {/* ── LOGIN FORM ── */}
                {mode === 'login' && (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                        <div>
                            <label className={labelClass}>Email address</label>
                            <input
                                type="email"
                                className={inputClass}
                                placeholder="you@example.com"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className={inputClass + ' pr-10'}
                                    placeholder="••••••••"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={handleForgotPassword}
                                className="text-xs text-yellow-400 hover:underline mt-1.5 block"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Signing in…
                                </>
                            ) : 'Sign In'}
                        </button>
                    </form>
                )}

                {/* ── REGISTER FORM ── */}
                {mode === 'register' && (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                        {/* Personal */}
                        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider pt-1">Personal Info</p>

                        <div>
                            <label className={labelClass}>Full Name</label>
                            <input name="name" type="text" className={inputClass} placeholder="James Wilson" value={formData.name} onChange={handleRegisterChange} required />
                        </div>
                        <div>
                            <label className={labelClass}>Email Address</label>
                            <input name="email" type="email" className={inputClass} placeholder="you@example.com" value={formData.email} onChange={handleRegisterChange} required />
                        </div>
                        <div>
                            <label className={labelClass}>Password</label>
                            <div className="relative">
                                <input
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className={inputClass + ' pr-10'}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={handleRegisterChange}
                                    required
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                            <PasswordStrength password={formData.password} />
                        </div>
                        <div>
                            <label className={labelClass}>Confirm Password</label>
                            <div className="relative">
                                <input
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className={inputClass + ' pr-10'}
                                    placeholder="••••••••"
                                    value={formData.confirmPassword}
                                    onChange={handleRegisterChange}
                                    required
                                />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                                    {showConfirmPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Phone Number</label>
                            <input name="phone" type="tel" className={inputClass} placeholder="+44 7700 900000" value={formData.phone} onChange={handleRegisterChange} required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>City</label>
                                <input name="city" type="text" className={inputClass} placeholder="London" value={formData.city} onChange={handleRegisterChange} required />
                            </div>
                            <div>
                                <label className={labelClass}>Country</label>
                                <select name="country" className={inputClass} value={formData.country} onChange={handleRegisterChange}>
                                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Vehicle */}
                        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider pt-2">Vehicle Info</p>

                        <div>
                            <label className={labelClass}>Vehicle Type</label>
                            <select name="vehicleType" className={inputClass} value={formData.vehicleType} onChange={handleRegisterChange}>
                                {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Vehicle Make & Model</label>
                            <input name="vehicleMake" type="text" className={inputClass} placeholder="Toyota Camry" value={formData.vehicleMake} onChange={handleRegisterChange} required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Registration Number</label>
                                <input name="vehicleReg" type="text" className={inputClass} placeholder="AB12 CDE" value={formData.vehicleReg} onChange={handleRegisterChange} required />
                            </div>
                            <div>
                                <label className={labelClass}>Vehicle Year</label>
                                <select name="vehicleYear" className={inputClass} value={formData.vehicleYear} onChange={handleRegisterChange}>
                                    {VEHICLE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Driving Licence Number</label>
                            <input name="licenceNumber" type="text" className={inputClass} placeholder="SMITH901157AB9CD" value={formData.licenceNumber} onChange={handleRegisterChange} required />
                        </div>

                        {/* Photo */}
                        <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider pt-2">Profile Photo</p>
                        <div
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-yellow-400/50 transition"
                        >
                            {profilePhoto ? (
                                <img src={profilePhoto} alt="Preview" className="w-20 h-20 rounded-full object-cover mx-auto" />
                            ) : (
                                <>
                                    <p className="text-3xl mb-2">📷</p>
                                    <p className="text-sm text-gray-400">Click to upload profile photo</p>
                                    <p className="text-xs text-gray-600 mt-1">JPG, PNG — max 2MB</p>
                                </>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

                        {/* Register-level error — shown near submit button */}
                        {regError && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                <p className="text-red-400 text-sm">{regError}</p>
                            </div>
                        )}

                        {/* Terms */}
                        <div className="flex items-start gap-3 pt-1">
                            <input
                                name="terms"
                                type="checkbox"
                                id="terms"
                                checked={formData.terms}
                                onChange={handleRegisterChange}
                                className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
                            />
                            <label htmlFor="terms" className="text-xs text-gray-400 leading-relaxed cursor-pointer">
                                I agree to the{' '}
                                <span className="text-yellow-400">Terms & Conditions</span> and{' '}
                                <span className="text-yellow-400">Privacy Policy</span>. I confirm all information provided is accurate.
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                    Registering…
                                </>
                            ) : 'Create Driver Account'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default DriverLogin;
