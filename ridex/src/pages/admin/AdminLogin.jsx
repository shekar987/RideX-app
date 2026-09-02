import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { isAdminUser } from '../../utils/admin';
import { checkLockout, recordFailedAttempt, clearAttemptData } from '../../utils/loginAttempts';

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const AUTH_TIMEOUT_MS = 5000;

const CREDENTIAL_ERROR_CODES = ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-email'];

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
  const { state } = useLocation();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(true);
  const [error,    setError]    = useState('');
  const [lockSecs, setLockSecs] = useState(0);
  const submittingRef = useRef(false);

  const destination = state?.from?.pathname || '/admin/dashboard';

  // Redirect to dashboard if already logged in as admin. The auth listener owns
  // the redirect — handleLogin never navigates itself (no double history entry).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setChecking(false); }, AUTH_TIMEOUT_MS);
    const unsub = onAuthStateChanged(auth, async user => {
      const ok = await isAdminUser(user);
      if (cancelled) return;
      if (ok) navigate(destination, { replace: true });
      else setChecking(false);
    });
    return () => { cancelled = true; clearTimeout(timer); unsub(); };
  }, [navigate, destination]);

  // Lockout countdown
  useEffect(() => {
    if (lockSecs <= 0) return undefined;
    const t = setInterval(() => setLockSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockSecs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async e => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) { setError('Please enter your email and password.'); return; }

    const lock = checkLockout(trimmed);
    if (lock.locked) {
      setLockSecs(lock.secondsLeft);
      setError(`Too many failed attempts. Please wait ${Math.ceil(lock.secondsLeft / 60)} minute(s).`);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, trimmed, password);
      clearAttemptData(trimmed);

      // Deny anyone who is not the configured admin
      const ok = await isAdminUser(credential.user);
      if (!ok) {
        try { await signOut(auth); } catch (_) { /* nothing more we can do */ }
        setError('Access denied. Admin credentials required.');
      }
      // On success the onAuthStateChanged listener above performs the redirect.
    } catch (err) {
      const code = err?.code;
      if (CREDENTIAL_ERROR_CODES.includes(code)) {
        const r = recordFailedAttempt(trimmed);
        if (r.locked) {
          setLockSecs(Math.ceil((r.lockedUntil - Date.now()) / 1000));
          setError('Too many failed attempts. Account locked for 15 minutes.');
        } else {
          setError(`Invalid email or password. ${r.attemptsLeft} attempt${r.attemptsLeft !== 1 ? 's' : ''} remaining.`);
        }
      } else if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your connection and try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen min-h-dvh bg-black flex items-center justify-center" role="status" aria-label="Checking sign-in">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isLocked = lockSecs > 0;

  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col pt-safe">

      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Back to home"
          className={`flex items-center gap-2 text-gray-500 hover:text-white transition text-sm px-2 py-2 -ml-2 ${ring} rounded`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </button>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12 pb-safe">
        <div className="w-full max-w-sm">

          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-3" aria-hidden="true">
              <span className="text-black font-black text-2xl">R</span>
            </div>
            <h1 className="font-black text-2xl">RideX Admin</h1>
            <p className="text-gray-500 text-sm mt-1">Authorised access only</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
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
                  disabled={isLocked}
                  className={`w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white text-base
                    focus:outline-none focus:border-yellow-400 transition disabled:opacity-50 ${ring}`}
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
                    disabled={isLocked}
                    className={`w-full bg-black border border-gray-800 rounded-xl px-4 py-3 pr-12 text-white text-base
                      focus:outline-none focus:border-yellow-400 transition disabled:opacity-50 ${ring}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
                  >
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || isLocked}
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
                ) : isLocked ? `Locked (${Math.ceil(lockSecs / 60)} min)` : 'Sign In'}
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
