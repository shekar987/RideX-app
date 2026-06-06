import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Strip characters that have no place in a person's name.
// Allows letters (any script), spaces, hyphens, apostrophes.
const NAME_RE = /^[\p{L}\s'-]+$/u;

// Email format
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password strength: min 8 chars, at least one letter, at least one digit or symbol
const PASSWORD_LETTER_RE = /[a-zA-Z]/;
const PASSWORD_DIGIT_OR_SYMBOL_RE = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

function validatePassword(pw) {
    if (pw.length < 8)                      return 'Password must be at least 8 characters.';
    if (!PASSWORD_LETTER_RE.test(pw))       return 'Password must include at least one letter.';
    if (!PASSWORD_DIGIT_OR_SYMBOL_RE.test(pw)) return 'Password must include at least one number or symbol.';
    return null;
}

function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [verified, setVerified] = useState(false);

    const handleRegister = async () => {
        const trimmedName  = name.trim();
        const trimmedEmail = email.trim();

        // ── Field-level validation ────────────────────────────────────────────
        if (!trimmedName || !trimmedEmail || !password) {
            setError('Please fill in all fields.');
            return;
        }
        if (trimmedName.length < 2) {
            setError('Name must be at least 2 characters.');
            return;
        }
        if (!NAME_RE.test(trimmedName)) {
            setError('Name may only contain letters, spaces, hyphens, and apostrophes.');
            return;
        }
        if (!EMAIL_RE.test(trimmedEmail)) {
            setError('Please enter a valid email address.');
            return;
        }
        const pwError = validatePassword(password);
        if (pwError) {
            setError(pwError);
            return;
        }

        setLoading(true);
        setError('');

        try {
            await register(trimmedName, trimmedEmail, password);
            setVerified(true);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                setError('Email already in use. Please log in instead.');
            } else {
                // Never surface internal Firebase error codes to the user
                setError('Registration failed. Please try again.');
            }
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
            <button
                onClick={() => navigate('/')}
                className="absolute top-6 left-6 text-gray-400 hover:text-white transition"
            >
                ← Back
            </button>

            <div className="flex items-center gap-2 mb-8">
                <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-black font-black">R</span>
                </div>
                <h1 className="text-2xl font-black">RideX</h1>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md">
                {verified ? (
                    <div className="text-center py-4">
                        <p className="text-4xl mb-4">📧</p>
                        <h2 className="text-2xl font-black mb-2">Check your email</h2>
                        <p className="text-gray-400 text-sm mb-6">
                            We sent a verification link to{' '}
                            <span className="text-yellow-400">{email}</span>.
                            Click it to activate your account before logging in.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition"
                        >
                            Go to Login
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="text-2xl font-black mb-1">Create account</h2>
                        <p className="text-gray-500 text-sm mb-6">Join RideX today — it's free</p>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-xs text-gray-500 mb-2">Full Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your full name"
                                maxLength={100}
                                autoComplete="name"
                                className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs text-gray-500 mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                maxLength={254}
                                autoComplete="email"
                                className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs text-gray-500 mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                                placeholder="Min. 8 characters"
                                maxLength={128}
                                autoComplete="new-password"
                                className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">
                                At least 8 characters including a letter and a number or symbol.
                            </p>
                        </div>

                        <button
                            onClick={handleRegister}
                            disabled={loading}
                            className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating account…' : 'Create Account'}
                        </button>

                        <p className="text-center text-gray-500 text-sm mt-4">
                            Already have an account?{' '}
                            <span
                                onClick={() => navigate('/login')}
                                className="text-yellow-400 cursor-pointer hover:underline"
                            >
                                Log in
                            </span>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

export default Register;
