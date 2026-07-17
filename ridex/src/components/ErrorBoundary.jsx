import { Component } from 'react';

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

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="text-red-400 text-3xl">⚠</span>
                    </div>
                    <h1 className="text-2xl font-black mb-2">Something went wrong</h1>
                    <p className="text-gray-400 text-sm mb-4">
                        An unexpected error occurred. Your ride data is safe.
                    </p>
                    {this.state.error && (
                        <p className="text-red-400 text-xs font-mono bg-gray-900 rounded-lg px-3 py-2 mb-6 break-all">
                            {this.state.error.message}
                        </p>
                    )}
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.href = '/';
                        }}
                        className="px-6 py-3 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                    >
                        Return to Home
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
