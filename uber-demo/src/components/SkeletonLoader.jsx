// Reusable shimmer skeleton components.
// Use these while async data or lazy chunks are loading to avoid blank screens.

function Shimmer({ className = '' }) {
    return (
        <div
            className={`animate-pulse bg-gray-800 rounded-xl ${className}`}
            aria-hidden="true"
        />
    );
}

export function BookRideSkeleton() {
    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navbar */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
                <Shimmer className="w-20 h-7" />
                <Shimmer className="w-24 h-8 rounded-full" />
            </div>

            <div className="flex flex-col lg:flex-row max-w-7xl mx-auto px-6 py-8 gap-8">
                {/* Left form */}
                <div className="w-full lg:w-96 flex-shrink-0 space-y-5">
                    <Shimmer className="w-40 h-9" />
                    <Shimmer className="w-64 h-4" />
                    <Shimmer className="h-24 rounded-2xl" />
                    <Shimmer className="h-20 rounded-2xl" />
                    <div className="grid grid-cols-3 gap-3">
                        <Shimmer className="h-20 rounded-2xl" />
                        <Shimmer className="h-20 rounded-2xl" />
                        <Shimmer className="h-20 rounded-2xl" />
                    </div>
                    <Shimmer className="h-14 rounded-2xl" />
                </div>

                {/* Right map placeholder */}
                <Shimmer className="flex-1 rounded-3xl" style={{ height: '600px' }} />
            </div>
        </div>
    );
}

export function PaymentSkeleton() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4">
            <div className="w-full max-w-md space-y-5">
                <Shimmer className="w-32 h-8 mx-auto" />
                <Shimmer className="h-32 rounded-2xl" />
                <Shimmer className="h-16 rounded-2xl" />
                <Shimmer className="h-14 rounded-2xl" />
            </div>
        </div>
    );
}

export function RideStatusSkeleton() {
    return (
        <div className="min-h-screen bg-black text-white px-4 py-8">
            <div className="max-w-md mx-auto space-y-6">
                <Shimmer className="w-24 h-8" />
                <Shimmer className="h-48 rounded-2xl" />
                <Shimmer className="h-56 rounded-2xl" />
                <Shimmer className="h-24 rounded-2xl" />
            </div>
        </div>
    );
}
