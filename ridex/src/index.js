import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

// ── Mount ─────────────────────────────────────────────────────────────────────
const container = document.getElementById('root');
if (container) {
    ReactDOM.createRoot(container).render(
        <AuthProvider>
            <App />
        </AuthProvider>
    );
}

// ── Service worker (production only) ─────────────────────────────────────────
// The SW file is served from /sw.js (public/ directory). When a NEW worker takes
// control — i.e. a fresh deploy while this tab was open — reload once so the
// page stops running stale cached bundles. `hadController` skips the very first
// install and `reloaded` guards against loops.
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const hadController = !!navigator.serviceWorker.controller;
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || reloaded) return;
            reloaded = true;
            window.location.reload();
        });
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // SW registration failure is non-fatal; the app works without it.
        });
    });
}
