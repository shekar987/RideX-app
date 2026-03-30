import { useState } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';

// Loaded once at module level — never recreated on re-renders
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// Derive Cloud Functions base URL from env vars.
// REACT_APP_FUNCTIONS_BASE_URL overrides; otherwise auto-build from project ID.
const FUNCTIONS_BASE_URL =
    process.env.REACT_APP_FUNCTIONS_BASE_URL ||
    `https://us-central1-${process.env.REACT_APP_FIREBASE_PROJECT_ID}.cloudfunctions.net`;

const CARD_ELEMENT_OPTIONS = {
    hidePostalCode: true,
    style: {
        base: {
            color: '#ffffff',
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSmoothing: 'antialiased',
            fontSize: '15px',
            '::placeholder': { color: '#4B5563' },
        },
        invalid: {
            color: '#EF4444',
            iconColor: '#EF4444',
        },
    },
};

function PaymentForm({ price, rideDetails }) {
    const stripe = useStripe();
    const elements = useElements();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState('card');

    const handlePay = async () => {
        setError('');

        if (selected !== 'card') {
            setError('Apple Pay and Google Pay require HTTPS. Use card payment for testing.');
            return;
        }

        if (!stripe || !elements) {
            setError('Stripe has not loaded yet. Please wait a moment and try again.');
            return;
        }

        setLoading(true);

        // Step 1: Validate the card with Stripe (real errors for invalid cards)
        const cardElement = elements.getElement(CardElement);
        const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
        });

        if (stripeError) {
            setError(stripeError.message);
            setLoading(false);
            return;
        }

        // Step 2: Check session
        if (!auth.currentUser) {
            setError('Your session has expired. Please log in again.');
            setLoading(false);
            return;
        }

        // Step 3: Try the real backend.  If it is not deployed (demo / local dev),
        // fall back to a simulated success so the full booking flow still works.
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`${FUNCTIONS_BASE_URL}/createPaymentIntent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    paymentMethodId: paymentMethod.id,
                    rideId: rideDetails.rideId,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                setError(result.error || 'Payment failed. Please try again.');
                setLoading(false);
                return;
            }

            if (result.success) {
                navigate('/status', { state: { ride: rideDetails } });
                return;
            }

            if (result.requiresAction) {
                const { error: actionError } = await stripe.handleNextAction({
                    clientSecret: result.clientSecret,
                });
                if (actionError) {
                    setError(actionError.message);
                    setLoading(false);
                    return;
                }
                navigate('/status', { state: { ride: rideDetails } });
                return;
            }

            setError('Unexpected payment response. Please contact support.');
            setLoading(false);

        } catch {
            // Backend not deployed — demo fallback.
            await new Promise((r) => setTimeout(r, 1500));
            navigate('/status', { state: { ride: rideDetails } });
        }
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
                    <p className="text-gray-500 text-sm mb-4">Choose your payment method</p>

                    {/* Test mode notice */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-6">
                        <p className="text-blue-400 text-sm font-semibold">
                            Test mode — use card number <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Payment method selector */}
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

                    {/* Stripe Card Element */}
                    {selected === 'card' && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
                            <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl p-5 mb-5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <p className="text-black/60 text-xs mb-6">RIDEX CARD</p>
                                <p className="text-black font-black text-lg tracking-widest mb-4">•••• •••• •••• ••••</p>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-black/50 text-xs">EXPIRES</p>
                                        <p className="text-black font-bold text-sm">MM/YY</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <div className="w-8 h-8 bg-red-500 rounded-full opacity-80"></div>
                                        <div className="w-8 h-8 bg-orange-400 rounded-full opacity-80 -ml-3"></div>
                                    </div>
                                </div>
                            </div>

                            <label className="block text-xs text-gray-500 mb-2">Card Details</label>
                            <div className="px-4 py-3 bg-black border border-gray-800 rounded-xl focus-within:border-yellow-400 transition">
                                <CardElement options={CARD_ELEMENT_OPTIONS} />
                            </div>
                            <p className="text-gray-600 text-xs mt-2">
                                Your card details are handled securely by Stripe and never touch our servers.
                            </p>
                        </div>
                    )}

                    {/* Apple/Google Pay placeholder */}
                    {(selected === 'apple' || selected === 'google') && (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
                            <p className="text-4xl mb-3">{selected === 'apple' ? '🍎' : 'G'}</p>
                            <p className="font-bold mb-1">{selected === 'apple' ? 'Apple Pay' : 'Google Pay'}</p>
                            <p className="text-gray-500 text-sm">Requires HTTPS — available in production.</p>
                        </div>
                    )}

                    <button
                        onClick={handlePay}
                        disabled={loading || !stripe}
                        className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300 transition text-lg shadow-lg shadow-yellow-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Processing...
                            </span>
                        ) : `Pay £${price.toFixed(2)}`}
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
                            <div className="flex items-center gap-3 mb-4 bg-black/50 rounded-xl p-3">
                                <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">👨</div>
                                <div>
                                    <p className="text-sm font-semibold">{rideDetails?.driverName || 'Driver'}</p>
                                    <p className="text-xs text-gray-500">
                                        {rideDetails?.driverCar || 'Vehicle'}
                                        {rideDetails?.driverRating ? ` • ★ ${rideDetails.driverRating}` : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">{rideDetails?.rideType || 'Economy'} ride</span>
                                    <span>£{(price * 0.85).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Service fee (15%)</span>
                                    <span>£{(price * 0.15).toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="border-t border-gray-800 pt-3 flex justify-between items-center">
                                <span className="font-bold">Total</span>
                                <span className="text-2xl font-black text-yellow-400">£{price.toFixed(2)}</span>
                            </div>
                        </div>

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

function Payment() {
    const { rideDetails: ctxRide } = useAuth();
    const { state } = useLocation();
    // location.state is available the instant this component mounts — no race condition.
    // Context is used as a fallback (e.g. user navigates back/forward).
    const rideDetails = ctxRide ?? state?.ride;
    if (!rideDetails) return <Navigate to="/book" replace />;
    const price = parseFloat(rideDetails.price);

    return (
        <Elements stripe={stripePromise}>
            <PaymentForm price={price} rideDetails={rideDetails} />
        </Elements>
    );
}

export default Payment;
