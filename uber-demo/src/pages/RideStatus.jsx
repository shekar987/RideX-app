import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  { label: 'Ride Confirmed', icon: '✅', desc: 'Looking for a driver...' },
  { label: 'Driver Assigned', icon: '🚗', desc: 'Driver is on his way to you' },
  { label: 'Driver Arriving', icon: '📍', desc: 'Driver is 2 minutes away' },
  { label: 'Ride Started', icon: '🛣️', desc: 'Enjoy your ride!' },
  { label: 'Arrived', icon: '🏁', desc: 'You have reached your destination' },
];

// Map Firestore status strings to the UI step index (0–4).
const STATUS_MAP = {
  confirmed: 0,
  driver_assigned: 1,
  driver_arriving: 2,
  ride_started: 3,
  arrived: 4,
  completed: 4,
};

function RideStatus() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { rideDetails: ctxRide, listenToRide, logout, user } = useAuth();
  const rideDetails = ctxRide ?? state?.ride;
  const [status, setStatus] = useState(0);
  const [liveRide, setLiveRide] = useState(null);

  const rideId = rideDetails?.rideId;
  const lastUpdateRef = useRef(0);

  // Mode 1: subscribe to real-time Firestore updates when a rideId is available.
  // Throttled to max 1 UI update/second to avoid thrashing on rapid Firestore writes.
  useEffect(() => {
    if (!rideId) return;
    const unsubscribe = listenToRide(rideId, (data) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 1000) return;
      lastUpdateRef.current = now;
      setLiveRide(data);
    });
    return unsubscribe;
  }, [rideId, listenToRide]);

  // Mode 1b: map Firestore status → step index.
  // Use Math.max so real backend updates can jump ahead, but never go backwards
  // (prevents the Firestore 'confirmed' snapshot from resetting a simulated step).
  useEffect(() => {
    if (!liveRide?.status) return;
    const step = STATUS_MAP[liveRide.status] ?? 0;
    setStatus((current) => Math.max(current, step));
  }, [liveRide]);

  // Mode 2: always simulate progress so the demo flows smoothly end-to-end.
  // Real Firestore updates (when a backend is deployed) still take priority above.
  useEffect(() => {
    if (status >= STEPS.length - 1) return;
    const timer = setTimeout(() => setStatus((s) => s + 1), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!rideDetails) return <Navigate to="/book" replace />;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navbar — consistent with BookRide */}
      <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
            <span className="text-black font-black text-xs">R</span>
          </div>
          <h1 className="text-lg font-black">RideX</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-gray-400 text-sm hidden md:block">
            {user?.displayName || user?.email}
          </p>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Driver Card */}
          <div className="bg-gray-900 rounded-2xl p-6 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center text-2xl">
                👨
              </div>
              <div>
                <p className="font-bold text-lg">{(liveRide || rideDetails).driverName || 'Driver TBD'}</p>
                <p className="text-gray-400 text-sm">{(liveRide || rideDetails).driverCar || 'Vehicle TBD'}</p>
                {(liveRide || rideDetails).driverRating && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-yellow-400">★</span>
                    <span className="text-sm">{(liveRide || rideDetails).driverRating}</span>
                  </div>
                )}
              </div>
              <div className="ml-auto">
                <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-xl cursor-pointer hover:bg-gray-700">
                  📞
                </div>
              </div>
            </div>

            {/* Current Status */}
            <div className="bg-black rounded-xl p-4 text-center">
              <p className="text-4xl mb-2">{STEPS[status].icon}</p>
              <p className="text-xl font-bold text-yellow-400">{STEPS[status].label}</p>
              <p className="text-gray-400 text-sm mt-1">{STEPS[status].desc}</p>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="bg-gray-900 rounded-2xl p-6 mb-8">
            <p className="text-gray-400 text-sm mb-4">Ride Progress</p>
            {STEPS.map((step, index) => (
              <div key={index} className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${index <= status ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-gray-500'}`}>
                  {index < status ? '✓' : index + 1}
                </div>
                <p className={`${index <= status ? 'text-white font-semibold' : 'text-gray-500'}`}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>

          {/* Fare */}
          <div className="bg-gray-900 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-400 text-sm">Total Fare</p>
                <p className="text-3xl font-bold text-yellow-400">£{parseFloat(rideDetails.price).toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-sm">Payment</p>
                <p className="font-semibold">💳 Card</p>
              </div>
            </div>
          </div>

          {/* Done Button */}
          {status === STEPS.length - 1 && (
            <button
              onClick={() => navigate('/book')}
              className="w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition"
            >
              Book Another Ride
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default RideStatus;
