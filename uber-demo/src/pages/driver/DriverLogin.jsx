import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    reload,
} from 'firebase/auth';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';

const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Luxury'];

const EMPTY_REGISTER = {
    name: '',
    email: '',
    password: '',
    phone: '',
    vehicleType: 'Sedan',
    vehicleReg: '',
    licence: null,
};

const EMPTY_LOGIN = { email: '', password: '' };

export default function DriverLogin() {
    const [tab, setTab] = useState('login'); // 'login' | 'register'
    const navigate = useNavigate();

    // ── Register state ────────────────────────────────────────────────────────
    const [regForm, setRegForm]       = useState(EMPTY_REGISTER);
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError]     = useState('');
    const [regSuccess, setRegSuccess] = useState(false);

    // ── Login state ───────────────────────────────────────────────────────────
    const [loginForm, setLoginForm]         = useState(EMPTY_LOGIN);
    const [loginLoading, setLoginLoading]   = useState(false);
    const [loginError, setLoginError]       = useState('');
    const [loginStatus, setLoginStatus]     = useState(''); // 'pending' | 'rejected' | 'unverified'
    const [unverifiedUser, setUnverifiedUser] = useState(null);
    const [resendCooldown, setResendCooldown] = useState(false);

    // ── Helpers ───────────────────────────────────────────────────────────────
    function mapAuthError(code) {
        switch (code) {
            case 'auth/email-already-in-use':    return 'An account with this email already exists.';
            case 'auth/invalid-email':           return 'Invalid email address.';
            case 'auth/weak-password':           return 'Password must be at least 6 characters.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':      return 'Invalid email or password.';
            case 'auth/too-many-requests':       return 'Too many attempts. Please try again later.';
            default:                             return 'Something went wrong. Please try again.';
        }
    }

    // ── Register handler ──────────────────────────────────────────────────────
    async function handleRegister(e) {
        e.preventDefault();
        setRegError('');

        if (regForm.password.length < 6) {
            setRegError('Password must be at least 6 characters.');
            return;
        }
        if (!regForm.vehicleReg.trim()) {
            setRegError('Vehicle registration number is required.');
            return;
        }

        setRegLoading(true);
        try {
            const credential = await createUserWithEmailAndPassword(
                auth,
                regForm.email,
                regForm.password
            );
            const user = credential.user;

            await sendEmailVerification(user);

            await addDoc(collection(db, 'drivers'), {
                uid:         user.uid,
                name:        regForm.name.trim(),
                email:       regForm.email.trim().toLowerCase(),
                phone:       regForm.phone.trim(),
                vehicleType: regForm.vehicleType,
                vehicleReg:  regForm.vehicleReg.trim().toUpperCase(),
                status:      'pending',
                rating:      5.0,
                totalRides:  0,
                earnings:    0,
                isOnline:    false,
                createdAt:   serverTimestamp(),
            });

            setRegSuccess(true);
            setRegForm(EMPTY_REGISTER);
        } catch (err) {
            setRegError(mapAuthError(err.code));
        } finally {
            setRegLoading(false);
        }
    }

    // ── Login handler ─────────────────────────────────────────────────────────
    async function handleLogin(e) {
        e.preventDefault();
        setLoginError('');
        setLoginStatus('');
        setUnverifiedUser(null);

        setLoginLoading(true);
        try {
            const credential = await signInWithEmailAndPassword(
                auth,
                loginForm.email,
                loginForm.password
            );
            const user = credential.user;

            // Reload to get latest emailVerified flag
            await reload(user);

            if (!user.emailVerified) {
                setLoginStatus('unverified');
                setUnverifiedUser(user);
                setLoginLoading(false);
                return;
            }

            // Check driver document
            const q = query(
                collection(db, 'drivers'),
                where('uid', '==', user.uid)
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                setLoginError('No driver account found. Please register first.');
                setLoginLoading(false);
                return;
            }

            const driverData = snap.docs[0].data();

            if (driverData.status === 'pending') {
                setLoginStatus('pending');
            } else if (driverData.status === 'rejected') {
                setLoginStatus('rejected');
            } else if (driverData.status === 'approved') {
                navigate('/driver/dashboard');
            } else {
                setLoginError('Unknown account status. Please contact support.');
            }
        } catch (err) {
            setLoginError(mapAuthError(err.code));
        } finally {
            setLoginLoading(false);
        }
    }

    async function handleResendVerification() {
        if (!unverifiedUser || resendCooldown) return;
        try {
            await sendEmailVerification(unverifiedUser);
            setResendCooldown(true);
            setTimeout(() => setResendCooldown(false), 60_000);
        } catch {
            // ignore
        }
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* Back to homepage */}
            <div className="p-4">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to RideX
                </Link>
            </div>

            <div className="flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    {/* Role tabs */}
                    <div className="flex w-full mb-6 border-b border-gray-800">
                        <button
                            onClick={() => navigate('/login?role=customer')}
                            className="flex-1 py-2.5 text-sm font-bold transition border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-300"
                        >
                            Customer
                        </button>
                        <button
                            className="flex-1 py-2.5 text-sm font-bold transition border-b-2 -mb-px border-yellow-400 text-white"
                        >
                            Driver
                        </button>
                    </div>

                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center mb-3">
                            <span className="text-black font-black text-2xl">R</span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tight">
                            Ride<span className="text-yellow-400">X</span>
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Driver Portal</p>
                    </div>

                    {/* Tab switcher */}
                    <div className="flex bg-gray-900 border border-gray-800 rounded-2xl p-1 mb-6">
                        {['login', 'register'].map((t) => (
                            <button
                                key={t}
                                onClick={() => {
                                    setTab(t);
                                    setLoginError('');
                                    setLoginStatus('');
                                    setRegError('');
                                    setRegSuccess(false);
                                    setUnverifiedUser(null);
                                }}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition ${
                                    tab === t
                                        ? 'bg-yellow-400 text-black'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {t === 'login' ? 'Sign In' : 'Register'}
                            </button>
                        ))}
                    </div>

                    {/* ── LOGIN FORM ─────────────────────────────────────────── */}
                    {tab === 'login' && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                            {/* Role badge */}
                            <div className="inline-flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1 mb-4">
                                <span className="text-xs">🎡</span>
                                <span className="text-xs text-gray-300 font-medium">Signing in as Driver</span>
                            </div>
                            <h2 className="text-lg font-black mb-5">Welcome back, Driver</h2>

                            {/* Status banners */}
                            {loginStatus === 'unverified' && (
                                <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4 mb-4">
                                    <p className="text-yellow-400 text-sm font-bold mb-1">Email not verified</p>
                                    <p className="text-gray-300 text-xs mb-3">
                                        Please check your inbox and click the verification link before signing in.
                                    </p>
                                    <button
                                        onClick={handleResendVerification}
                                        disabled={resendCooldown}
                                        className="text-xs font-bold text-yellow-400 hover:text-yellow-300 disabled:opacity-50 transition"
                                    >
                                        {resendCooldown ? 'Email sent — check your inbox' : 'Resend verification email'}
                                    </button>
                                </div>
                            )}
                            {loginStatus === 'pending' && (
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-4">
                                    <p className="text-blue-400 text-sm font-bold mb-1">Application under review</p>
                                    <p className="text-gray-300 text-xs">
                                        Your account is pending admin approval. We'll notify you once reviewed.
                                    </p>
                                </div>
                            )}
                            {loginStatus === 'rejected' && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                                    <p className="text-red-400 text-sm font-bold mb-1">Application rejected</p>
                                    <p className="text-gray-300 text-xs">
                                        Your application was rejected. Please contact support at support@ridex.app
                                    </p>
                                </div>
                            )}
                            {loginError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                                    <p className="text-red-400 text-sm">{loginError}</p>
                                </div>
                            )}

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={loginForm.email}
                                        onChange={(e) => setLoginForm(f => ({ ...f, email: e.target.value }))}
                                        placeholder="driver@example.com"
                                        className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        required
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                                        placeholder="••••••••"
                                        className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loginLoading}
                                    className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed transition text-sm"
                                >
                                    {loginLoading ? 'Signing in…' : 'Sign In'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* ── REGISTER FORM ──────────────────────────────────────── */}
                    {tab === 'register' && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                            {/* Role badge */}
                            <div className="inline-flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1 mb-4">
                                <span className="text-xs">🎡</span>
                                <span className="text-xs text-gray-300 font-medium">Registering as Driver</span>
                            </div>
                            <h2 className="text-lg font-black mb-5">Become a Driver</h2>

                            {regSuccess ? (
                                <div className="text-center py-4">
                                    <div className="w-16 h-16 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <p className="text-white font-bold text-base mb-2">Application submitted!</p>
                                    <p className="text-gray-400 text-sm">
                                        Registration submitted! Please verify your email and wait for admin approval.
                                    </p>
                                    <button
                                        onClick={() => { setRegSuccess(false); setTab('login'); }}
                                        className="mt-5 text-yellow-400 text-sm font-bold hover:text-yellow-300 transition"
                                    >
                                        Back to Sign In
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {regError && (
                                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                                            <p className="text-red-400 text-sm">{regError}</p>
                                        </div>
                                    )}
                                    <form onSubmit={handleRegister} className="space-y-4">
                                        {/* Full Name */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Full Name
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={regForm.name}
                                                onChange={(e) => setRegForm(f => ({ ...f, name: e.target.value }))}
                                                placeholder="John Smith"
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                            />
                                        </div>
                                        {/* Email */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Email
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={regForm.email}
                                                onChange={(e) => setRegForm(f => ({ ...f, email: e.target.value }))}
                                                placeholder="driver@example.com"
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                            />
                                        </div>
                                        {/* Password */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Password
                                            </label>
                                            <input
                                                type="password"
                                                required
                                                minLength={6}
                                                value={regForm.password}
                                                onChange={(e) => setRegForm(f => ({ ...f, password: e.target.value }))}
                                                placeholder="Minimum 6 characters"
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                            />
                                        </div>
                                        {/* Phone */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Phone Number
                                            </label>
                                            <input
                                                type="tel"
                                                required
                                                value={regForm.phone}
                                                onChange={(e) => setRegForm(f => ({ ...f, phone: e.target.value }))}
                                                placeholder="+1 555 000 0000"
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm"
                                            />
                                        </div>
                                        {/* Vehicle Type */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Vehicle Type
                                            </label>
                                            <select
                                                value={regForm.vehicleType}
                                                onChange={(e) => setRegForm(f => ({ ...f, vehicleType: e.target.value }))}
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition text-sm"
                                            >
                                                {VEHICLE_TYPES.map(v => (
                                                    <option key={v} value={v}>{v}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {/* Vehicle Registration */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Vehicle Registration Number
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={regForm.vehicleReg}
                                                onChange={(e) => setRegForm(f => ({ ...f, vehicleReg: e.target.value }))}
                                                placeholder="e.g. AB12 CDE"
                                                className="w-full bg-black border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-400 transition text-sm uppercase"
                                            />
                                        </div>
                                        {/* Driving Licence */}
                                        <div>
                                            <label className="block text-xs text-gray-400 font-bold mb-1.5 uppercase tracking-wider">
                                                Driving Licence
                                            </label>
                                            <label className="flex items-center gap-3 w-full bg-black border border-gray-700 border-dashed rounded-xl px-4 py-3 cursor-pointer hover:border-yellow-400 transition">
                                                <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                <span className="text-sm text-gray-400 truncate">
                                                    {regForm.licence ? regForm.licence.name : 'Upload licence image or PDF'}
                                                </span>
                                                <input
                                                    type="file"
                                                    accept="image/*,application/pdf"
                                                    className="hidden"
                                                    onChange={(e) => setRegForm(f => ({ ...f, licence: e.target.files[0] || null }))}
                                                />
                                            </label>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={regLoading}
                                            className="w-full py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed transition text-sm mt-2"
                                        >
                                            {regLoading ? 'Submitting application…' : 'Submit Application'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    )}

                    <p className="text-center text-gray-600 text-xs mt-6">
                        By continuing you agree to RideX's driver terms of service.
                    </p>
                </div>
            </div>
        </div>
    );
}
