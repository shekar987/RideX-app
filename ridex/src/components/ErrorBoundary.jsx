// ErrorBoundary.jsx — last line of defence for render errors.
// Mounted twice in App.js: once outside the Router (catches everything) and once
// inside, keyed on the pathname, so a crash on one page resets on navigation.

import { Component } from 'react';
import { isChunkLoadError } from '../utils/lazyRetry';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        if (process.env.NODE_ENV === 'development') {
            // Component stack is useful for debugging locally but must not
            // appear in production consoles where it reveals internal paths.
            console.error('Uncaught error:', error, info.componentStack);
        }
        // In production wire this to an error-tracking service, e.g.:
        // Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }

    // Reset the boundary in place — enough for transient render errors
    handleRetry = () => this.setState({ hasError: false, error: null });

    // A rejected lazy() chunk is cached by React forever; only a reload recovers it
    handleReload = () => window.location.reload();

    // Full navigation (not SPA) so corrupt in-memory state is discarded too
    handleHome = () => window.location.assign('/');

    render() {
        if (!this.state.hasError) return this.props.children;

        const chunk       = isChunkLoadError(this.state.error);
        const showDetails = process.env.NODE_ENV === 'development' && this.state.error?.message;

        return (
            <div
                role="alert"
                className="min-h-screen min-h-dvh bg-black text-white flex flex-col items-center justify-center px-4 py-8 pb-safe"
            >
                <div className="text-center w-full max-w-md">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6" aria-hidden="true">
                        {/* Warning triangle — SVG rather than a glyph so it renders the same on every platform */}
                        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>

                    <h1 className="text-xl sm:text-2xl font-black mb-2">
                        {chunk ? 'Update available' : 'Something went wrong'}
                    </h1>
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                        {chunk
                            ? 'A newer version of RideX has been published. Reload to continue.'
                            : 'An unexpected error occurred. Your ride data is safe.'}
                    </p>

                    {showDetails && (
                        <p className="text-red-400 text-xs font-mono bg-gray-900 rounded-lg px-3 py-2 mb-6 break-words text-left">
                            {this.state.error.message}
                        </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            type="button"
                            onClick={chunk ? this.handleReload : this.handleRetry}
                            className="px-6 py-3 min-h-[44px] bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                        >
                            {chunk ? 'Reload' : 'Try again'}
                        </button>
                        <button
                            type="button"
                            onClick={this.handleHome}
                            className="px-6 py-3 min-h-[44px] border border-gray-700 text-gray-300 font-bold rounded-xl hover:border-gray-500 transition"
                        >
                            Go to home
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
