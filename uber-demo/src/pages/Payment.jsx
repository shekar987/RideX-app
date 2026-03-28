import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Payment() {
    const navigate = useNavigate();
    const { rideDetails } = useAuth();
    const [selected, setSelected] = useState('card');
    const [loading, setLoading] = useState(false);
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvv, setCvv] = useState('');

    const price = rideDetails?.price || '12.50';

    const formatCard = (val) => {
        return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
    };

    const formatExpiry = (val) => {
        return val.replace(/\D/g, '').slice(0, 4).replace(/(.{2})/, '$1/');
    };

    const handlePay = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            navigate('/status');
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navbar */}
            <nav className="flex items-center px-6 py-4 border-b border-gray-800">
                <button
                    onClick={() => navigate('/book')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition mr-6"
                >
                    ← Back
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-black font-black text-xs">R</span>
                    </div>
                    <h1 className="text-lg font-black">RideX</h1>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col lg:flex-row gap-8">

                {/* Left — Payment Form */}
                <div className="flex-1 max-w-md">
                    <h2 className="text-3xl font-black mb-1">Payment</h2>
                    <p className="text-gray-500 text-sm mb-8">Choose your payment method</p>

                    {/* Payment Methods */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                            { id: 'card', label: 'Card', icon: '💳' },
                            { id: 'apple', label: 'Apple Pay', icon: '🍎' },
                            { id: 'google', label: 'Google Pay', icon: 'G' },
                        ].map((method) => (
                            <div
                                key={method.id}
                                onClick={() => setSelected(method.id)}
                                className={`rounded-2xl p-4 text-center cursor-pointer transition border
                  ${selected === method.id
                                        ? 'border-yellow-400 bg-yellow-400/10'
                                        : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                            >
                                <div className="text-2xl mb-1">{method.icon}</div>
                                <p className="text-xs font-semibold text-gray-400">{method.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Card Form */}
                    {selected === 'card' && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                            {/* Card Preview */}
                            <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl p-5 mb-5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <p className="text-black/60 text-xs mb-4">RIDEX CARD</p>
                                <p className="text-black font-black text-lg tracking-widest mb-4">
                                    {cardNumber || '•••• •••• •••• ••••'}
                                </p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-black/50 text-xs">EXPIRES</p>
                                        <p className="text-black font-bold text-sm">{expiry || 'MM/YY'}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <div className="w-8 h-8 bg-red-500 rounded-full opacity-80"></div>
                                        <div className="w-8 h-8 bg-orange-400 rounded-full opacity-80 -ml-3"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Inputs */}
                            <div className="mb-4">
                                <label className="block text-xs text-gray-500 mb-2">Card Number</label>
                                <input
                                    type="text"
                                    value={cardNumber}
                                    onChange={(e) => setCardNumber(formatCard(e.target.value))}
                                    placeholder="1234 5678 9012 3456"
                                    className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 text-sm transition"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-2">Expiry Date</label>
                                    <input
                                        type="text"
                                        value={expiry}
                                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                                        placeholder="MM/YY"
                                        className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 text-sm transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-2">CVV</label>
                                    <input
                                        type="password"
                                        value={cvv}
                                        onChange={(e) => setCvv(e.target.value.slice(0, 3))}
                                        placeholder="•••"
                                        className="w-full px-4 py-3 bg-black border border-gray-800 rounded-xl text-white placeholder-gray-700 focus:outline-none focus:border-yellow-400 text-sm transition"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Apple/Google Pay */}
                    {(selected === 'apple' || selected === 'google') && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
                            <p className="text-4xl mb-3">{selected === 'apple' ? '🍎' : 'G'}</p>
                            <p className="font-bold mb-1">{selected === 'apple' ? 'Apple Pay' : 'Google Pay'}</p>
                            <p className="text-gray-500 text-sm">
                                {selected === 'apple'
                                    ? 'Use Touch ID or Face ID to pay instantly'
                                    : 'Tap to pay with your Google account'}
                            </p>
                        </div>
                    )}

                    {/* Pay Button */}
                    <button
                        onClick={handlePay}
                        disabled={loading}
                        className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 transition text-lg shadow-lg shadow-yellow-400/20"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Processing payment...
                            </span>
                        ) : `Pay £${price}`}
                    </button>

                    <div className="flex items-center justify-center gap-2 mt-4">
                        <span className="text-gray-600 text-xs">🔒</span>
                        <p className="text-gray-600 text-xs">Secured by Stripe • 256-bit SSL encryption</p>
                    </div>
                </div>

                {/* Right — Order Summary */}
                <div className="lg:w-80">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sticky top-6">
                        <p className="font-bold mb-5 text-lg">Ride Summary</p>

                        {/* Route */}
                        <div className="mb-5">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="mt-1 flex flex-col items-center gap-1">
                                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                    <div className="w-0.5 h-8 bg-gray-700"></div>
                                    <div className="w-3 h-3 rounded-sm bg-red-400"></div>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold mb-3">{rideDetails?.pickup || 'Pickup Location'}</p>
                                    <p className="text-sm text-gray-400">{rideDetails?.destination || 'Destination'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-800 pt-4 mb-4">
                            {/* Driver */}
                            <div className="flex items-center gap-3 mb-4 bg-black/50 rounded-xl p-3">
                                <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">👨</div>
                                <div>
                                    <p className="text-sm font-semibold">James Wilson</p>
                                    <p className="text-xs text-gray-500">Toyota Camry • ★ 4.9</p>
                                </div>
                            </div>

                            {/* Price breakdown */}
                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">{rideDetails?.rideType || 'Economy'} ride</span>
                                    <span>£{(price * 0.85).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Service fee</span>
                                    <span>£{(price * 0.15).toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="border-t border-gray-800 pt-3 flex justify-between items-center">
                                <span className="font-bold">Total</span>
                                <span className="text-2xl font-black text-yellow-400">£{price}</span>
                            </div>
                        </div>

                        {/* ETA */}
                        <div className="bg-black/50 rounded-xl p-3 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-500">Estimated pickup</p>
                                <p className="font-bold text-green-400">4 minutes</p>
                            </div>
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Payment;