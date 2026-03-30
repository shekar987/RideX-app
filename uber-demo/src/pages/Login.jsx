import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
    const navigate = useNavigate();
    const { login, resetPassword } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resetSent, setResetSent] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);

    const handleLogin = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
            setError('Please enter your email and password.');
            return;
        }
        setLoading(true);
        setError('');

        const result = await login(trimmedEmail, password);
        setLoading(false);

        if (result.success) {
            navigate('/book');
            return;
        }

        if (result.locked) {
            const secsLeft = Math.ceil((result.lockedUntil - Date.now()) / 1000);
            setLockoutSeconds(secsLeft);
            setError(
                `Too many failed attempts. Please wait ${Math.ceil(secsLeft / 60)} minute${secsLeft > 60 ? 's' : ''} before trying again.`
            );
            return;
        }

        const attemptsMsg = result.attemptsLeft > 0
            ? ` ${result.attemptsLeft} attempt${result.attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`
            : '';
        setError((result.error || 'Login failed.') + attemptsMsg);
    };

    const handleReset = async () => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Enter your email address above, then click forgot password.');
            return;
        }
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
                <h2 className="text-2xl font-black mb-1">Welcome back</h2>
                <p className="text-gray-500 text-sm mb-6">Log in to your account</p>

                {/* Lockout banner */}
                {isLocked && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                        <span className="text-orange-400 mt-0.5">🔒</span>
                        <p className="text-orange-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Standard error */}
                {error && !isLocked && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Password reset confirmation */}
                {resetSent && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4">
                        <p className="text-green-400 text-sm">Reset link sent — check your inbox.</p>
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-xs text-gray-500 mb-2">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        maxLength={254}
                        autoComplete="email"
                        disabled={isLocked}
                        className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm disabled:opacity-50"
                    />
                </div>

                <div className="mb-2">
                    <label className="block text-xs text-gray-500 mb-2">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isLocked && handleLogin()}
                        placeholder="Enter your password"
                        maxLength={128}
                        autoComplete="current-password"
                        disabled={isLocked}
                        className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm disabled:opacity-50"
                    />
                </div>

                {/* Forgot password */}
                <div className="flex justify-end mb-6">
                    <button
                        onClick={handleReset}
                        type="button"
                        className="text-xs text-yellow-400 hover:underline"
                    >
                        Forgot password?
                    </button>
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading || isLocked}
                    className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? 'Logging in…' : isLocked ? 'Account locked' : 'Log In'}
                </button>

                <p className="text-center text-gray-500 text-sm mt-4">
                    Don't have an account?{' '}
                    <span
                        onClick={() => navigate('/register')}
                        className="text-yellow-400 cursor-pointer hover:underline"
                    >
                        Sign up
                    </span>
                </p>
            </div>
        </div>
    );
}

export default Login;
