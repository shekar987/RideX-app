import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function AdminRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthorized(!!user && !!ADMIN_EMAIL && user.email === ADMIN_EMAIL);
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

  if (!authorized) return <Navigate to="/admin/login" replace />;

  return children;
}

export default AdminRoute;
