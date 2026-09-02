// NotFound.jsx — 404 page. Unknown routes used to bounce silently to the
// landing page; a typo'd or stale link now says so and offers a way home.

import { Link } from 'react-router-dom';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

function NotFound() {
    return (
        <div className="min-h-screen min-h-dvh bg-black text-white flex flex-col items-center justify-center px-5 py-8 pb-safe text-center">
            <Link to="/" aria-label="RideX home" className={`flex items-center gap-2 rounded-lg mb-8 ${ring}`}>
                <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
                    <span className="text-black font-black">R</span>
                </div>
                <span className="text-2xl font-black">RideX</span>
            </Link>

            <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest mb-2">Error 404</p>
            <h1 className="text-2xl sm:text-3xl font-black mb-2">Page not found</h1>
            <p className="text-gray-400 text-sm max-w-sm mb-8 leading-relaxed">
                The link you followed may be broken, or the page may have moved.
            </p>

            <Link
                to="/"
                className={`inline-flex items-center justify-center px-6 py-3 min-h-[44px] bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition ${ring}`}
            >
                Go home
            </Link>
        </div>
    );
}

export default NotFound;
