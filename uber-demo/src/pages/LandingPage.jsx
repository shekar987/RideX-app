// LandingPage.jsx — RideX marketing homepage
// Semantic landmarks: header / main (hero + features + driver) / footer
// Mobile-first: nav collapses "Drive with us" below sm breakpoint

import { useNavigate } from 'react-router-dom';

// ── Feature icons — SVG instead of emoji for cross-platform consistency ──────
function IconBolt() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
    );
}
function IconShield() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
    );
}
function IconCard() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

const FEATURES = [
    { Icon: IconBolt,   title: 'Instant booking',   desc: 'Matched with a driver in under 60 seconds.' },
    { Icon: IconShield, title: 'Safe & verified',    desc: 'Every driver is background checked and rated.' },
    { Icon: IconCard,   title: 'Cashless payments',  desc: 'Pay by card, Apple Pay, or Google Pay.' },
];

const DRIVER_STATS = [
    { stat: '£800+',    label: 'Avg. weekly earnings' },
    { stat: 'Flexible', label: 'Work your own hours' },
    { stat: '24/7',     label: 'Driver support' },
];

const PORTAL_ROWS = [
    { label: "Today's earnings", value: '£124.50', valueClass: 'text-green-400',  dot: false },
    { label: 'Rides completed',  value: '8 rides', valueClass: 'text-yellow-400', dot: false },
    { label: 'Online status',    value: 'Active',  valueClass: 'text-green-400',  dot: true  },
    { label: 'Rating',           value: '4.9 / 5', valueClass: 'text-yellow-400', dot: false },
];

