import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { sendEmailVerification, reload } from 'firebase/auth';

function ProtectedRoute({ children }) {
    const { user } = useAuth();

    // Not logged in at all
    if (!user) return <Navigate to="/login" replace />;

    // Logged in but email not verified — show a blocking prompt.
    // The user stays on the same URL so after verification + page-refresh
    // they land where they intended.
    if (!user.emailVerified) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full max-w-md text-center">
                    <p className="text-4xl mb-4">📧</p>
                    <h2 className="text-2xl font-black mb-2">Verify your email</h2>
                    <p className="text-gray-400 text-sm mb-6">
                        Please check your inbox and click the verification link before booking a ride.
                        Once verified, refresh this page.
                    </p>
                    <button
                        onClick={() => sendEmailVerification(user).catch(() => {})}
                        className="w-full py-3 mb-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                    >
                        Resend Verification Email
                    </button>
                    <button
                        onClick={() => reload(user).catch(() => window.location.reload())}
                        className="w-full py-3 border border-gray-700 text-gray-400 font-bold rounded-xl hover:border-gray-500 transition"
                    >
                        I've verified — Refresh
                    </button>
                </div>
            </div>
        );
    }

    return children;
}

export default ProtectedRoute;
