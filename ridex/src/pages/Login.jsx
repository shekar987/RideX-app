// Login.jsx — Customer login page

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { signOut, sendEmailVerification } from 'firebase/auth';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// ── Shared atoms ──────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}

function EyeIcon({ open }) {
    return open ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
    );
}

function FormField({ id, label, type, value, onChange, placeholder, autoComplete, maxLength, disabled, rightElement }) {
    return (
        <div>
            <label htmlFor={id} className="block text-xs text-gray-400 font-medium mb-2">
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    maxLength={maxLength}
                    disabled={disabled}
                    className={`w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700
                        focus:outline-none focus:border-yellow-400 transition text-sm disabled:opacity-50
                        ${rightElement ? 'pr-11' : ''}`}
                />
                {rightElement && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {rightElement}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Page header: back button + brand ─────────────────────────────────────────
function AuthPageHeader() {
    const navigate = useNavigate();
    return (
        <div className="w-full max-w-md mb-6">
            <button
                onClick={() => navigate('/')}
                aria-label="Back to home"
                className={`flex items-center gap-1.5 text-gray-400 hover:text-white transition text-sm mb-6 ${ring} rounded`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back
            </button>

            <a href="/" aria-label="RideX — home" className={`flex items-center gap-2 w-fit rounded-lg ${ring}`}>
                <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
                    <span className="text-black font-black">R</span>
                </div>
                <span className="text-2xl font-black">RideX</span>
            </a>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
function Login() {
    const navigate = useNavigate();
    const { login, resetPassword } = useAuth();

    const [email,            setEmail]            = useState('');
    const [password,         setPassword]         = useState('');
    const [showPassword,     setShowPassword]     = useState(false);
    const [error,            setError]            = useState('');
    const [loading,          setLoading]          = useState(false);
    const [resetSent,        setResetSent]        = useState(false);
    const [lockoutSeconds,   setLockoutSeconds]   = useState(0);
    const [showResend,       setShowResend]       = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    // Holds the signed-in-but-unverified User so the resend handler can call
    // sendEmailVerification after we've signed out of the session.
    const pendingUserRef = useRef(null);

    const handleLogin = async (e) => {
        e?.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) { setError('Please enter your email and password.'); return; }

        setLoading(true);
        setError('');
        setShowResend(false);
        setVerificationSent(false);

        const result = await login(trimmedEmail, password);
        setLoading(false);

        if (result.success) {
            const currentUser = auth.currentUser;

            if (currentUser) {
                await currentUser.reload();
                if (!currentUser.emailVerified) {
                    pendingUserRef.current = currentUser;
                    await signOut(auth);
                    setShowResend(true);
                    setError('Your email is not verified. Check your inbox and click the verification link.');
                    return;
                }
            } else if (!result.emailVerified) {
                setError('Your email is not verified. Check your inbox and click the verification link.');
                return;
            }

            navigate('/book');
            return;
        }

        if (result.locked) {
            const secsLeft = Math.ceil((result.lockedUntil - Date.now()) / 1000);
            setLockoutSeconds(secsLeft);
            setError(`Too many failed attempts. Please wait ${Math.ceil(secsLeft / 60)} minute${secsLeft > 60 ? 's' : ''} before trying again.`);
            return;
        }

        const attemptsMsg = result.attemptsLeft > 0
            ? ` ${result.attemptsLeft} attempt${result.attemptsLeft !== 1 ? 's' : ''} remaining.`
            : '';
        setError((result.error || 'Login failed.') + attemptsMsg);
    };

    const handleResend = async () => {
        const user = pendingUserRef.current;
        if (!user) { setError('Please log in again to resend the verification email.'); return; }
        try {
            await sendEmailVerification(user);
            setVerificationSent(true);
            setError('');
            setShowResend(false);
        } catch {
            setError('Could not resend. Please try logging in again.');
            setShowResend(false);
        }
    };

    const handleReset = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) { setError('Enter your email address first, then click forgot password.'); return; }
        try {
            await resetPassword(trimmedEmail);
            setResetSent(true);
            setError('');
        } catch {
            setError('Could not send reset email. Check the address and try again.');
        }
    };

    const isLocked = lockoutSeconds > 0;

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12">
            <AuthPageHeader />

            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md">
                {/* Page heading — h1 since this is the primary content */}
                <h1 className="text-2xl font-black mb-1">Welcome back</h1>
                <p className="text-gray-500 text-sm mb-6">Log in to your RideX account</p>

                {/* Live region so screen readers announce status changes */}
                <div aria-live="polite" aria-atomic="true" className="space-y-3 mb-4">
                    {isLocked && (
                        <div role="alert" className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
                            <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <p className="text-orange-400 text-sm">{error}</p>
                        </div>
                    )}

                    {error && !isLocked && (
                        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <p className="text-red-400 text-sm">{error}</p>
                            {showResend && (
                                <button onClick={handleResend} type="button" className={`mt-2 text-xs text-yellow-400 hover:underline ${ring} rounded`}>
                                    Resend verification email
                                </button>
                            )}
                        </div>
                    )}

                    {verificationSent && (
                        <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
                            <p className="text-green-400 text-sm">Verification email sent — check your inbox.</p>
                        </div>
                    )}

                    {resetSent && (
                        <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
                            <p className="text-green-400 text-sm">Password reset link sent — check your inbox.</p>
                        </div>
                    )}
                </div>

                <form onSubmit={handleLogin} noValidate className="space-y-4">
                    <FormField
                        id="login-email"
                        label="Email address"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        autoComplete="email"
                        maxLength={254}
                        disabled={isLocked}
                    />

                    <FormField
                        id="login-password"
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        maxLength={128}
                        disabled={isLocked}
                        rightElement={
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className={`text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
                            >
                                <EyeIcon open={showPassword} />
                            </button>
                        }
                    />

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleReset}
                            className={`text-xs text-yellow-400 hover:underline ${ring} rounded`}
                        >
                            Forgot password?
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || isLocked}
                        className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300
                            active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed
                            flex items-center justify-center ${ring} ${ringOffset}`}
                    >
                        {loading && <Spinner />}
                        {loading ? 'Logging in…' : isLocked ? 'Account locked' : 'Log In'}
                    </button>
                </form>

                <p className="text-center text-gray-500 text-sm mt-5">
                    Don't have an account?{' '}
                    <button
                        onClick={() => navigate('/register')}
                        className={`text-yellow-400 font-semibold hover:underline ${ring} rounded`}
                    >
                        Sign up free
                    </button>
                </p>
            </div>
        </div>
    );
}

export default Login;
