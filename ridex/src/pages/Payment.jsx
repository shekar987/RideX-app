import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, PaymentRequestButtonElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { DRIVER_SHARE, PLATFORM_SHARE } from '../constants/fees';
import { fetchJson, getFunctionsBaseUrl, isAbortError } from '../utils/net';

// Loaded once at module level — never recreated on re-renders. loadStripe(undefined)
// rejects and leaves the Pay button disabled forever, so guard the key first.
const STRIPE_KEY    = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

const CARD_ELEMENT_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px', // < 16px makes iOS Safari zoom into the Stripe iframe on focus
      '::placeholder': { color: '#4B5563' },
    },
    invalid: {
      color: '#EF4444',
      iconColor: '#EF4444',
    },
  },
};

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// ── Payment method icons ──────────────────────────────────────────────────────

function IconCard() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function IconApple() {
  return (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

// ── Payment method cards data ─────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'card',   label: 'Card',       Icon: IconCard   },
  { id: 'apple',  label: 'Apple Pay',  Icon: IconApple  },
  { id: 'google', label: 'Google Pay', Icon: IconGoogle },
];

// ── Page chrome ───────────────────────────────────────────────────────────────
function Header({ onBack }) {
  return (
    <header className="flex items-center px-5 md:px-6 py-4 border-b border-gray-800">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to book ride"
        className={`flex items-center gap-2 text-gray-400 hover:text-white transition text-sm mr-4 px-2 py-2 -ml-2 ${ring} rounded`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <Link to="/" aria-label="RideX — home" className={`flex items-center gap-2 ${ring} rounded-lg`}>
        <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
          <span className="text-black font-black text-xs">R</span>
        </div>
        <span className="text-lg font-black">RideX</span>
      </Link>
    </header>
  );
}

// ── PaymentForm ───────────────────────────────────────────────────────────────

function PaymentForm({ price, rideDetails }) {
  const stripe   = useStripe();
  const elements = useElements();
  const navigate = useNavigate();

  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');
  const [selected,         setSelected]         = useState('card');
  const [paymentRequest,   setPaymentRequest]   = useState(null);
  const [nativePayType,    setNativePayType]    = useState(null); // 'applePay' | 'googlePay' | null
  const walletInFlightRef = useRef(false);

  const goToStatus = () => navigate(`/status/${rideDetails.rideId}`, { state: { ride: rideDetails } });

  // Calls the createPaymentIntent Cloud Function. Returns { res, data } or
  // throws a user-facing Error (config / session problems).
  const postPaymentIntent = async (paymentMethodId) => {
    const baseUrl = getFunctionsBaseUrl();
    if (!baseUrl) throw new Error('Payments are not configured for this deployment yet.');
    if (!auth.currentUser) throw new Error('Your session has expired. Please log in again.');
    const idToken = await auth.currentUser.getIdToken();
    return fetchJson(`${baseUrl}/createPaymentIntent`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ paymentMethodId, rideId: rideDetails.rideId }),
    }, { timeoutMs: 30000 });
  };

  // Maps a non-OK Cloud Function response to a message; 409 means the ride is
  // already paid — that is a success from the customer's point of view.
  const describeFailure = (res, data) => {
    if (res.status === 409) return null;
    if (res.status === 401) return 'Your session has expired. Please log in again.';
    if (res.status === 402 || res.status === 400) return data.error || 'Your card was declined. Please try another card.';
    if (res.status === 429) return 'Too many attempts — please wait a moment and try again.';
    return data.error || `Payment failed (error ${res.status}). Please try again.`;
  };

  // Initialise the PaymentRequest once Stripe is ready. canMakePayment() tells
  // us which native wallets are available on this device/browser combination.
  useEffect(() => {
    if (!stripe || !price) return;
    const pr = stripe.paymentRequest({
      country:  'GB',
      currency: 'gbp',
      total: { label: 'RideX Ride', amount: Math.round(price * 100) },
      requestPayerName: false,
    });
    pr.canMakePayment().then(result => {
      if (!result) return;
      setPaymentRequest(pr);
      if (result.applePay)  setNativePayType('applePay');
      else if (result.googlePay) setNativePayType('googlePay');
    }).catch(() => {});
  }, [stripe, price]);

  // Handle the native wallet payment sheet completing
  useEffect(() => {
    if (!paymentRequest) return;

    const handlePaymentMethod = async (ev) => {
      if (walletInFlightRef.current) { ev.complete('fail'); return; }
      walletInFlightRef.current = true;
      if (!auth.currentUser || !rideDetails.rideId) {
        ev.complete('fail');
        setError('Session expired or ride not found. Please start over.');
        walletInFlightRef.current = false;
        return;
      }
      try {
        const { res, data } = await postPaymentIntent(ev.paymentMethod.id);

        if (!res.ok) {
          const msg = describeFailure(res, data);
          if (msg === null) { ev.complete('success'); goToStatus(); return; } // already paid
          ev.complete('fail');
          setError(msg);
          return;
        }

        if (data.requiresAction) {
          // Confirm 3DS without re-calling the backend (avoids a double charge).
          const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
            data.clientSecret,
            { payment_method: ev.paymentMethod.id },
            { handleActions: false },
          );
          if (confirmError) { ev.complete('fail'); setError(confirmError.message); return; }
          if (paymentIntent?.status === 'requires_action') {
            // Stripe requires the wallet sheet to close before the 3DS challenge can show
            ev.complete('success');
            const { error: actionErr } = await stripe.confirmCardPayment(data.clientSecret);
            if (actionErr) { setError(`${actionErr.message} Your card has not been charged.`); return; }
          } else {
            ev.complete('success');
          }
          goToStatus();
          return;
        }
        if (!data.success) { ev.complete('fail'); setError(data.error || 'Payment failed.'); return; }
        ev.complete('success');
        goToStatus();
      } catch (err) {
        ev.complete('fail');
        setError(
          isAbortError(err)
            ? 'The payment server took too long to respond. Check "My Rides" before trying again.'
            : err?.message || 'Payment failed. Please check your connection and try again.'
        );
      } finally {
        walletInFlightRef.current = false;
      }
    };

    paymentRequest.on('paymentmethod', handlePaymentMethod);
    return () => paymentRequest.off('paymentmethod', handlePaymentMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRequest, stripe, rideDetails, navigate]);

  const handleCardPay = async () => {
    if (loading) return;
    setError('');
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please wait a moment and try again.');
      return;
    }
    if (!rideDetails.rideId) {
      setError('We could not find your saved ride. Please go back and book again.');
      return;
    }
    setLoading(true);

    try {
      const cardElement = elements.getElement(CardElement);
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });
      if (stripeError) { setError(stripeError.message); return; }

      const { res, data } = await postPaymentIntent(paymentMethod.id);

      if (!res.ok) {
        const msg = describeFailure(res, data);
        if (msg === null) { goToStatus(); return; } // already paid
        setError(msg);
        return;
      }

      if (data.requiresAction) {
        // 3D Secure step-up. Confirm directly with Stripe — do NOT call
        // createPaymentIntent again, that would charge the card a second time.
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) { setError(confirmError.message); return; }
        if (paymentIntent?.status !== 'succeeded') {
          setError('Payment could not be completed. Your card has not been charged. Please try again.');
          return;
        }
        goToStatus();
        return;
      }

      if (!data.success) {
        setError(data.error || 'Payment could not be completed. Please try again.');
        return;
      }

      goToStatus();
    } catch (err) {
      setError(
        isAbortError(err)
          ? 'The payment server took too long to respond. Check "My Rides" before trying again.'
          : err?.message || 'Payment failed. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col">
      <Header onBack={() => navigate('/book')} />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-5 md:px-6 py-8 md:py-10 pb-safe">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left — Payment form */}
          <section aria-labelledby="payment-heading" className="flex-1 lg:max-w-md">
            <h1 id="payment-heading" className="text-3xl font-black mb-1">Payment</h1>
            <p className="text-gray-500 text-sm mb-4">Choose your payment method</p>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-6">
              <p className="text-blue-400 text-sm font-semibold">
                Test mode — use card number{' '}
                <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
              </p>
            </div>

            {/* Live region for payment errors */}
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Payment method selector — fieldset groups them as a radio group */}
            <fieldset className="mb-6">
              <legend className="sr-only">Payment method</legend>
              <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup">
                {PAYMENT_METHODS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected === id}
                    onClick={() => setSelected(id)}
                    className={`rounded-2xl p-3 sm:p-4 min-h-[44px] text-center transition border flex flex-col items-center gap-1.5
                      ${ring}
                      ${selected === id
                        ? 'border-yellow-400 bg-yellow-400/10 text-white'
                        : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-white'}`}
                  >
                    <Icon />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Stripe card element */}
            {selected === 'card' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 mb-6">
                <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl p-5 mb-5 relative overflow-hidden" aria-hidden="true">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <p className="text-black/60 text-xs mb-6">RIDEX CARD</p>
                  <p className="text-black font-black text-lg tracking-widest mb-4">•••• •••• •••• ••••</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-black/50 text-xs">EXPIRES</p>
                      <p className="text-black font-bold text-sm">MM/YY</p>
                    </div>
                    <div className="flex gap-1">
                      <div className="w-8 h-8 bg-red-500 rounded-full opacity-80" />
                      <div className="w-8 h-8 bg-orange-400 rounded-full opacity-80 -ml-3" />
                    </div>
                  </div>
                </div>

                {/* A <label> cannot target Stripe's iframe — use a labelled group instead */}
                <p id="card-details-label" className="block text-xs text-gray-500 mb-2">Card details</p>
                <div
                  role="group"
                  aria-labelledby="card-details-label"
                  className="px-4 py-3 bg-black border border-gray-800 rounded-xl focus-within:border-yellow-400 transition"
                >
                  <CardElement options={CARD_ELEMENT_OPTIONS} />
                </div>
                <p className="text-gray-600 text-xs mt-2">
                  Your card details are handled securely by Stripe and never touch our servers.
                </p>
              </div>
            )}

            {/* Apple Pay / Google Pay — real wallet sheet or fallback */}
            {(selected === 'apple' || selected === 'google') && (
              <div className="mb-6">
                {paymentRequest && nativePayType ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
                    <p className="text-gray-400 text-xs mb-4 text-center">
                      {nativePayType === 'applePay' ? 'Apple Pay' : 'Google Pay'} detected — tap the button below to pay
                    </p>
                    <PaymentRequestButtonElement
                      options={{
                        paymentRequest,
                        style: {
                          paymentRequestButton: {
                            type:   'default',
                            theme:  'light',
                            height: '56px',
                          },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 text-center">
                    <div className="flex justify-center mb-3 text-gray-400">
                      {selected === 'apple' ? <IconApple /> : <IconGoogle />}
                    </div>
                    <p className="font-bold mb-1">{selected === 'apple' ? 'Apple Pay' : 'Google Pay'}</p>
                    <p className="text-gray-500 text-sm">
                      Not available on this device or browser. Use card payment instead.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Card pay button — only shown on card tab */}
            {selected === 'card' && (
              <button
                type="button"
                onClick={handleCardPay}
                disabled={loading || !stripe}
                className={`w-full py-4 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-300
                  transition text-lg shadow-lg shadow-yellow-400/20 disabled:opacity-60 disabled:cursor-not-allowed
                  flex items-center justify-center ${ring} ${ringOffset}`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Processing…
                  </>
                ) : `Pay £${price.toFixed(2)}`}
              </button>
            )}

            <div className="flex items-center justify-center gap-2 mt-4">
              <IconLock />
              <p className="text-gray-600 text-xs">Secured by Stripe · 256-bit SSL encryption</p>
            </div>
          </section>

          {/* Right — Order summary (shown ABOVE the form on phones so the total is visible before paying) */}
          <aside aria-label="Ride summary" className="lg:w-80 order-first lg:order-none">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 sm:p-6 lg:sticky lg:top-6">
              <h2 className="font-bold mb-5 text-lg">Ride Summary</h2>

              <div className="mb-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="mt-1 flex flex-col items-center gap-1 flex-shrink-0" aria-hidden="true">
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <div className="w-0.5 h-8 bg-gray-700" />
                    <div className="w-3 h-3 rounded-sm bg-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-3 break-words">{rideDetails?.pickup || 'Pickup location'}</p>
                    <p className="text-sm text-gray-400 break-words">{rideDetails?.destination || 'Destination'}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4 mb-4">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">{rideDetails?.rideType || 'Economy'} ride</span>
                    <span className="tabular-nums">£{(price * DRIVER_SHARE).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500">Service fee ({PLATFORM_SHARE * 100}%)</span>
                    <span className="tabular-nums">£{(price * PLATFORM_SHARE).toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t border-gray-800 pt-3 flex justify-between items-center gap-3">
                  <span className="font-bold">Total</span>
                  <span className="text-2xl font-black text-yellow-400 tabular-nums">£{price.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-black/50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Estimated pickup</p>
                  <p className="font-bold text-green-400">4 minutes</p>
                </div>
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" aria-hidden="true" />
              </div>
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

function Payment() {
  const { rideDetails: ctxRide } = useAuth();
  const { state } = useLocation();
  const navigate = useNavigate();
  const rideDetails = ctxRide ?? state?.ride;
  if (!rideDetails) return <Navigate to="/book" replace />;

  const price = parseFloat(rideDetails.price);
  // A missing/garbage price used to render "Pay £NaN" with a live button
  if (!Number.isFinite(price) || price <= 0) return <Navigate to="/book" replace />;

  if (!stripePromise) {
    return (
      <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col">
        <Header onBack={() => navigate('/book')} />
        <main className="flex-1 flex items-center justify-center px-5 py-10 pb-safe">
          <div role="alert" className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 w-full max-w-md text-center">
            <p className="text-white font-bold text-lg mb-2">Payments are not configured</p>
            <p className="text-gray-500 text-sm">
              Add <code className="bg-gray-800 px-1 rounded">REACT_APP_STRIPE_PUBLISHABLE_KEY</code> to the environment variables, then redeploy.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm price={price} rideDetails={rideDetails} />
    </Elements>
  );
}

export default Payment;
