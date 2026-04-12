// DriverDashboard.jsx
// Placeholder page shown after a driver logs in successfully.
// Full dashboard will be built in a later task.

import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';

export default function DriverDashboard() {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut(auth);
    navigate('/driver/login');
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 w-full max-w-md text-center">
        {/* RideX logo */}
        <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-black font-black text-2xl">R</span>
        </div>

        <h1 className="text-white font-black text-2xl mb-2">Driver Dashboard</h1>
        <p className="text-green-400 text-sm font-semibold mb-1">Login successful!</p>
        <p className="text-gray-500 text-sm mb-8">
          Full dashboard coming soon. You are approved and ready to drive.
        </p>

        <button
          onClick={handleLogout}
          className="w-full py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition text-sm"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
