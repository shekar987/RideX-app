// DriverLogin.jsx
// Full driver authentication page: login for existing drivers, registration for new applicants.
// Handles email verification, Firestore status checks, and pending/rejected/approved flows.

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { auth } from '../../firebase';
import { fetchJson, isAbortError } from '../../utils/net';

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRIES     = ['UK', 'USA', 'Canada', 'Australia', 'India', 'UAE', 'Other'];
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Luxury', 'Motorbike'];
const VEHICLE_YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i); // 2015–2026

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// Convert Firebase Auth error codes to user-friendly messages
function getLoginErrorMessage(err) {
  const map = {
    'auth/wrong-password':         'Incorrect password. Please try again.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/too-many-requests':      'Too many attempts. Please try again later.',
    'auth/invalid-credential':     'Invalid email or password. Please try again.',
    'auth/network-request-failed': 'Connection issue. Please check your internet and try again.',
    'unavailable':                 'Connection issue. Please check your internet and try again.',
  };
  if (err?.code && map[err.code]) return map[err.code];
  if (isAbortError(err)) return 'The server took too long to respond. Please try again.';
  // A thrown Error from our own checks carries the real reason — keep it
  if (err instanceof Error && err.message && !err.code) return err.message;
  return 'Something went wrong. Please try again.';
}

// Returns { label, color, width } for the password strength bar.
// Scores length AND character variety — "aaaaaaaaaa" is not "Strong".
function getPasswordStrength(password) {
  if (password.length === 0) return null;
  let score = 0;
  if (password.length >= 6)  score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password))       score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 1) return { label: 'Weak',   color: 'bg-red-500',    width: 'w-1/3' };
  if (score <= 3) return { label: 'Medium', color: 'bg-yellow-400', width: 'w-2/3' };
  return                 { label: 'Strong', color: 'bg-green-500',  width: 'w-full' };
}

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

