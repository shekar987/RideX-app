import { useNavigate } from 'react-router-dom';

function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-black text-white overflow-hidden">
            {/* Navbar */}
            <nav className="flex justify-between items-center px-8 py-5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-black font-black text-sm">R</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight">RideX</h1>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/login')}
                        className="px-5 py-2 text-sm text-white border border-gray-700 rounded-full hover:border-white transition"
                    >
                        Log in
                    </button>
                    <button
                        onClick={() => navigate('/register')}
                        className="px-5 py-2 text-sm bg-yellow-400 text-black rounded-full font-bold hover:bg-yellow-300 transition"
                    >
                        Sign up free
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="flex flex-col lg:flex-row items-center justify-between px-8 lg:px-16 pt-16 pb-8 max-w-7xl mx-auto">
                {/* Left */}
                <div className="flex-1 max-w-xl">
                    <div className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2 mb-6">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-sm text-gray-400">Available 24/7 across the UK</span>
                    </div>

                    <h2 className="text-5xl lg:text-6xl font-black leading-tight mb-6">
                        Your ride,<br />
                        <span className="text-yellow-400">on demand.</span>
                    </h2>

                    <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                        Book a ride in seconds. Track your driver in real time. Pay seamlessly — no cash needed.
                    </p>

                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={() => navigate('/register')}
                            className="px-8 py-4 bg-yellow-400 text-black text-base font-black rounded-full hover:bg-yellow-300 transition shadow-lg shadow-yellow-400/20"
                        >
                            Book a ride →
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className="px-8 py-4 bg-gray-900 text-white text-base font-semibold rounded-full hover:bg-gray-800 transition border border-gray-700"
                        >
                            Log in
                        </button>
                    </div>

                    <div className="flex gap-4 mb-12">
                        <button
                            onClick={() => navigate('/register')}
                            className="flex-1 py-3 bg-yellow-400 text-black font-black rounded-full hover:bg-yellow-300 transition"
                        >
                            🧑 I'm a Customer
                        </button>
                        <button
                            onClick={() => navigate('/driver/login')}
                            className="flex-1 py-3 bg-gray-900 text-white font-black rounded-full border border-yellow-400 hover:bg-gray-800 transition"
                        >
                            🚗 I'm a Driver
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-6 border-t border-gray-800 pt-8">
                        <div>
                            <p className="text-2xl font-black text-yellow-400">50K+</p>
                            <p className="text-sm text-gray-500">Rides completed</p>
                        </div>
                        <div>
                            <p className="text-2xl font-black text-yellow-400">4.9★</p>
                            <p className="text-sm text-gray-500">Average rating</p>
                        </div>
                        <div>
                            <p className="text-2xl font-black text-yellow-400">3 min</p>
                            <p className="text-sm text-gray-500">Avg pickup time</p>
                        </div>
                    </div>
                </div>

                {/* Right — Map Card */}
                <div className="flex-1 flex justify-center mt-12 lg:mt-0">
                    <div className="relative w-80">
                        <div className="w-80 h-96 bg-gray-900 rounded-3xl overflow-hidden border border-gray-800 relative">
                            {/* Fake map grid */}
                            <div className="absolute inset-0 opacity-20">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="absolute" style={{
                                        left: `${i * 14}%`, top: 0, bottom: 0, width: '1px',
                                        borderLeft: '1px solid #4B5563'
                                    }} />
                                ))}
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="absolute" style={{
                                        top: `${i * 14}%`, left: 0, right: 0, height: '1px',
                                        borderTop: '1px solid #4B5563'
                                    }} />
                                ))}
                            </div>

                            {/* Route Line */}
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 384">
                                <path
                                    d="M 80 300 Q 120 200 160 180 Q 200 160 240 100"
                                    stroke="#FACC15" strokeWidth="3" fill="none" strokeDasharray="8 4"
                                />
                                <circle cx="80" cy="300" r="8" fill="#22C55E" />
                                <circle cx="80" cy="300" r="14" fill="#22C55E" fillOpacity="0.2" />
                                <circle cx="240" cy="100" r="8" fill="#EF4444" />
                                <circle cx="240" cy="100" r="14" fill="#EF4444" fillOpacity="0.2" />
                                <circle cx="160" cy="180" r="10" fill="#FACC15" />
                                <circle cx="160" cy="180" r="18" fill="#FACC15" fillOpacity="0.2" />
                            </svg>

                            {/* Driver Card Overlay */}
                            <div className="absolute bottom-4 left-4 right-4 bg-black/90 backdrop-blur rounded-2xl p-4 border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center text-lg">
                                        👨
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm">James Wilson</p>
                                        <p className="text-gray-400 text-xs">Toyota Camry • ABC 1234</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-yellow-400 font-black text-sm">2 min</p>
                                        <p className="text-gray-400 text-xs">away</p>
                                    </div>
                                </div>
                                <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-yellow-400 rounded-full w-2/3 animate-pulse"></div>
                                </div>
                            </div>
                        </div>

                        <div className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                            Driver nearby
                        </div>
                    </div>
                </div>
            </div>

            {/* Features Row */}
            <div className="border-t border-gray-800 mt-8">
                <div className="grid grid-cols-1 md:grid-cols-3 max-w-7xl mx-auto">
                    {[
                        { icon: '⚡', title: 'Instant booking', desc: 'Matched with a driver in under 60 seconds' },
                        { icon: '🛡️', title: 'Safe & verified', desc: 'Every driver is background checked & rated' },
                        { icon: '💳', title: 'Cashless payments', desc: 'Pay by card, Apple Pay or Google Pay' },
                    ].map((f, i) => (
                        <div key={i} className={`px-10 py-8 ${i < 2 ? 'border-b md:border-b-0 md:border-r border-gray-800' : ''}`}>
                            <div className="text-3xl mb-3">{f.icon}</div>
                            <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                            <p className="text-gray-500 text-sm">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default LandingPage;
