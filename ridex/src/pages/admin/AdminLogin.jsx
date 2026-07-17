import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(true);
  const [error,    setError]    = useState('');

  // Redirect to dashboard if already logged in as admin
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user && ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [navigate]);

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

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      <div className="px-4 pt-4">
        <button
          onClick={() => navigate('/')}
          aria-label="Back to home"
          className={`flex items-center gap-2 text-gray-500 hover:text-white transition text-sm ${ring} rounded`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </button>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-3" aria-hidden="true">
              <span className="text-black font-black text-2xl">R</span>
            </div>
            <h1 className="font-black text-2xl">RideX Admin</h1>
            <p className="text-gray-500 text-sm mt-1">Authorised access only</p>
          </div>

          {!ADMIN_EMAIL && (
            <div role="status" className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm rounded-xl px-4 py-3 mb-4">
              <p className="font-bold mb-0.5">Setup required</p>
              <p className="text-xs text-yellow-300/80">
                Add <code className="bg-yellow-400/10 px-1 rounded">REACT_APP_ADMIN_EMAIL</code> to your{' '}
                <code className="bg-yellow-400/10 px-1 rounded">.env.local</code> file and restart the dev server.
              </p>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <form onSubmit={handleLogin} noValidate className="space-y-4">

              {/* Live region for auth feedback */}
              <div aria-live="polite" aria-atomic="true">
                {error && (
                  <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3 mb-2">
                    {error}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="admin-email" className="text-gray-400 text-xs font-medium block mb-1.5">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@ridex.com"
                  autoComplete="email"
                  maxLength={254}
                  className={`w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-sm
                    focus:outline-none focus:border-yellow-400 transition ${ring}`}
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="text-gray-400 text-xs font-medium block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    autoComplete="current-password"
                    maxLength={128}
                    className={`w-full bg-black border border-gray-800 rounded-xl px-4 py-3 pr-11 text-white text-sm
                      focus:outline-none focus:border-yellow-400 transition ${ring}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
                  >
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !ADMIN_EMAIL}
                className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition
                  disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${ring} ${ringOffset}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
      </main>
    </div>
  );
}
