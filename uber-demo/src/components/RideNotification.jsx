import { useState, useEffect, useRef } from 'react';

function RideNotification({ ride, onAccept, onDecline }) {
    const [timeLeft, setTimeLeft] = useState(15);
    const intervalRef = useRef(null);

    const playSound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch {
            // AudioContext not available
        }
    };

    useEffect(() => {
        playSound();
        intervalRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current);
                    onDecline();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(intervalRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const truncate = (str, n) => str && str.length > n ? str.slice(0, n) + '…' : str || '';

    const driverEarnings = ride?.price ? (parseFloat(ride.price) * 0.8).toFixed(2) : '0.00';

    return (
        <div
            className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4"
            style={{ animation: 'slideDown 0.4s ease-out' }}
        >
            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>

            <div className="w-full max-w-sm bg-gray-900 border border-yellow-400/40 rounded-2xl p-5 shadow-2xl shadow-yellow-400/10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                        <span className="text-yellow-400 font-black text-sm uppercase tracking-wider">New Ride Available</span>
                    </div>
                    <span className="text-2xl font-black text-white">{timeLeft}s</span>
                </div>

                {/* Countdown bar */}
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-5">
                    <div
                        className="h-full bg-yellow-400 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(timeLeft / 15) * 100}%` }}
                    />
                </div>

                {/* Customer info */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-yellow-400/10 border border-yellow-400/30 rounded-full flex items-center justify-center text-lg">
                        👤
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">{ride?.userName || 'Customer'}</p>
                        <p className="text-gray-400 text-xs">Ride request</p>
                    </div>
                </div>

                {/* Route */}
                <div className="bg-black rounded-xl p-3 mb-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{truncate(ride?.pickup, 30)}</p>
                    </div>
                    <div className="w-px h-3 bg-gray-700 ml-1" />
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                        <p className="text-sm text-gray-300 truncate">{truncate(ride?.destination, 30)}</p>
                    </div>
                </div>

                {/* Trip details */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="text-center">
                        <p className="text-xs text-gray-500">Distance</p>
                        <p className="text-sm font-bold text-white">{ride?.distance || '—'}</p>
                    </div>
                    <div className="text-center border-x border-gray-800">
                        <p className="text-xs text-gray-500">Duration</p>
                        <p className="text-sm font-bold text-white">{ride?.duration || '—'}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-gray-500">Your cut</p>
                        <p className="text-sm font-black text-yellow-400">£{driverEarnings}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-5 bg-black rounded-xl px-4 py-3">
                    <span className="text-gray-400 text-sm">Total fare</span>
                    <span className="text-white font-black text-lg">£{parseFloat(ride?.price || 0).toFixed(2)}</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onDecline}
                        className="flex-1 py-3 bg-gray-800 text-gray-300 font-bold rounded-xl hover:bg-gray-700 transition border border-gray-700"
                    >
                        Decline
                    </button>
                    <button
                        onClick={onAccept}
                        className="flex-2 flex-grow py-3 bg-green-500 text-white font-black rounded-xl hover:bg-green-400 transition shadow-lg shadow-green-500/25"
                    >
                        Accept Ride
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RideNotification;
