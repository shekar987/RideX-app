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
import { auth, db } from '../../firebase';

// ── Constants ─────────────────────────────────────────────────────────────────

// Country options for the registration dropdown
const COUNTRIES = ['UK', 'USA', 'Canada', 'Australia', 'India', 'UAE', 'Other'];

// Vehicle type options for the registration dropdown
const VEHICLE_TYPES = ['Sedan', 'SUV', 'Van', 'Luxury', 'Motorbike'];

// Vehicle year options: 2015 to 2024
const VEHICLE_YEARS = Array.from({ length: 10 }, (_, i) => 2015 + i);

// Convert Firebase Auth error codes to user-friendly messages for login
function getLoginErrorMessage(code) {
  const map = {
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// Determine password strength based on length
// Returns { label, color, width } for the strength bar
function getPasswordStrength(password) {
  if (password.length === 0) return null;
  if (password.length < 6) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' };
  if (password.length < 10) return { label: 'Medium', color: 'bg-yellow-400', width: 'w-2/3' };
  return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// Eye toggle button used inside password inputs to show/hide text
function EyeToggle({ show, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? (
        // Eye-off icon (password visible)
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        // Eye icon (password hidden)
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );
}

// ── LoginForm ──────────────────────────────────────────────────────────────────

// Handles existing driver login: email + password, email verification check,
// Firestore status check (pending / rejected / approved), and password reset.
function LoginForm() {
  const navigate = useNavigate();

  // Form field state
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);

  // UI feedback state
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [warning, setWarning]         = useState('');
  const [showResend, setShowResend]   = useState(false);
  const [resendMsg, setResendMsg]     = useState('');
  const [unverifiedUser, setUnverifiedUser] = useState(null);

  // Handle forgot-password flow
  // Sends a reset email if the email field is filled, otherwise shows an error
  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Please enter your email first');
      return;
    }
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

  // Main login submit handler
  // Steps: validate → sign in → reload → check verification → check Firestore status → navigate
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setWarning('');
    setShowResend(false);
    setResendMsg('');

    // Step 1: Validate inputs
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    // Step 2: Show loading spinner
    setLoading(true);

    try {
      // Step 3: Sign in with Firebase Auth
      const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);

      // Step 4: Reload user to get fresh email verification status.
      // Wrapped in try/catch — a 400 from accounts:lookup (e.g. stale token)
      // must not kill the login flow; the emailVerified flag from sign-in is enough.
      try {
        await auth.currentUser.reload();
      } catch (reloadErr) {
        console.warn('reload() failed (non-fatal):', reloadErr.message);
      }

      // Step 5: Check email verification
      if (!auth.currentUser.emailVerified) {
        setUnverifiedUser(auth.currentUser);
        await signOut(auth);
        setError('Please verify your email before logging in. Check your inbox.');
        setShowResend(true);
        setLoading(false);
        return;
      }

      // Step 6: Check driver document via REST API.
      // The Firestore SDK reports "client is offline" after auth state changes,
      // so we fetch directly over HTTP using the user's ID token instead.
      const idToken   = await user.getIdToken();
      const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
      const restUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;

      const restResponse = await fetch(restUrl, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (restResponse.status === 404) {
        await signOut(auth);
        setError('No driver account found. Please register first.');
        setLoading(false);
        return;
      }

      if (!restResponse.ok) {
        throw new Error(`Firestore REST error ${restResponse.status}`);
      }

      const driverData = await restResponse.json();

      // Extract status field from Firestore REST response format
      const status = driverData?.fields?.status?.stringValue;

      if (status === 'pending') {
        await signOut(auth);
        setWarning('Your account is pending admin approval. We will notify you within 24-48 hours.');
        setLoading(false);
        return;
      }

      if (status === 'rejected') {
        await signOut(auth);
        setError('Your application was rejected. Contact support@ridex.com');
        setLoading(false);
        return;
      }

      // Step 8: Navigate to dashboard if approved
      navigate('/driver/dashboard');
    } catch (err) {
      console.error('Login error:', err.code, err.message);
      setError(getLoginErrorMessage(err.code));
      setLoading(false);
    }
  }

  return (
    /* Login form - allows existing drivers to sign in */
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

      {/* Email field */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="driver@example.com"
          autoComplete="email"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Password field with show/hide toggle */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm pr-10"
          />
          <EyeToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
        </div>
      </div>

      {/* Forgot password button - right aligned, yellow text */}
      <div className="flex justify-end -mt-2">
        <button
          type="button"
          onClick={handleForgotPassword}
          className="text-yellow-400 text-sm hover:text-yellow-300 transition"
        >
          Forgot Password?
        </button>
      </div>

      {/* Error message box */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Warning message box (e.g. pending approval) */}
      {warning && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-400 text-sm">
          {warning}
        </div>
      )}

      {/* Success message box (e.g. password reset sent) */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Resend verification email button - shown after unverified login attempt */}
      {showResend && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleResendVerification}
            className="w-full py-2.5 bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-sm font-semibold rounded-xl hover:bg-yellow-400/20 transition"
          >
            Resend Verification Email
          </button>
          {resendMsg && (
            <p className="text-green-400 text-xs text-center">{resendMsg}</p>
          )}
        </div>
      )}

      {/* Login submit button with loading spinner */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading && (
          <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {loading ? 'Signing in…' : 'Login'}
      </button>
    </form>
  );
}

// ── RegisterForm ───────────────────────────────────────────────────────────────

// Handles new driver registration: collects all required details, creates a Firebase
// Auth account, sends verification email, saves driver doc to Firestore with
// status: 'pending', then signs out so the user must verify before logging in.
//
// IMPORTANT: In Firebase Console → Firestore Database → Rules
// Change rules to this for testing (or set proper auth-based rules for production):
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /{document=**} {
//       allow read, write: if true;
//     }
//   }
// }
function RegisterForm({ onSuccess }) {
  // All registration form fields stored in a single object
  // terms is included here so the new handleRegister function can check formData.terms
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    city: '',
    country: 'UK',
    vehicleType: 'Sedan',
    vehicleMake: '',
    vehicleReg: '',
    vehicleYear: '2020',
    licenceNumber: '',
    terms: false,
  });

  // Show/hide toggles for password fields
  const [showPw, setShowPw]         = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);

  // UI feedback state — success lives inside this component so it always renders
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  // Update a single field in formData by key
  function setField(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  // Password strength for the visual indicator bar
  const strength = getPasswordStrength(formData.password);

  // Main register handler — called by button onClick (not form onSubmit)
  // so there is no risk of the browser swallowing the event or double-firing.
  // Uses finally{} to guarantee the spinner always stops.
  const handleRegister = async () => {
    // Reset all messages before starting
    setError('');
    setSuccess('');

    console.log('Step 1: Starting registration...');

    // Validate all required fields are filled
    if (
      !formData.name ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword ||
      !formData.phone ||
      !formData.city ||
      !formData.country ||
      !formData.vehicleType ||
      !formData.vehicleMake ||
      !formData.vehicleReg ||
      !formData.vehicleYear ||
      !formData.licenceNumber
    ) {
      setError('Please fill in all fields before registering.');
      return;
    }

    // Check passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    // Check password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    // Check terms checkbox is ticked
    if (!formData.terms) {
      setError('Please agree to the Terms & Conditions to continue.');
      return;
    }

    // Start loading — spinner shows, button disabled
    setLoading(true);

    try {
      console.log('Step 2: Creating Firebase Auth account...');

      // Step 1: Create Firebase Auth account
      const result = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = result.user;

      console.log('Step 3: Auth account created:', user.uid);

      // Step 2: Update display name
      await updateProfile(user, { displayName: formData.name });

      console.log('Step 4: Sending verification email...');

      // Step 3: Send verification email
      // Wrapped in its own try/catch so a failed email does NOT block registration
      try {
        await sendEmailVerification(user, {
          url: window.location.origin + '/driver/login',
          handleCodeInApp: false,
        });
      } catch (emailError) {
        // Don't block registration if email sending fails
        console.warn('Verification email failed (non-blocking):', emailError.message);
      }

      console.log('Step 5: Saving to Firestore...');

      // Step 4: Save driver document via REST API instead of the Firestore SDK.
      // The SDK's setDoc hangs after createUserWithEmailAndPassword because the
      // onAuthStateChanged listener fires mid-write and leaves the SDK in an
      // inconsistent auth state. Using fetch + the user's ID token bypasses that
      // timing issue entirely.
      const idToken    = await user.getIdToken();
      const projectId  = process.env.REACT_APP_FIREBASE_PROJECT_ID;
      const restUrl    = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/drivers/${user.uid}`;

      const restResponse = await fetch(restUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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

      console.log('Step 6: Firestore save complete');
      console.log('Step 7: Signing out...');

      // Step 5: Sign out immediately — user must verify email before logging in
      await signOut(auth);

      console.log('Step 8: Showing success message');

      // Step 6: Show success message inside this component
      setSuccess(
        'Registration successful! Please check your email to verify your account. ' +
        'Once verified, our team will review your application within 24-48 hours.'
      );

      // Step 7: Clear all form fields
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        city: '',
        country: 'UK',
        vehicleType: 'Sedan',
        vehicleMake: '',
        vehicleReg: '',
        vehicleYear: '2020',
        licenceNumber: '',
        terms: false,
      });

      // Step 8: Switch to login tab after 3 seconds
      setTimeout(() => {
        setSuccess('');
        onSuccess();
      }, 3000);

    } catch (err) {
      console.error('Registration error:', err.code, err.message);

      // Handle Firebase specific errors with friendly messages
      const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered. Please login instead.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
      };
      setError(errorMessages[err.code] || `Registration failed: ${err.message}`);
    } finally {
      // Always stop loading spinner — whether success or error
      setLoading(false);
    }
  };

  return (
    /* Registration form - allows new drivers to apply to join RideX */
    <div className="flex flex-col gap-4">

      {/* Full Name */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Full Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setField('name', e.target.value)}
          placeholder="John Smith"
          autoComplete="name"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Email</label>
        <input
          type="email"
          value={formData.email}
          onChange={e => setField('email', e.target.value)}
          placeholder="driver@example.com"
          autoComplete="email"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Password with strength indicator */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={formData.password}
            onChange={e => setField('password', e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm pr-10"
          />
          <EyeToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
        </div>
        {/* Password strength bar - shows weak/medium/strong */}
        {strength && (
          <div className="mt-1">
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${strength.color} ${strength.width}`} />
            </div>
            <p className={`text-xs mt-1 ${
              strength.label === 'Weak' ? 'text-red-400' :
              strength.label === 'Medium' ? 'text-yellow-400' : 'text-green-400'
            }`}>{strength.label}</p>
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Confirm Password</label>
        <div className="relative">
          <input
            type={showConfPw ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={e => setField('confirmPassword', e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm pr-10"
          />
          <EyeToggle show={showConfPw} onToggle={() => setShowConfPw(v => !v)} />
        </div>
      </div>

      {/* Phone Number */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Phone Number</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={e => setField('phone', e.target.value)}
          placeholder="+44 7700 900000"
          autoComplete="tel"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* City */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">City</label>
        <input
          type="text"
          value={formData.city}
          onChange={e => setField('city', e.target.value)}
          placeholder="London"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Country selector for multi-country support */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Country</label>
        <select
          value={formData.country}
          onChange={e => setField('country', e.target.value)}
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:outline-none focus:border-yellow-400 transition text-sm"
        >
          {COUNTRIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Vehicle Type */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Vehicle Type</label>
        <select
          value={formData.vehicleType}
          onChange={e => setField('vehicleType', e.target.value)}
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:outline-none focus:border-yellow-400 transition text-sm"
        >
          {VEHICLE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Vehicle Make & Model */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Vehicle Make &amp; Model</label>
        <input
          type="text"
          value={formData.vehicleMake}
          onChange={e => setField('vehicleMake', e.target.value)}
          placeholder="e.g. Toyota Camry"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Vehicle Registration Number */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Vehicle Registration Number</label>
        <input
          type="text"
          value={formData.vehicleReg}
          onChange={e => setField('vehicleReg', e.target.value)}
          placeholder="AB12 CDE"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Vehicle Year */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Vehicle Year</label>
        <select
          value={formData.vehicleYear}
          onChange={e => setField('vehicleYear', e.target.value)}
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white focus:outline-none focus:border-yellow-400 transition text-sm"
        >
          {VEHICLE_YEARS.map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/* Driving Licence Number */}
      <div className="flex flex-col gap-1">
        <label className="text-gray-400 text-sm font-medium">Driving Licence Number</label>
        <input
          type="text"
          value={formData.licenceNumber}
          onChange={e => setField('licenceNumber', e.target.value)}
          placeholder="SMITH901157AB9IJ"
          className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 transition text-sm"
        />
      </div>

      {/* Terms and conditions agreement - required before registering */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.terms}
          onChange={e => setField('terms', e.target.checked)}
          className="mt-0.5 accent-yellow-400 w-4 h-4 flex-shrink-0"
        />
        <span className="text-gray-400 text-sm leading-snug">
          I agree to the RideX Driver{' '}
          <span className="text-yellow-400">Terms &amp; Conditions</span>{' '}
          and{' '}
          <span className="text-yellow-400">Privacy Policy</span>
        </span>
      </label>

      {/* Register button - disabled while loading to prevent double submission */}
      <button
        onClick={handleRegister}
        disabled={loading}
        className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Creating account...
          </span>
        ) : 'Create Account'}
      </button>

      {/* Show error message if registration fails */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mt-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Show success message when registration completes */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mt-4">
          <p className="text-green-400 text-sm">{success}</p>
        </div>
      )}
    </div>
  );
}

// ── DriverLogin (main page) ────────────────────────────────────────────────────

// Top-level page component. Renders the nav bar, role tabs, form toggle,
// and either the LoginForm or RegisterForm based on active tab state.
export default function DriverLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 'login' | 'register' — which form tab is currently visible
  // Defaults to 'register' if ?tab=register is in the URL (e.g. from "Become a Driver" on landing page)
  const [activeForm, setActiveForm] = useState(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );

  // Success message shown after a completed registration
  const [registerSuccess, setRegisterSuccess] = useState('');

  // Called by RegisterForm on successful registration:
  // shows the success banner, clears it after 3 s, and switches to login tab
  function handleRegisterSuccess() {
    setRegisterSuccess(
      'Registration successful! Please check your email to verify your account. ' +
      'Once verified our team will review your application within 24-48 hours.'
    );
    setTimeout(() => {
      setRegisterSuccess('');
      setActiveForm('login');
    }, 3000);
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* Top bar with back button and RideX logo */}
      <div className="flex items-center justify-between px-4 py-4">
        {/* Back button - navigates to landing page */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm"
          aria-label="Go back to home"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* RideX logo: yellow circle with black "R" + "RideX" text */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-black font-black text-sm">R</span>
          </div>
          <span className="text-white font-black text-lg tracking-tight">RideX</span>
        </div>

        {/* Spacer to keep logo centered */}
        <div className="w-16" />
      </div>

      {/* Role selector tabs - switches between customer and driver portals */}
      <div className="flex border-b border-gray-800 px-4">
        {/* Customer tab - navigates away to the customer login page */}
        <button
          onClick={() => navigate('/login')}
          className="flex-1 py-3 text-sm font-semibold text-gray-500 hover:text-gray-300 transition"
        >
          👤 Customer
        </button>
        {/* Driver tab - active on this page */}
        <button
          className="flex-1 py-3 text-sm font-semibold text-white border-b-2 border-yellow-400"
        >
          🚗 Driver
        </button>
      </div>

      {/* Main scrollable content area */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md">

          {/* Page heading */}
          <h1 className="text-white font-black text-2xl mb-1">
            {activeForm === 'login' ? 'Driver Login' : 'Become a Driver'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {activeForm === 'login'
              ? 'Sign in to your driver account'
              : 'Apply to join the RideX driver network'}
          </p>

          {/* Toggle between Login and Register forms */}
          <div className="bg-gray-900 border border-gray-800 rounded-full p-1 flex mb-6">
            <button
              onClick={() => setActiveForm('login')}
              className={`flex-1 py-2 text-sm font-semibold rounded-full transition ${
                activeForm === 'login'
                  ? 'bg-white text-black font-black'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setActiveForm('register')}
              className={`flex-1 py-2 text-sm font-semibold rounded-full transition ${
                activeForm === 'register'
                  ? 'bg-white text-black font-black'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Register
            </button>
          </div>

          {/* Registration success banner - shown for 3 s after successful registration */}
          {registerSuccess && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm mb-4">
              {registerSuccess}
            </div>
          )}

          {/* Render the active form */}
          {activeForm === 'login' ? (
            <LoginForm />
          ) : (
            <RegisterForm onSuccess={handleRegisterSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
