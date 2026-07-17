// DriverRoute.jsx
// Guards routes that require a logged-in driver.
// Redirects unauthenticated users to /driver/login.

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

function DriverRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [user,     setUser]     = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/driver/login" replace />;

  return children;
}

export default DriverRoute;
