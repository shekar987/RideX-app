import { PLATFORM_SHARE } from '../../../constants/fees';

// ─────────────────────────────────────────────
// Receipt modal (shown after completing a ride)
// ─────────────────────────────────────────────
export default function ReceiptModal({ ride, onClose }) {
  if (!ride) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-white font-black text-2xl text-center mb-1">Ride Complete!</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Great job! Here's your summary.</p>

        <div className="bg-black rounded-xl p-4 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-gray-300 truncate">{ride.pickupAddress}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
            <span className="text-gray-300 truncate">{ride.destinationAddress}</span>
          </div>
          <p className="text-gray-500 text-xs mt-2">{ride.distance} mi · {ride.duration} mins</p>
        </div>

        <div className="bg-black rounded-xl p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Customer paid</span>
            <span className="text-white font-semibold">£{parseFloat(ride.price || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Platform fee ({PLATFORM_SHARE * 100}%)</span>
            <span className="text-red-400 font-semibold">-£{parseFloat(ride.platformFee || 0).toFixed(2)}</span>
          </div>
          <div className="border-t border-gray-800 pt-2 flex justify-between">
            <span className="text-white font-bold">Your earnings</span>
            <span className="text-yellow-400 font-black text-xl">£{parseFloat(ride.driverEarnings || 0).toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 active:bg-yellow-500 transition text-lg"
        >
          Done
        </button>
      </div>
    </div>
  );
}
