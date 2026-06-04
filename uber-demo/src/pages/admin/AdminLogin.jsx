import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../firebase';

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Deny anyone who is not the configured admin email
      if (!ADMIN_EMAIL || credential.user.email !== ADMIN_EMAIL) {
        await signOut(auth);
        setError('Access denied. Admin credentials required.');
        setLoading(false);
        return;
      }

      navigate('/admin/dashboard');
    } catch (err) {
      const credentialError =
        err.code === 'auth/wrong-password'     ||
        err.code === 'auth/user-not-found'     ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-email';

      setError(credentialError ? 'Invalid email or password.' : 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-black font-black text-2xl">R</span>
          </div>
          <h1 className="text-white font-black text-2xl">RideX Admin</h1>
          <p className="text-gray-500 text-sm mt-1">Authorised access only</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-4" noValidate>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@ridex.com"
                autoComplete="email"
                className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          RideX Admin Portal · For authorised personnel only
        </p>
      </div>
    </div>
  );
}