// Password show/hide toggle with a full 44px tap target
function EyeButton({ open, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`p-2.5 text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
    >
      <EyeIcon open={open} />
    </button>
  );
}

// Text input with visible label properly associated via htmlFor/id.
// text-base (16px) — smaller inputs make iOS Safari zoom the page on focus.
function FormField({ id, label, type, value, onChange, placeholder, autoComplete, autoCapitalize, inputMode, maxLength, rightElement }) {
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
          autoCapitalize={autoCapitalize}
          inputMode={inputMode}
          maxLength={maxLength}
          className={`w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white
            placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-base ${ring}
            ${rightElement ? 'pr-12' : ''}`}
        />
        {rightElement && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
}

// Select/dropdown with visible label
function SelectField({ id, label, value, onChange, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 font-medium mb-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={`w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white
          focus:outline-none focus:border-yellow-400 transition text-base ${ring}`}
      >
        {children}
      </select>
    </div>
  );
}

// ── LoginForm ──────────────────────────────────────────────────────────────────

// Handles existing driver login: email + password, email verification check,
// Firestore status check (pending / rejected / approved), and password reset.
function LoginForm() {
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);

  const [loading, setLoading]               = useState(false);
  const [resetting, setResetting]           = useState(false);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState('');
  const [warning, setWarning]               = useState('');
  const [showResend, setShowResend]         = useState(false);
  const [resendMsg, setResendMsg]           = useState('');
  const [unverifiedUser, setUnverifiedUser] = useState(null);

  // Sends a password reset email; requires the email field to be filled first
  async function handleForgotPassword() {
    if (resetting) return;
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email first.'); return; }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setError('');
      setSuccess('Password reset email sent! Check your inbox.');
    } catch (err) {
      setError(err?.code === 'auth/too-many-requests'
        ? 'Too many reset requests — please wait a few minutes.'
        : 'Could not send reset email. Check the address and try again.');
    } finally {
      setResetting(false);
    }
  }

  // Resend verification email to the currently signed-in (but unverified) user
  async function handleResendVerification() {
    if (!unverifiedUser) return;
    try {
      await sendEmailVerification(unverifiedUser);
      setResendMsg('Email sent! Check your inbox.');
    } catch (err) {
      setResendMsg(err?.code === 'auth/too-many-requests'
        ? 'Too many requests — wait a few minutes and try again.'
        : 'Could not resend email. Please try again later.');
    }
  }

  // Steps: validate → sign in → reload → check verification → check Firestore status → navigate
  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError(''); setSuccess(''); setWarning('');
    setShowResend(false); setResendMsg('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
      if (!projectId) throw new Error('App configuration error — please contact support.');

      const result = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const user   = result.user;

      // Grab the ID token immediately after sign-in, before auth-state listeners fire
      // and before the Firestore SDK tries to reconnect. Using the token later is safe.
      const idToken = await user.getIdToken();

      // Reload to get a fresh emailVerified flag (non-fatal if it fails)
      try { await user.reload(); } catch {}

      if (!user.emailVerified) {
        setUnverifiedUser(user);
        try { await signOut(auth); } catch {}
        setError('Please verify your email before logging in. Check your inbox.');
        setShowResend(true);
        return;
      }

      // Fetch driver document via REST API. The Firestore SDK reports "client is offline"
      // after auth-state changes; fetch + token bypasses that entirely.
      const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;
      const { res: restRes, data: json } = await fetchJson(restUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (restRes.status === 404) {
        try { await signOut(auth); } catch {}
        setError('No driver account found. Please register first.');
        return;
      }
      if (!restRes.ok) {
        throw new Error(json?.error?.message || `Server error ${restRes.status}. Please try again.`);
      }

      const status = json?.fields?.status?.stringValue;

      if (status === 'pending') {
        try { await signOut(auth); } catch {}
        setWarning('Your account is pending admin approval. We will notify you within 24–48 hours.');
        return;
      }
      if (status === 'rejected') {
        try { await signOut(auth); } catch {}
        setError('Your application was rejected. Please contact support@ridex.com');
        return;
      }
      // Treat 'approved' or missing status (legacy accounts) as approved
      if (status === 'approved' || !status) {
        navigate('/driver/dashboard');
        return;
      }

      setError(`Unexpected account status: "${status}". Contact support@ridex.com`);
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">

      {/* Live region — screen readers announce status changes without focus move */}
      <div aria-live="polite" aria-atomic="true" className="space-y-2">
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
            {showResend && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className={`w-full py-2.5 min-h-[44px] bg-yellow-400/10 border border-yellow-400/30 text-yellow-400
                    text-sm font-semibold rounded-xl hover:bg-yellow-400/20 transition ${ring}`}
                >
                  Resend verification email
                </button>
                {resendMsg && (
                  <p className="text-green-400 text-xs text-center">{resendMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
        {warning && (
          <div role="status" className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <p className="text-yellow-400 text-sm">{warning}</p>
          </div>
        )}
        {success && (
          <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}
      </div>

      <FormField
        id="drv-login-email"
        label="Email address"
        type="email"
        inputMode="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="driver@example.com"
        autoComplete="email"
        maxLength={254}
      />

      <FormField
        id="drv-login-password"
        label="Password"
        type={showPw ? 'text' : 'password'}
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        maxLength={128}
        rightElement={<EyeButton open={showPw} onClick={() => setShowPw(v => !v)} label={showPw ? 'Hide password' : 'Show password'} />}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetting}
          className={`text-sm text-yellow-400 hover:underline px-2 py-2 -mr-2 disabled:opacity-60 ${ring} rounded`}
        >
          {resetting ? 'Sending…' : 'Forgot password?'}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300
          active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed
          flex items-center justify-center ${ring} ${ringOffset}`}
      >
        {loading && <Spinner />}
        {loading ? 'Signing in…' : 'Log In'}
      </button>
    </form>
  );
}

// ── RegisterForm ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', email: '', password: '', confirmPassword: '',
  phone: '', city: '', country: 'UK', vehicleType: 'Sedan',
  vehicleMake: '', vehicleReg: '', vehicleYear: '2020',
  licenceNumber: '', terms: false,
};

