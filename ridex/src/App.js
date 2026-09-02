import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DriverRoute from './components/DriverRoute';
import AdminRoute from './components/AdminRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { lazyRetry } from './utils/lazyRetry';

// ── Code-split every route ────────────────────────────────────────────────────
// lazyRetry() retries a failed chunk load once and then reloads the page once —
// after a deploy, phones with the old index.html open would otherwise crash.
const LandingPage = lazy(lazyRetry(() => import('./pages/LandingPage')));
const Login       = lazy(lazyRetry(() => import('./pages/Login')));
const Register    = lazy(lazyRetry(() => import('./pages/Register')));
const BookRide    = lazy(lazyRetry(() => import('./pages/BookRide')));
const Payment     = lazy(lazyRetry(() => import('./pages/Payment')));
const RideStatus  = lazy(lazyRetry(() => import('./pages/RideStatus')));
const RideHistory = lazy(lazyRetry(() => import('./pages/RideHistory')));
const Legal       = lazy(lazyRetry(() => import('./pages/Legal')));
const NotFound    = lazy(lazyRetry(() => import('./pages/NotFound')));
// Driver pages
const DriverLogin     = lazy(lazyRetry(() => import('./pages/driver/DriverLogin')));
const DriverDashboard = lazy(lazyRetry(() => import('./pages/driver/DriverDashboard')));
// Admin pages
const AdminLogin     = lazy(lazyRetry(() => import('./pages/admin/AdminLogin')));
const AdminDashboard = lazy(lazyRetry(() => import('./pages/admin/AdminDashboard')));

// ── Page-level loading skeleton ───────────────────────────────────────────────
// Shown while a route chunk is downloading (typically < 200 ms on broadband,
// ~1–3 s on 3G).  Matches the app's black background so there's no flash.
function PageLoader() {
    return (
        <div
            className="min-h-screen min-h-dvh bg-black flex items-center justify-center"
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

// ── Per-route error boundary ──────────────────────────────────────────────────
// Keyed on the pathname so a render crash on one page is reset by navigating
// away, instead of blanking the whole app until a hard reload.
function RouteErrorBoundary({ children }) {
    const { pathname } = useLocation();
    return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

// AppRoutes is exported so tests can wrap it in MemoryRouter
// without nesting inside BrowserRouter.
export function AppRoutes() {
    return (
        <RouteErrorBoundary>
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/"                 element={<LandingPage />} />
                    <Route path="/login"            element={<Login />} />
                    <Route path="/register"         element={<Register />} />
                    <Route path="/book"             element={<ProtectedRoute><BookRide /></ProtectedRoute>} />
                    <Route path="/payment"          element={<ProtectedRoute><Payment /></ProtectedRoute>} />
                    <Route path="/status"           element={<ProtectedRoute><RideStatus /></ProtectedRoute>} />
                    <Route path="/status/:rideId"   element={<ProtectedRoute><RideStatus /></ProtectedRoute>} />
                    <Route path="/history"          element={<ProtectedRoute><RideHistory /></ProtectedRoute>} />
                    <Route path="/terms"            element={<Legal kind="terms" />} />
                    <Route path="/privacy"          element={<Legal kind="privacy" />} />
                    <Route path="/driver/login"     element={<DriverLogin />} />
                    <Route path="/driver/dashboard" element={<DriverRoute><DriverDashboard /></DriverRoute>} />
                    <Route path="/admin/login"      element={<AdminLogin />} />
                    <Route path="/admin/dashboard"  element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                    <Route path="*"                 element={<NotFound />} />
                </Routes>
            </Suspense>
        </RouteErrorBoundary>
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
