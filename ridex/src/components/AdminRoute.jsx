// AdminRoute.jsx
// Guards the admin dashboard. Admin = REACT_APP_ADMIN_EMAIL or an /admins/{uid}
// document (see utils/admin.js). Unauthorised users go to /admin/login.

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { isAdminUser } from '../utils/admin';

const AUTH_TIMEOUT_MS = 10000;

function AdminRoute({ children }) {
  const location = useLocation();
  const [checking,   setChecking]   = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setChecking(false); }, AUTH_TIMEOUT_MS);
    const unsub = onAuthStateChanged(auth, async user => {
      const ok = await isAdminUser(user);
      if (cancelled) return;
      setAuthorized(ok);
      setChecking(false);
    });
    return () => { cancelled = true; clearTimeout(timer); unsub(); };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen min-h-dvh bg-black flex items-center justify-center" role="status" aria-label="Checking sign-in">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) return <Navigate to="/admin/login" replace state={{ from: location }} />;

  return children;
}

export default AdminRoute;
