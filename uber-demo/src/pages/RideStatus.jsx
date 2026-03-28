import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function RideStatus() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(0);

  const steps = [
    { label: 'Ride Confirmed', icon: '✅', desc: 'Looking for a driver...' },
    { label: 'Driver Assigned', icon: '🚗', desc: 'James is on his way to you' },
    { label: 'Driver Arriving', icon: '📍', desc: 'James is 2 minutes away' },
    { label: 'Ride Started', icon: '🛣️', desc: 'Enjoy your ride!' },
    { label: 'Arrived', icon: '🏁', desc: 'You have reached your destination' },
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status < steps.length - 1) {
      const timer = setTimeout(() => setStatus(status + 1), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold mb-8">RideX</h1>

        {/* Driver Card */}
        <div className="bg-gray-900 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-yellow-400 rounded-full flex items-center justify-center text-2xl">
              👨
            </div>
            <div>
              <p className="font-bold text-lg">James Wilson</p>
              <p className="text-gray-400 text-sm">Toyota Camry • ABC 1234</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-yellow-400">★</span>
                <span className="text-sm">4.9</span>
              </div>
            </div>
            <div className="ml-auto">
              <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-xl cursor-pointer hover:bg-gray-700">
                📞
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div className="bg-black rounded-xl p-4 text-center">
            <p className="text-4xl mb-2">{steps[status].icon}</p>
            <p className="text-xl font-bold text-yellow-400">{steps[status].label}</p>
            <p className="text-gray-400 text-sm mt-1">{steps[status].desc}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-900 rounded-2xl p-6 mb-8">
          <p className="text-gray-400 text-sm mb-4">Ride Progress</p>
          {steps.map((step, index) => (
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
              <p className="text-3xl font-bold text-yellow-400">£12.50</p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-sm">Payment</p>
              <p className="font-semibold">💳 Card</p>
            </div>
          </div>
        </div>

        {/* Done Button */}
        {status === steps.length - 1 && (
          <button
            onClick={() => navigate('/book')}
            className="w-full py-3 bg-yellow-400 text-black font-bold rounded-xl hover:bg-yellow-300 transition"
          >
            Book Another Ride
          </button>
        )}
      </div>
    </div>
  );
}

export default RideStatus;