// DriverLogin.jsx
// Full driver authentication page: login for existing drivers, registration for new applicants.
// Handles email verification, Firestore status checks, and pending/rejected/approved flows.

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { auth } from '../../firebase';

// ── Constants ─────────────────────────────────────────────────────────────────

const COUNTRIES     = ['UK', 'USA', 'Canada', 'Australia', 'India', 'UAE', 'Other'];
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Luxury', 'Motorbike'];
const VEHICLE_YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i); // 2015–2026

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// Convert Firebase Auth error codes to user-friendly messages
function getLoginErrorMessage(code) {
  const map = {
    'auth/wrong-password':    'Incorrect password. Please try again.',
    'auth/user-not-found':    'No account found with this email.',
    'auth/invalid-email':     'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/invalid-credential':'Invalid email or password. Please try again.',
    'unavailable':            'Connection issue. Please check your internet and try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// Returns { label, color, width } for the password strength bar
function getPasswordStrength(password) {
  if (password.length === 0) return null;
  if (password.length < 6)   return { label: 'Weak',   color: 'bg-red-500',    width: 'w-1/3' };
  if (password.length < 10)  return { label: 'Medium', color: 'bg-yellow-400', width: 'w-2/3' };
  return                             { label: 'Strong', color: 'bg-green-500',  width: 'w-full' };
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

// Text input with visible label properly associated via htmlFor/id
function FormField({ id, label, type, value, onChange, placeholder, autoComplete, autoCapitalize, maxLength, rightElement }) {
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
          maxLength={maxLength}
          className={`w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white
            placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm ${ring}
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
          focus:outline-none focus:border-yellow-400 transition text-sm ${ring}`}
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
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState('');
  const [warning, setWarning]               = useState('');
  const [showResend, setShowResend]         = useState(false);
  const [resendMsg, setResendMsg]           = useState('');
  const [unverifiedUser, setUnverifiedUser] = useState(null);

  // Sends a password reset email; requires the email field to be filled first
  async function handleForgotPassword() {
    if (!email.trim()) { setError('Please enter your email first.'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setError('');
      setSuccess('Password reset email sent! Check your inbox.');
    } catch {
      setError('Could not send reset email. Check the address and try again.');
    }
  }

  // Resend verification email to the currently signed-in (but unverified) user
  async function handleResendVerification() {
    if (!unverifiedUser) return;
    try {
      await sendEmailVerification(unverifiedUser);
      setResendMsg('Email sent! Check your inbox.');
    } catch {
      setResendMsg('Could not resend email. Please try again later.');
    }
  }

  // Steps: validate → sign in → reload → check verification → check Firestore status → navigate
  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setWarning('');
    setShowResend(false); setResendMsg('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result    = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user      = result.user;

      // Grab the ID token immediately after sign-in, before auth-state listeners fire
      // and before the Firestore SDK tries to reconnect. Using the token later is safe.
      const idToken   = await user.getIdToken();
      const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;

      // Reload to get a fresh emailVerified flag (non-fatal if it fails)
      try { await user.reload(); } catch {}

      if (!auth.currentUser.emailVerified) {
        setUnverifiedUser(auth.currentUser);
        await signOut(auth);
        setError('Please verify your email before logging in. Check your inbox.');
        setShowResend(true);
        setLoading(false);
        return;
      }

      // Fetch driver document via REST API. The Firestore SDK reports "client is offline"
      // after auth-state changes; fetch + token bypasses that entirely.
      const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;
      const restRes = await fetch(restUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (restRes.status === 404) {
        await signOut(auth);
        setError('No driver account found. Please register first.');
        setLoading(false);
        return;
      }
      if (!restRes.ok) {
        const body = await restRes.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Server error ${restRes.status}`);
      }

      const json   = await restRes.json();
      const status = json?.fields?.status?.stringValue;

      if (status === 'pending') {
        await signOut(auth);
        setWarning('Your account is pending admin approval. We will notify you within 24–48 hours.');
        setLoading(false);
        return;
      }
      if (status === 'rejected') {
        await signOut(auth);
        setError('Your application was rejected. Please contact support@ridex.com');
        setLoading(false);
        return;
      }
      // Treat 'approved' or missing status (legacy accounts) as approved
      if (status === 'approved' || !status) {
        navigate('/driver/dashboard');
        return;
      }

      setError(`Unexpected account status: "${status}". Contact support@ridex.com`);
      setLoading(false);
    } catch (err) {
      setError(getLoginErrorMessage(err.code));
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
                  className={`w-full py-2 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400
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
        rightElement={
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className={`text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
          >
            <EyeIcon open={showPw} />
          </button>
        }
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleForgotPassword}
          className={`text-xs text-yellow-400 hover:underline ${ring} rounded`}
        >
          Forgot password?
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

// Handles new driver registration: collects all required details, creates a Firebase
// Auth account, sends verification email, saves driver doc to Firestore with
// status: 'pending', then signs out so the user must verify before logging in.
function RegisterForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    name:            '',
    email:           '',
    password:        '',
    confirmPassword: '',
    phone:           '',
    city:            '',
    country:         'UK',
    vehicleType:     'Sedan',
    vehicleMake:     '',
    vehicleReg:      '',
    vehicleYear:     '2020',
    licenceNumber:   '',
    terms:           false,
  });

  const [showPw, setShowPw]         = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  function setField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  const strength = getPasswordStrength(formData.password);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (
      !formData.name || !formData.email || !formData.password ||
      !formData.confirmPassword || !formData.phone || !formData.city ||
      !formData.country || !formData.vehicleType || !formData.vehicleMake ||
      !formData.vehicleReg || !formData.vehicleYear || !formData.licenceNumber
    ) {
      setError('Please fill in all fields before registering.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!formData.terms) {
      setError('Please agree to the Terms & Conditions to continue.');
      return;
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user   = result.user;

      await updateProfile(user, { displayName: formData.name });

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
      const idToken   = await user.getIdToken();
      const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
      const restUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;

      const restResponse = await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: {
            uid:           { stringValue: user.uid },
            name:          { stringValue: formData.name },
            email:         { stringValue: formData.email },
            phone:         { stringValue: formData.phone },
            city:          { stringValue: formData.city },
            country:       { stringValue: formData.country },
            vehicleType:   { stringValue: formData.vehicleType },
            vehicleMake:   { stringValue: formData.vehicleMake },
            vehicleReg:    { stringValue: formData.vehicleReg },
            vehicleYear:   { stringValue: formData.vehicleYear },
            licenceNumber: { stringValue: formData.licenceNumber },
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
      });

      if (!restResponse.ok) {
        const errData = await restResponse.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Firestore REST error ${restResponse.status}`);
      }

      // Sign out immediately — user must verify email before logging in
      await signOut(auth);

      setSuccess(
        'Registration successful! Please check your email to verify your account. ' +
        'Once verified, our team will review your application within 24–48 hours.'
      );
      setFormData({
        name: '', email: '', password: '', confirmPassword: '',
        phone: '', city: '', country: 'UK', vehicleType: 'Sedan',
        vehicleMake: '', vehicleReg: '', vehicleYear: '2020',
        licenceNumber: '', terms: false,
      });

      // Switch to the login tab after the success message has been visible for 3 s
      setTimeout(() => { setSuccess(''); onSuccess(); }, 3000);

    } catch (err) {
      const msgs = {
        'auth/email-already-in-use':   'This email is already registered. Please login instead.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/invalid-email':          'Please enter a valid email address.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/too-many-requests':      'Too many attempts. Please try again later.',
      };
      setError(msgs[err.code] || `Registration failed: ${err.message}`);
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
        {success && (
          <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
            <p className="text-green-400 text-sm">{success}</p>
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
          rightElement={
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className={`text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
            >
              <EyeIcon open={showPw} />
            </button>
          }
        />
        {strength && (
          <div aria-live="polite" className="pt-1">
            <div className="w-full bg-gray-800 rounded-full h-1.5">
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
        rightElement={
          <button
            type="button"
            onClick={() => setShowConfPw(v => !v)}
            aria-label={showConfPw ? 'Hide confirm password' : 'Show confirm password'}
            className={`text-gray-500 hover:text-gray-300 transition ${ring} rounded`}
          >
            <EyeIcon open={showConfPw} />
          </button>
        }
      />

      <FormField
        id="reg-phone"
        label="Phone number"
        type="tel"
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

      {/* Terms checkbox — label wraps input so association is implicit */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.terms}
          onChange={e => setField('terms', e.target.checked)}
          className={`mt-0.5 accent-yellow-400 w-4 h-4 flex-shrink-0 ${ring} rounded`}
        />
        <span className="text-gray-400 text-sm leading-snug">
          I agree to the RideX Driver{' '}
          <a href="/terms" className={`text-yellow-400 hover:underline ${ring} rounded`}>
            Terms &amp; Conditions
          </a>
          {' '}and{' '}
          <a href="/privacy" className={`text-yellow-400 hover:underline ${ring} rounded`}>
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
  const [activeForm, setActiveForm]       = useState(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const [registerSuccess, setRegisterSuccess] = useState('');

  // Called by RegisterForm after a successful registration:
  // shows a success banner above the tabs, then switches to login after 3 s
  function handleRegisterSuccess() {
    setRegisterSuccess(
      'Registration successful! Please check your email to verify your account. ' +
      'Once verified our team will review your application within 24–48 hours.'
    );
    setTimeout(() => {
      setRegisterSuccess('');
      setActiveForm('login');
    }, 3000);
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Page header: back navigation + brand ─────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-4">
        <button
          onClick={() => navigate('/')}
          aria-label="Go back to home"
          className={`flex items-center gap-2 text-gray-400 hover:text-white transition text-sm ${ring} rounded`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <a href="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
            <span className="text-black font-black text-sm">R</span>
          </div>
          <span className="font-black text-lg tracking-tight">RideX</span>
        </a>

        {/* Spacer keeps logo visually centred */}
        <div className="w-16" aria-hidden="true" />
      </header>

      {/* ── Portal selector: Customer vs Driver ──────────────────────────── */}
      <nav aria-label="Portal selector" className="flex border-b border-gray-800 px-4">
        <button
          onClick={() => navigate('/login')}
          className={`flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-gray-300 transition ${ring}`}
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
      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md">

          <h1 className="font-black text-2xl mb-1">
            {activeForm === 'login' ? 'Driver Login' : 'Become a Driver'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {activeForm === 'login'
              ? 'Sign in to your driver account'
              : 'Apply to join the RideX driver network'}
          </p>

          {/* Success banner shown after registration while the tab switches */}
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
              role="tab"
              aria-selected={activeForm === 'login'}
              aria-controls="panel-login"
              onClick={() => setActiveForm('login')}
              className={`flex-1 py-2 text-sm font-semibold rounded-full transition ${ring}
                ${activeForm === 'login'
                  ? 'bg-yellow-400 text-black'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              Login
            </button>
            <button
              id="tab-register"
              role="tab"
              aria-selected={activeForm === 'register'}
              aria-controls="panel-register"
              onClick={() => setActiveForm('register')}
              className={`flex-1 py-2 text-sm font-semibold rounded-full transition ${ring}
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
