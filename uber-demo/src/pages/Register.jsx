// Register.jsx — Customer registration page

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAME_RE              = /^[\p{L}\s'-]+$/u;
const EMAIL_RE             = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_LETTER_RE   = /[a-zA-Z]/;
const PASSWORD_SYMBOL_RE   = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

function validatePassword(pw) {
    if (pw.length < 8)                   return 'Password must be at least 8 characters.';
    if (!PASSWORD_LETTER_RE.test(pw))    return 'Password must include at least one letter.';
    if (!PASSWORD_SYMBOL_RE.test(pw))    return 'Password must include at least one number or symbol.';
    return null;
}

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
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

function FormField({ id, label, type, value, onChange, placeholder, autoComplete, maxLength, hint, rightElement }) {
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
                    className={`w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700
                        focus:outline-none focus:border-yellow-400 transition text-sm
                        ${rightElement ? 'pr-11' : ''}`}
                />
                {rightElement && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {rightElement}
                    </div>
                )}
            </div>
            {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
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

// ── Success state shown after account creation ────────────────────────────────
function VerificationSent({ email, onGoToLogin }) {
    return (
        <div className="text-center py-4">
            {/* SVG envelope instead of 📧 emoji */}
            <div className="w-16 h-16 bg-yellow-400/10 border border-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            </div>

            <h1 className="text-2xl font-black mb-2">Check your email</h1>
            <p className="text-gray-400 text-sm mb-2 leading-relaxed">
                We sent a verification link to
            </p>
            <p className="text-yellow-400 font-semibold text-sm mb-6 break-all">{email}</p>
            <p className="text-gray-500 text-xs mb-8 leading-relaxed">
                Click the link in the email to activate your account, then log in below.
            </p>

            <button
                onClick={onGoToLogin}
                className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition ${ring} ${ringOffset}`}
            >
                Go to Login
            </button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();

    const [name,         setName]         = useState('');
    const [email,        setEmail]        = useState('');
    const [password,     setPassword]     = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error,        setError]        = useState('');
    const [loading,      setLoading]      = useState(false);
    const [verified,     setVerified]     = useState(false);

    const handleRegister = async (e) => {
        e?.preventDefault();
        const trimmedName  = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedName || !trimmedEmail || !password) { setError('Please fill in all fields.'); return; }
        if (trimmedName.length < 2)          { setError('Name must be at least 2 characters.'); return; }
        if (!NAME_RE.test(trimmedName))      { setError('Name may only contain letters, spaces, hyphens, and apostrophes.'); return; }
        if (!EMAIL_RE.test(trimmedEmail))    { setError('Please enter a valid email address.'); return; }

        const pwError = validatePassword(password);
        if (pwError) { setError(pwError); return; }

        setLoading(true);
        setError('');

        try {
            await register(trimmedName, trimmedEmail, password);
            setVerified(true);
        } catch (err) {
            setError(
                err.code === 'auth/email-already-in-use'
                    ? 'An account with this email already exists. Try logging in instead.'
                    : 'Registration failed. Please try again.'
            );
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12">
            <AuthPageHeader />

            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md">
                {verified ? (
                    <VerificationSent email={email} onGoToLogin={() => navigate('/login')} />
                ) : (
                    <>
                        <h1 className="text-2xl font-black mb-1">Create account</h1>
                        <p className="text-gray-500 text-sm mb-6">Join RideX — it's free</p>

                        <div aria-live="polite" aria-atomic="true">
                            {error && (
                                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleRegister} noValidate className="space-y-4">
                            <FormField
                                id="reg-name"
                                label="Full name"
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Your full name"
                                autoComplete="name"
                                maxLength={100}
                            />

                            <FormField
                                id="reg-email"
                                label="Email address"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                autoComplete="email"
                                maxLength={254}
                            />

                            <FormField
                                id="reg-password"
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Min. 8 characters"
                                autoComplete="new-password"
                                maxLength={128}
                                hint="At least 8 characters, one letter, and one number or symbol."
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

                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300
                                    active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed
                                    flex items-center justify-center ${ring} ${ringOffset}`}
                            >
                                {loading && <Spinner />}
                                {loading ? 'Creating account…' : 'Create Account'}
                            </button>
                        </form>

                        <p className="text-center text-gray-500 text-sm mt-5">
                            Already have an account?{' '}
                            <button
                                onClick={() => navigate('/login')}
                                className={`text-yellow-400 font-semibold hover:underline ${ring} rounded`}
                            >
                                Log in
                            </button>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

export default Register;
