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
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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
    const [success, setSuccess] = useState('');
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
        setError('');
        setSuccess('');

        if (!formData.name.trim()) { setError('Full name is required.'); return; }
        if (!formData.email.trim()) { setError('Email is required.'); return; }
        if (formData.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        if (formData.password !== formData.confirmPassword) { setError('Passwords do not match.'); return; }
        if (!formData.phone.trim()) { setError('Phone number is required.'); return; }
        if (!formData.city.trim()) { setError('City is required.'); return; }
        if (!formData.vehicleMake.trim()) { setError('Vehicle make & model is required.'); return; }
        if (!formData.vehicleReg.trim()) { setError('Vehicle registration number is required.'); return; }
        if (!formData.licenceNumber.trim()) { setError('Driving licence number is required.'); return; }
        if (!formData.terms) { setError('You must accept the Terms & Conditions.'); return; }

        setLoading(true);
        try {
            const credential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            const user = credential.user;

            await updateProfile(user, { displayName: formData.name });
            await sendEmailVerification(user, {
                url: window.location.origin + '/driver/login',
                handleCodeInApp: false,
            });

            await setDoc(doc(db, 'drivers', user.uid), {
                uid: user.uid,
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                city: formData.city,
                country: formData.country,
                vehicleType: formData.vehicleType,
                vehicleMake: formData.vehicleMake,
                vehicleReg: formData.vehicleReg,
                vehicleYear: formData.vehicleYear,
                licenceNumber: formData.licenceNumber,
                profilePhoto: profilePhoto || '',
                status: 'pending',
                isOnline: false,
                rating: 5.0,
                totalRides: 0,
                earnings: 0,
                todayEarnings: 0,
                weekEarnings: 0,
                createdAt: serverTimestamp(),
            });

            await signOut(auth);
            setSuccess('Registration successful! Please check your email to verify your account. Once verified, our team will review your application within 24–48 hours.');
        } catch (err) {
            setError(firebaseErrorMessage(err.code));
        }
        setLoading(false);
    };

    const inputClass = 'w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm';
    const labelClass = 'block text-xs text-gray-400 mb-1.5 font-medium';

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
                        onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
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

                {/* Error / Success messages */}
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
                {success && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-4">
                        <p className="text-green-400 text-sm">{success}</p>
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
                {mode === 'register' && !success && (
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
