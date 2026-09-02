// ProtectedRoute.jsx — guards customer pages.
// Not signed in → /login (remembering where they were heading).
// Signed in but unverified → "verify your email" card with working resend/refresh.

import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

function ProtectedRoute({ children }) {
    const { user, emailVerified, refreshUser } = useAuth();
    const location = useLocation();

    const [sending,  setSending]  = useState(false);
    const [checking, setChecking] = useState(false);
    const [notice,   setNotice]   = useState(null); // { type: 'success' | 'error', text }

    // Not logged in — send to login and come back here afterwards
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

    // Logged in but email not verified
    if (!emailVerified) {
        const handleResend = async () => {
            if (sending) return;
            setSending(true);
            setNotice(null);
            try {
                await sendEmailVerification(user);
                setNotice({ type: 'success', text: 'Verification email sent — check your inbox and spam folder.' });
            } catch (err) {
                setNotice({
                    type: 'error',
                    text: err?.code === 'auth/too-many-requests'
                        ? 'Too many requests — wait a few minutes before trying again.'
                        : 'Could not send the email. Please try again.',
                });
            } finally {
                setSending(false);
            }
        };

        const handleRefresh = async () => {
            if (checking) return;
            setChecking(true);
            setNotice(null);
            try {
                const ok = await refreshUser();
                if (!ok) setNotice({ type: 'error', text: 'Not verified yet — open the link in your email, then tap this again.' });
            } catch {
                // Stale/expired session: a full reload re-runs the auth listener.
                window.location.reload();
            } finally {
                setChecking(false);
            }
        };

        return (
            <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col items-center justify-center px-4 py-8 pb-safe">
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 w-full max-w-md text-center">
                    {/* Envelope — SVG rather than an emoji so it renders identically everywhere */}
                    <div className="w-16 h-16 bg-yellow-400/10 border border-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-5" aria-hidden="true">
                        <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black mb-2">Verify your email</h2>
                    <p className="text-gray-400 text-sm mb-1">We sent a verification link to</p>
                    <p className="text-yellow-400 font-semibold text-sm mb-5 break-words">{user.email}</p>
                    <p className="text-gray-500 text-xs mb-6 leading-relaxed">
                        Click the link in the email, then come back here and tap "I've verified".
                    </p>

                    <div aria-live="polite" aria-atomic="true">
                        {notice && (
                            <div
                                role={notice.type === 'error' ? 'alert' : 'status'}
                                className={`rounded-xl px-4 py-3 mb-4 text-sm text-left ${notice.type === 'error'
                                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                                    : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}
                            >
                                {notice.text}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={checking}
                        className={`w-full py-3 mb-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition disabled:opacity-60 disabled:cursor-not-allowed ${ring}`}
                    >
                        {checking ? 'Checking…' : "I've verified — continue"}
                    </button>
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={sending}
                        className={`w-full py-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition disabled:opacity-60 disabled:cursor-not-allowed ${ring}`}
                    >
                        {sending ? 'Sending…' : 'Resend verification email'}
                    </button>
                </div>
            </div>
        );
    }

    return children;
}

export default ProtectedRoute;