// Handles new driver registration: collects all required details, creates a Firebase
// Auth account, sends verification email, saves driver doc to Firestore with
// status: 'pending', then signs out so the user must verify before logging in.
function RegisterForm({ onSuccess }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPw, setShowPw]         = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  function setField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  const strength = getPasswordStrength(formData.password);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    // Trim everything first — "   " used to pass as a valid name / city
    const f = {
      ...formData,
      name:          formData.name.trim(),
      email:         formData.email.trim().toLowerCase(),
      phone:         formData.phone.trim(),
      city:          formData.city.trim(),
      vehicleMake:   formData.vehicleMake.trim(),
      vehicleReg:    formData.vehicleReg.trim().toUpperCase(),
      licenceNumber: formData.licenceNumber.trim().toUpperCase(),
    };

    if (
      !f.name || !f.email || !f.password ||
      !f.confirmPassword || !f.phone || !f.city ||
      !f.country || !f.vehicleType || !f.vehicleMake ||
      !f.vehicleReg || !f.vehicleYear || !f.licenceNumber
    ) {
      setError('Please fill in all fields before registering.');
      return;
    }
    if (f.password !== f.confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }
    if (f.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!EMAIL_RE.test(f.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!PHONE_RE.test(f.phone)) {
      setError('Please enter a valid phone number (digits, spaces, +, - only).');
      return;
    }
    if (!f.terms) {
      setError('Please agree to the Terms & Conditions to continue.');
      return;
    }

    setLoading(true);
    let createdUser = null;
    try {
      const result = await createUserWithEmailAndPassword(auth, f.email, f.password);
      const user   = result.user;
      createdUser  = user;

      try { await updateProfile(user, { displayName: f.name }); } catch {}

      // Non-fatal — don't block registration if verification email fails to send
      try {
        await sendEmailVerification(user, {
          url: window.location.origin + '/driver/login',
          handleCodeInApp: false,
        });
      } catch {}

      // Save driver document via REST API instead of the Firestore SDK.
      // The SDK's setDoc hangs after createUserWithEmailAndPassword because the
      // onAuthStateChanged listener fires mid-write and leaves the SDK in an
      // inconsistent auth state. Using fetch + the user's ID token bypasses that.
      const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
      if (!projectId) throw new Error('App configuration error — please contact support.');

      const idToken = await user.getIdToken();
      const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;

      const { res: restResponse, data: errData } = await fetchJson(restUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: {
            uid:           { stringValue: user.uid },
            name:          { stringValue: f.name },
            email:         { stringValue: f.email },
            phone:         { stringValue: f.phone },
            city:          { stringValue: f.city },
            country:       { stringValue: f.country },
            vehicleType:   { stringValue: f.vehicleType },
            vehicleMake:   { stringValue: f.vehicleMake },
            vehicleReg:    { stringValue: f.vehicleReg },
            vehicleYear:   { stringValue: f.vehicleYear },
            licenceNumber: { stringValue: f.licenceNumber },
            status:        { stringValue: 'pending' },
            isOnline:      { booleanValue: false },
            rating:        { doubleValue: 5.0 },
            totalRides:    { integerValue: '0' },
            earnings:      { doubleValue: 0 },
            todayEarnings: { doubleValue: 0 },
            weekEarnings:  { doubleValue: 0 },
            createdAt:     { timestampValue: new Date().toISOString() },
          },
        }),
      }, { timeoutMs: 15000 });

      if (!restResponse.ok) {
        throw new Error(errData?.error?.message || `Could not save your application (error ${restResponse.status}). Please try again.`);
      }

      // Sign out immediately — user must verify email before logging in
      try { await signOut(auth); } catch {}

      setFormData(EMPTY_FORM);
      onSuccess();

    } catch (err) {
      // If the Auth account was created but the profile write failed, remove the
      // account again — otherwise the applicant is stuck: registering says
      // "email already in use" and logging in says "no driver account found".
      if (createdUser) {
        try { await createdUser.delete(); } catch { try { await signOut(auth); } catch {} }
      }
      const msgs = {
        'auth/email-already-in-use':   'This email is already registered. Please login instead.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/invalid-email':          'Please enter a valid email address.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/too-many-requests':      'Too many attempts. Please try again later.',
      };
      setError(msgs[err?.code] || (isAbortError(err) ? 'The server took too long to respond. Please try again.' : `Registration failed: ${err?.message || 'unknown error'}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRegister} noValidate className="space-y-4">

      {/* Live region for registration feedback */}
      <div aria-live="polite" aria-atomic="true" className="space-y-2">
        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      <FormField
        id="reg-name"
        label="Full name"
        type="text"
        value={formData.name}
        onChange={e => setField('name', e.target.value)}
        placeholder="John Smith"
        autoComplete="name"
        maxLength={100}
      />

      <FormField
        id="reg-email"
        label="Email address"
        type="email"
        inputMode="email"
        value={formData.email}
        onChange={e => setField('email', e.target.value)}
        placeholder="driver@example.com"
        autoComplete="email"
        maxLength={254}
      />

      {/* Password + inline strength indicator */}
      <div className="space-y-1">
        <FormField
          id="reg-password"
          label="Password"
          type={showPw ? 'text' : 'password'}
          value={formData.password}
          onChange={e => setField('password', e.target.value)}
          placeholder="Min. 6 characters"
          autoComplete="new-password"
          maxLength={128}
          rightElement={<EyeButton open={showPw} onClick={() => setShowPw(v => !v)} label={showPw ? 'Hide password' : 'Show password'} />}
        />
        {strength && (
          <div aria-live="polite" className="pt-1">
            <div className="w-full bg-gray-800 rounded-full h-1.5" aria-hidden="true">
              <div className={`h-1.5 rounded-full transition-all ${strength.color} ${strength.width}`} />
            </div>
            <p className={`text-xs mt-1 ${
              strength.label === 'Weak'   ? 'text-red-400'    :
              strength.label === 'Medium' ? 'text-yellow-400' : 'text-green-400'
            }`}>{strength.label}</p>
          </div>
        )}
      </div>

      <FormField
        id="reg-confirm-password"
        label="Confirm password"
        type={showConfPw ? 'text' : 'password'}
        value={formData.confirmPassword}
        onChange={e => setField('confirmPassword', e.target.value)}
        placeholder="••••••••"
        autoComplete="new-password"
        maxLength={128}
        rightElement={<EyeButton open={showConfPw} onClick={() => setShowConfPw(v => !v)} label={showConfPw ? 'Hide confirm password' : 'Show confirm password'} />}
      />

      <FormField
        id="reg-phone"
        label="Phone number"
        type="tel"
        inputMode="tel"
        value={formData.phone}
        onChange={e => setField('phone', e.target.value)}
        placeholder="+44 7700 900000"
        autoComplete="tel"
        maxLength={20}
      />

      <FormField
        id="reg-city"
        label="City"
        type="text"
        value={formData.city}
        onChange={e => setField('city', e.target.value)}
        placeholder="London"
        autoComplete="address-level2"
        maxLength={100}
      />

      <SelectField
        id="reg-country"
        label="Country"
        value={formData.country}
        onChange={e => setField('country', e.target.value)}
      >
        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
      </SelectField>

      <SelectField
        id="reg-vehicle-type"
        label="Vehicle type"
        value={formData.vehicleType}
        onChange={e => setField('vehicleType', e.target.value)}
      >
        {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </SelectField>

      <FormField
        id="reg-vehicle-make"
        label="Vehicle make &amp; model"
        type="text"
        value={formData.vehicleMake}
        onChange={e => setField('vehicleMake', e.target.value)}
        placeholder="e.g. Toyota Camry"
        maxLength={100}
      />

      <FormField
        id="reg-vehicle-reg"
        label="Vehicle registration"
        type="text"
        value={formData.vehicleReg}
        onChange={e => setField('vehicleReg', e.target.value)}
        placeholder="AB12 CDE"
        autoCapitalize="characters"
        maxLength={20}
      />

      <SelectField
        id="reg-vehicle-year"
        label="Vehicle year"
        value={formData.vehicleYear}
        onChange={e => setField('vehicleYear', e.target.value)}
      >
        {VEHICLE_YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </SelectField>

      <FormField
        id="reg-licence"
        label="Driving licence number"
        type="text"
        value={formData.licenceNumber}
        onChange={e => setField('licenceNumber', e.target.value)}
        placeholder="SMITH901157AB9IJ"
        autoCapitalize="characters"
        maxLength={50}
      />

      {/* Terms checkbox — label wraps input so association is implicit.
          Legal pages open in a new tab so the half-completed form is not lost. */}
      <label className="flex items-start gap-3 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={formData.terms}
          onChange={e => setField('terms', e.target.checked)}
          className={`mt-0.5 accent-yellow-400 w-5 h-5 flex-shrink-0 ${ring} rounded`}
        />
        <span className="text-gray-400 text-sm leading-snug">
          I agree to the RideX Driver{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className={`text-yellow-400 hover:underline ${ring} rounded`}>
            Terms &amp; Conditions
          </a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className={`text-yellow-400 hover:underline ${ring} rounded`}>
            Privacy Policy
          </a>
        </span>
      </label>

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
  );
}

// ── DriverLogin (main page) ────────────────────────────────────────────────────

// Top-level page component. Renders the page header, portal nav, and either
// LoginForm or RegisterForm based on the active tab — both are always mounted
// so form state (errors, partial inputs) is preserved when switching tabs.
export default function DriverLogin() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  // Default to 'register' when opened via ?tab=register (e.g. "Become a Driver" CTA)
  const [activeForm, setActiveForm]           = useState(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const [registerSuccess, setRegisterSuccess] = useState('');
  const successTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(successTimerRef.current), []);

  // Called by RegisterForm after a successful registration:
  // shows ONE success banner above the tabs, then switches to login after 4 s
  function handleRegisterSuccess() {
    setActiveForm('login');
    setRegisterSuccess(
      'Registration successful! Please check your email to verify your account. ' +
      'Once verified our team will review your application within 24–48 hours.'
    );
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setRegisterSuccess(''), 8000);
  }

  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col pt-safe">

      {/* ── Page header: back navigation + brand ─────────────────────────── */}
      <header className="grid grid-cols-3 items-center px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Go back to home"
          className={`justify-self-start flex items-center gap-2 text-gray-400 hover:text-white transition text-sm px-2 py-2 -ml-2 ${ring} rounded`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <Link to="/" aria-label="RideX — home" className={`justify-self-center flex items-center gap-2 ${ring} rounded-lg`}>
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
            <span className="text-black font-black text-sm">R</span>
          </div>
          <span className="font-black text-lg tracking-tight">RideX</span>
        </Link>

        <div aria-hidden="true" />
      </header>

      {/* ── Portal selector: Customer vs Driver ──────────────────────────── */}
      <nav aria-label="Portal selector" className="flex border-b border-gray-800 px-4">
        <button
          type="button"
          onClick={() => navigate('/login')}
          className={`flex-1 py-3 min-h-[44px] text-sm font-semibold text-gray-500 hover:text-gray-300 transition ${ring}`}
        >
          Customer
        </button>
        {/* aria-current="page" marks this as the active portal */}
        <span
          aria-current="page"
          className="flex-1 py-3 text-sm font-semibold text-yellow-400 border-b-2 border-yellow-400 text-center"
        >
          Driver
        </span>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-6 sm:py-8 pb-safe">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 sm:p-8 w-full max-w-md">

          <h1 className="font-black text-2xl mb-1">
            {activeForm === 'login' ? 'Driver Login' : 'Become a Driver'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {activeForm === 'login'
              ? 'Sign in to your driver account'
              : 'Apply to join the RideX driver network'}
          </p>

          {/* Success banner shown after registration */}
          {registerSuccess && (
            <div
              aria-live="polite"
              role="status"
              className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm mb-4"
            >
              {registerSuccess}
            </div>
          )}

          {/* Login / Register toggle — ARIA tab pattern */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="bg-black border border-gray-800 rounded-full p-1 flex mb-6"
          >
            <button
              id="tab-login"
              type="button"
              role="tab"
              aria-selected={activeForm === 'login'}
              aria-controls="panel-login"
              onClick={() => setActiveForm('login')}
              className={`flex-1 py-3 text-sm font-semibold rounded-full transition ${ring}
                ${activeForm === 'login'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              Login
            </button>
            <button
              id="tab-register"
              type="button"
              role="tab"
              aria-selected={activeForm === 'register'}
              aria-controls="panel-register"
              onClick={() => setActiveForm('register')}
              className={`flex-1 py-3 text-sm font-semibold rounded-full transition ${ring}
                ${activeForm === 'register'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              Register
            </button>
          </div>

          {/* Both panels always mounted to preserve form state when switching tabs */}
          <div id="panel-login" role="tabpanel" aria-labelledby="tab-login" hidden={activeForm !== 'login'}>
            <LoginForm />
          </div>
          <div id="panel-register" role="tabpanel" aria-labelledby="tab-register" hidden={activeForm !== 'register'}>
            <RegisterForm onSuccess={handleRegisterSuccess} />
          </div>

        </div>
      </main>
    </div>
  );
}