// Shared focus-visible ring classes used on all interactive elements
const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-black text-white overflow-x-hidden flex flex-col">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header>
                <nav
                    aria-label="Main navigation"
                    className="flex justify-between items-center px-5 md:px-8 py-4 border-b border-gray-800"
                >
                    {/* Brand — not a heading; the hero h1 is the page title */}
                    <a
                        href="/"
                        aria-label="RideX home"
                        className={`flex items-center gap-2 rounded-lg ${ring}`}
                    >
                        <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
                            <span className="text-black font-black text-sm">R</span>
                        </div>
                        <span className="text-xl font-black tracking-tight">RideX</span>
                    </a>

                    {/* Nav actions */}
                    <div className="flex gap-2 items-center">
                        {/* Hidden on mobile — avoid overflow on 375px */}
                        <button
                            onClick={() => navigate('/driver/login')}
                            className={`hidden sm:block px-4 py-2 text-sm text-gray-400 hover:text-white transition rounded-lg ${ring}`}
                        >
                            Drive with us
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className={`px-4 py-2 text-sm text-white border border-gray-700 rounded-full hover:border-white transition ${ring}`}
                        >
                            Log in
                        </button>
                        <button
                            onClick={() => navigate('/register')}
                            className={`px-4 py-2 text-sm bg-yellow-400 text-black rounded-full font-bold hover:bg-yellow-300 active:bg-yellow-500 transition ${ring} ${ringOffset}`}
                        >
                            Sign up
                        </button>
                    </div>
                </nav>
            </header>

            {/* ── Main ───────────────────────────────────────────────────── */}
            <main className="flex-1">

                {/* ── Hero ── */}
                <section
                    aria-labelledby="hero-heading"
                    className="flex flex-col lg:flex-row items-center justify-between px-5 md:px-8 lg:px-16 pt-14 pb-10 max-w-7xl mx-auto gap-12"
                >
                    {/* Left: copy */}
                    <div className="flex-1 max-w-xl w-full">
                        {/* Availability pill */}
                        <div className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2 mb-6">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" aria-hidden="true" />
                            <span className="text-sm text-gray-400">Available 24/7 across the UK</span>
                        </div>

                        {/* Primary heading — h1, not h2 */}
                        <h1
                            id="hero-heading"
                            className="text-5xl lg:text-6xl font-black leading-tight mb-6"
                        >
                            Your ride,<br />
                            <span className="text-yellow-400">on demand.</span>
                        </h1>

                        <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                            Book a ride in seconds. Track your driver in real time. Pay seamlessly — no cash needed.
                        </p>

                        <div className="flex flex-wrap gap-3 mb-8">
                            <button
                                onClick={() => navigate('/register')}
                                className={`px-8 py-4 bg-yellow-400 text-black text-base font-black rounded-full hover:bg-yellow-300 active:bg-yellow-500 transition shadow-lg shadow-yellow-400/20 ${ring} ${ringOffset}`}
                            >
                                Book a ride →
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className={`px-8 py-4 bg-gray-900 text-white text-base font-semibold rounded-full hover:bg-gray-800 transition border border-gray-700 ${ring}`}
                            >
                                Log in
                            </button>
                        </div>

                        {/* Social proof stats */}
                        <div className="grid grid-cols-3 gap-4 border-t border-gray-800 pt-6">
                            <div>
                                <p className="text-2xl font-black text-yellow-400">50K+</p>
                                <p className="text-sm text-gray-500">Rides completed</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-yellow-400">4.9<span aria-hidden="true">★</span></p>
                                <p className="text-sm text-gray-500">Average rating</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black text-yellow-400">3 min</p>
                                <p className="text-sm text-gray-500">Avg pickup time</p>
                            </div>
                        </div>
                    </div>

                    {/* Right: map illustration — decorative, hidden from assistive tech */}
                    <div className="flex-1 flex justify-center lg:justify-end" aria-hidden="true">
                        <div className="relative w-72 sm:w-80">
                            <div className="w-full h-96 bg-gray-900 rounded-3xl overflow-hidden border border-gray-800 relative">
                                {/* Map grid */}
                                <div className="absolute inset-0 opacity-20 pointer-events-none">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={`v${i}`} className="absolute top-0 bottom-0"
                                            style={{ left: `${i * 14}%`, width: '1px', background: '#4B5563' }} />
                                    ))}
                                    {[...Array(8)].map((_, i) => (
                                        <div key={`h${i}`} className="absolute left-0 right-0"
                                            style={{ top: `${i * 14}%`, height: '1px', background: '#4B5563' }} />
                                    ))}
                                </div>

                                {/* Route line + markers */}
                                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 384">
                                    <path
                                        d="M 80 300 Q 120 200 160 180 Q 200 160 240 100"
                                        stroke="#FACC15" strokeWidth="3" fill="none" strokeDasharray="8 4"
                                    />
                                    <circle cx="80"  cy="300" r="8"  fill="#22C55E" />
                                    <circle cx="80"  cy="300" r="14" fill="#22C55E" fillOpacity="0.2" />
                                    <circle cx="240" cy="100" r="8"  fill="#EF4444" />
                                    <circle cx="240" cy="100" r="14" fill="#EF4444" fillOpacity="0.2" />
                                    <circle cx="160" cy="180" r="10" fill="#FACC15" />
                                    <circle cx="160" cy="180" r="18" fill="#FACC15" fillOpacity="0.2" />
                                </svg>

                                {/* Driver info overlay */}
                                <div className="absolute bottom-4 left-4 right-4 bg-black/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                                            <span className="text-black font-black text-xs">JW</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm leading-tight">James Wilson</p>
                                            <p className="text-gray-400 text-xs truncate">Toyota Camry · ABC 1234</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-yellow-400 font-black text-sm">2 min</p>
                                            <p className="text-gray-400 text-xs">away</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-400 rounded-full w-2/3 animate-pulse" />
                                    </div>
                                </div>
                            </div>

                            {/* Nearby chip */}
                            <div className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                Driver nearby
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Features row ── */}
                <section aria-label="Platform features" className="border-t border-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-3 max-w-7xl mx-auto">
                        {FEATURES.map(({ Icon, title, desc }, i) => (
                            <div
                                key={title}
                                className={`px-8 md:px-10 py-8 ${i < FEATURES.length - 1 ? 'border-b md:border-b-0 md:border-r border-gray-800' : ''}`}
                            >
                                <div className="w-10 h-10 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center text-yellow-400 mb-4">
                                    <Icon />
                                </div>
                                <h2 className="font-bold text-lg mb-1">{title}</h2>
                                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Driver acquisition ── */}
                <section aria-labelledby="driver-heading" className="border-t border-gray-800">
                    <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-16 py-16 flex flex-col lg:flex-row items-center justify-between gap-12">

                        {/* Left: copy */}
                        <div className="flex-1 max-w-xl w-full">
                            <p className="text-yellow-400 text-sm font-bold uppercase tracking-widest mb-3">For Drivers</p>
                            <h2 id="driver-heading" className="text-4xl lg:text-5xl font-black leading-tight mb-4">
                                Earn on your<br />
                                <span className="text-yellow-400">own schedule.</span>
                            </h2>
                            <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                                Join thousands of drivers earning with RideX. Set your own hours, keep more of your fare, and get paid weekly.
                            </p>

                            {/* Driver perk stats */}
                            <div className="grid grid-cols-3 gap-3 mb-8">
                                {DRIVER_STATS.map(({ stat, label }) => (
                                    <div key={label} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
                                        <p className="text-white font-black text-lg">{stat}</p>
                                        <p className="text-gray-500 text-xs mt-0.5">{label}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => navigate('/driver/login?tab=register')}
                                    className={`px-8 py-4 bg-yellow-400 text-black text-base font-black rounded-full hover:bg-yellow-300 active:bg-yellow-500 transition shadow-lg shadow-yellow-400/20 ${ring} ${ringOffset}`}
                                >
                                    Become a Driver →
                                </button>
                                <button
                                    onClick={() => navigate('/driver/login')}
                                    className={`px-8 py-4 bg-gray-900 text-white text-base font-semibold rounded-full hover:bg-gray-800 transition border border-gray-700 ${ring}`}
                                >
                                    Driver Login
                                </button>
                            </div>
                        </div>

                        {/* Right: driver portal preview card — decorative */}
                        <div className="flex-1 flex justify-center lg:justify-end" aria-hidden="true">
                            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-sm">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                                        {/* Car icon instead of emoji */}
                                        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2h1l2-4h12l2 4h1a2 2 0 012 2v6a2 2 0 01-2 2h-2" />
                                            <circle cx="7" cy="17" r="2" />
                                            <circle cx="17" cy="17" r="2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-bold">Driver Portal</p>
                                        <p className="text-gray-500 text-sm">Manage rides &amp; earnings</p>
                                    </div>
                                </div>

                                {PORTAL_ROWS.map(({ label, value, valueClass, dot }) => (
                                    <div key={label} className="flex justify-between items-center py-3 border-b border-gray-800 last:border-0">
                                        <span className="text-gray-400 text-sm">{label}</span>
                                        <span className={`font-bold text-sm flex items-center gap-1.5 ${valueClass}`}>
                                            {dot && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <footer className="border-t border-gray-800 px-5 md:px-8 py-5">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2" aria-hidden="true">
                        <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                            <span className="text-black font-black text-[10px]">R</span>
                        </div>
                        <span className="text-white font-black text-sm tracking-tight">RideX</span>
                    </div>

                    <p className="text-gray-600 text-xs text-center order-last sm:order-none">
                        &copy; {new Date().getFullYear()} RideX. All rights reserved.
                    </p>

                    <nav aria-label="Footer links" className="flex gap-4">
                        <button
                            onClick={() => navigate('/driver/login?tab=register')}
                            className={`text-gray-500 hover:text-gray-300 text-xs transition rounded ${ring}`}
                        >
                            Drive with us
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className={`text-gray-500 hover:text-gray-300 text-xs transition rounded ${ring}`}
                        >
                            Sign in
                        </button>
                    </nav>
                </div>
            </footer>

        </div>
    );
}

export default LandingPage;
