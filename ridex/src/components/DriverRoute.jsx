// DriverRoute.jsx
// Guards routes that require a logged-in driver.
// Redirects unauthenticated users to /driver/login. Approval status is
// re-checked inside DriverDashboard on every load.

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// If Firebase never reports auth state (blocked SDK, offline cold start) stop
// spinning after this long and fall through to the login page.
const AUTH_TIMEOUT_MS = 10000;

function DriverRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [user,     setUser]     = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), AUTH_TIMEOUT_MS);
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
      setChecking(false);
    });
    return () => { clearTimeout(timer); unsub(); };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen min-h-dvh bg-black flex items-center justify-center" role="status" aria-label="Checking sign-in">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/driver/login" replace />;

  return children;
}

export default DriverRoute;
