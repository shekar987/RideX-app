import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Register() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async () => {
        if (!name || !email || !password) return;
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await register(name, email, password);
            navigate('/book');
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                setError('Email already in use. Please log in instead.');
            } else {
                setError('Something went wrong. Please try again.');
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
                        placeholder="Min. 6 characters"
                        className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
                    />
                </div>

                <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                >
                    {loading ? 'Creating account...' : 'Create Account'}
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
            </div>
        </div>
    );
}

export default Register;