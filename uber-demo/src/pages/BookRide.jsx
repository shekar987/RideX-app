import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41],
});

const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41],
});

// Haversine distance formula
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Auto-fit map to markers
function FitMap({ coords }) {
    const map = useMap();
    useEffect(() => {
        if (coords.length === 2) {
            map.fitBounds(coords, { padding: [60, 60] });
        }
    }, [coords, map]);
    return null;
}

// Location search with Nominatim
function LocationInput({ label, color, value, onChange, onSelect }) {
    const [query, setQuery] = useState(value?.name || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const timeoutRef = useRef(null);

    const search = (q) => {
        setQuery(q);
        clearTimeout(timeoutRef.current);
        if (q.length < 3) { setResults([]); return; }
        setLoading(true);
        timeoutRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=4`
                );
                const data = await res.json();
                setResults(data);
            } catch (e) {
                setResults([]);
            }
            setLoading(false);
        }, 500);
    };

    const select = (place) => {
        setQuery(place.display_name.split(',').slice(0, 2).join(','));
        setResults([]);
        onSelect({ name: place.display_name, lat: parseFloat(place.lat), lng: parseFloat(place.lon) });
    };

    return (
        <div className="relative">
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-3 h-3 rounded-full ${color === 'green' ? 'bg-green-400' : 'bg-red-400'} flex-shrink-0`}></div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => search(e.target.value)}
                    placeholder={label}
                    className="flex-1 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm"
                />
                {loading && (
                    <svg className="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                )}
            </div>
            {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl z-50 overflow-hidden shadow-xl">
                    {results.map((r) => (
                        <div
                            key={r.place_id}
                            onClick={() => select(r)}
                            className="px-4 py-3 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
                        >
                            📍 {r.display_name.split(',').slice(0, 3).join(',')}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function BookRide() {
    const navigate = useNavigate();
    const { user, logout, setRideDetails } = useAuth();
    const [pickup, setPickup] = useState(null);
    const [destination, setDestination] = useState(null);
    const [selectedRide, setSelectedRide] = useState('Economy');
    const [passengers, setPassengers] = useState(1);
    const [price, setPrice] = useState(null);
    const [distance, setDistance] = useState(null);
    const [duration, setDuration] = useState(null);
    const [loading, setLoading] = useState(false);

    const rideTypes = [
        { name: 'Economy', icon: '🚗', desc: '1-4 passengers', ratePerKm: 1.2 },
        { name: 'Comfort', icon: '🚙', desc: 'Extra legroom', ratePerKm: 1.8 },
        { name: 'XL', icon: '🚐', desc: 'Up to 6 passengers', ratePerKm: 2.4 },
    ];

    const calculatePrice = () => {
        if (!pickup || !destination) return;
        setLoading(true);
        setTimeout(() => {
            const km = getDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
            const rate = rideTypes.find(r => r.name === selectedRide).ratePerKm;
            const baseFare = 2.5;
            const passengerMultiplier = 1 + (passengers - 1) * 0.1;
            const total = (baseFare + km * rate * passengerMultiplier).toFixed(2);
            const mins = Math.round((km / 40) * 60);
            setDistance(km.toFixed(1));
            setDuration(mins);
            setPrice(total);
            setLoading(false);
        }, 1500);
    };

    const handleConfirm = () => {
        setRideDetails({
            pickup: pickup?.name?.split(',').slice(0, 2).join(','),
            destination: destination?.name?.split(',').slice(0, 2).join(','),
            price, rideType: selectedRide, distance, duration, passengers
        });
        navigate('/payment');
    };

    const mapCoords = pickup && destination
        ? [[pickup.lat, pickup.lng], [destination.lat, destination.lng]]
        : [];

    const mapCenter = pickup
        ? [pickup.lat, pickup.lng]
        : [51.505, -0.09];

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navbar */}
            <nav className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center">
                        <span className="text-black font-black text-xs">R</span>
                    </div>
                    <h1 className="text-lg font-black">RideX</h1>
                </div>
                <div className="flex items-center gap-4">
                    <p className="text-gray-400 text-sm hidden md:block">
                        Hi, {user?.name || user?.email} 👋
                    </p>
                    <button
                        onClick={() => { logout(); navigate('/'); }}
                        className="text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            <div className="flex flex-col lg:flex-row max-w-7xl mx-auto px-6 py-8 gap-8">

                {/* Left — Form */}
                <div className="w-full lg:w-96 flex-shrink-0">
                    <h2 className="text-3xl font-black mb-1">Where to?</h2>
                    <p className="text-gray-500 mb-6 text-sm">Search for any location worldwide</p>

                    {/* Location Inputs */}
                    <div className="bg-gray-900 rounded-2xl p-1 mb-5 border border-gray-800 relative z-10">
                        <LocationInput
                            label="Pickup location"
                            color="green"
                            value={pickup}
                            onSelect={setPickup}
                        />
                        <div className="h-px bg-gray-800 mx-4"></div>
                        <LocationInput
                            label="Destination"
                            color="red"
                            value={destination}
                            onSelect={setDestination}
                        />
                    </div>

                    {/* Passengers */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-5">
                        <p className="text-sm text-gray-500 mb-3">Passengers</p>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setPassengers(Math.max(1, passengers - 1))}
                                className="w-9 h-9 bg-gray-800 rounded-full text-xl font-bold hover:bg-gray-700 transition flex items-center justify-center"
                            >
                                −
                            </button>
                            <span className="text-2xl font-black w-8 text-center">{passengers}</span>
                            <button
                                onClick={() => setPassengers(Math.min(6, passengers + 1))}
                                className="w-9 h-9 bg-gray-800 rounded-full text-xl font-bold hover:bg-gray-700 transition flex items-center justify-center"
                            >
                                +
                            </button>
                            <span className="text-gray-500 text-sm ml-2">
                                {passengers === 1 ? '1 passenger' : `${passengers} passengers`}
                            </span>
                        </div>
                    </div>

                    {/* Ride Types */}
                    <p className="text-sm text-gray-500 mb-3">Select ride type</p>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        {rideTypes.map((ride) => (
                            <div
                                key={ride.name}
                                onClick={() => { setSelectedRide(ride.name); setPrice(null); }}
                                className={`rounded-2xl p-3 text-center cursor-pointer transition border
                  ${selectedRide === ride.name
                                        ? 'bg-yellow-400 text-black border-yellow-400'
                                        : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600'}`}
                            >
                                <div className="text-2xl mb-1">{ride.icon}</div>
                                <p className="text-xs font-black">{ride.name}</p>
                                <p className={`text-xs mt-0.5 ${selectedRide === ride.name ? 'text-black/60' : 'text-gray-600'}`}>
                                    £{ride.ratePerKm}/km
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Estimate Button */}
                    <button
                        onClick={calculatePrice}
                        disabled={!pickup || !destination || loading}
                        className={`w-full py-4 font-black rounded-2xl transition text-base mb-4
              ${pickup && destination
                                ? 'bg-white text-black hover:bg-gray-100 cursor-pointer'
                                : 'bg-gray-900 text-gray-600 cursor-not-allowed border border-gray-800'}`}
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Calculating...
                            </span>
                        ) : 'Get Price Estimate'}
                    </button>

                    {/* Price Result */}
                    {price && (
                        <div className="bg-gray-900 border border-yellow-400/30 rounded-2xl p-5">
                            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                                <div className="bg-black/50 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Fare</p>
                                    <p className="text-xl font-black text-yellow-400">£{price}</p>
                                </div>
                                <div className="bg-black/50 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Distance</p>
                                    <p className="text-xl font-black">{distance} km</p>
                                </div>
                                <div className="bg-black/50 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Est. Time</p>
                                    <p className="text-xl font-black">{duration} min</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 bg-black/50 rounded-xl p-3 mb-4">
                                <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center text-base">
                                    👨
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">James Wilson</p>
                                    <p className="text-xs text-gray-500">Toyota Camry • ★ 4.9 • 2 min away</p>
                                </div>
                                <div className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            </div>

                            <button
                                onClick={handleConfirm}
                                className="w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300 transition"
                            >
                                Confirm Ride — £{price} →
                            </button>
                        </div>
                    )}
                </div>

                {/* Right — Real Map */}
                <div className="flex-1 rounded-3xl overflow-hidden border border-gray-800" style={{ height: '600px', zIndex: 0 }}>
                    <MapContainer
                        center={mapCenter}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={true}
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; OpenStreetMap contributors'
                        />
                        {pickup && (
                            <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon}>
                                <Popup>📍 Pickup: {pickup.name.split(',')[0]}</Popup>
                            </Marker>
                        )}
                        {destination && (
                            <Marker position={[destination.lat, destination.lng]} icon={redIcon}>
                                <Popup>🏁 Destination: {destination.name.split(',')[0]}</Popup>
                            </Marker>
                        )}
                        {mapCoords.length === 2 && (
                            <>
                                <Polyline positions={mapCoords} color="#FACC15" weight={4} dashArray="10 6" />
                                <FitMap coords={mapCoords} />
                            </>
                        )}
                    </MapContainer>
                </div>

            </div>
        </div>
    );
}

export default BookRide;