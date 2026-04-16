import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DriverRoute from './components/DriverRoute';
import ErrorBoundary from './components/ErrorBoundary';

// ── Code-split every route ────────────────────────────────────────────────────
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login       = lazy(() => import('./pages/Login'));
const Register    = lazy(() => import('./pages/Register'));
const BookRide    = lazy(() => import('./pages/BookRide'));
const Payment     = lazy(() => import('./pages/Payment'));
const RideStatus  = lazy(() => import('./pages/RideStatus'));
const RideHistory = lazy(() => import('./pages/RideHistory'));
// Import driver pages
const DriverLogin     = lazy(() => import('./pages/driver/DriverLogin'));
const DriverDashboard = lazy(() => import('./pages/driver/DriverDashboard'));

// ── Page-level loading skeleton ───────────────────────────────────────────────
// Shown while a route chunk is downloading (typically < 200 ms on broadband,
// ~1–3 s on 3G).  Matches the app's black background so there's no flash.
function PageLoader() {
    return (
        <div
            className="min-h-screen bg-black flex items-center justify-center"
            aria-label="Loading page"
            role="status"
        >
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-black font-black text-xl">R</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
            </div>
        </div>
    );
}

// AppRoutes is exported so tests can wrap it in MemoryRouter
// without nesting inside BrowserRouter.
export function AppRoutes() {
    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                <Route path="/"         element={<LandingPage />} />
                <Route path="/login"    element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/book"     element={<ProtectedRoute><BookRide /></ProtectedRoute>} />
                <Route path="/payment"  element={<ProtectedRoute><Payment /></ProtectedRoute>} />
                <Route path="/status"   element={<ProtectedRoute><RideStatus /></ProtectedRoute>} />
                <Route path="/history"      element={<ProtectedRoute><RideHistory /></ProtectedRoute>} />
                <Route path="/driver/login"      element={<DriverLogin />} />
                <Route path="/driver/dashboard" element={<DriverRoute><DriverDashboard /></DriverRoute>} />
                <Route path="*"                 element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

function App() {
    return (
        <ErrorBoundary>
            <Router>
                <AppRoutes />
            </Router>
        </ErrorBoundary>
    );
}

export default App;
