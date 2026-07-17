// BookRide.jsx — Ride booking page with Mapbox map + location search

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Token is applied per-map-instance inside MapDisplay to avoid crashing if env var is absent.

const KM_TO_MILES = 0.621371;

const RIDE_TYPES = [
    { id: 'economy', name: 'Economy', desc: '1–4 passengers', ratePerMile: 1.9 },
    { id: 'comfort', name: 'Comfort', desc: 'Extra legroom',   ratePerMile: 2.9 },
    { id: 'xl',      name: 'XL',      desc: 'Up to 6 seats',  ratePerMile: 3.9 },
];

const ring       = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const ringOffset = 'focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// ── Haversine distance ────────────────────────────────────────────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function Spinner({ size = 5 }) {
    return (
        <svg className={`animate-spin h-${size} w-${size} flex-shrink-0`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path  className="opacity-75"  fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    );
}

// Ride-type vehicle icons — one distinct SVG per tier
function RideIcon({ id, className = 'w-6 h-6' }) {
    if (id === 'economy') return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2h1l2-4h12l2 4h1a2 2 0 012 2v6a2 2 0 01-2 2h-2" />
            <circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" />
        </svg>
    );
    if (id === 'comfort') return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 17H3a2 2 0 01-2-2V9a2 2 0 012-2h1l2-4h12l2 4h1a2 2 0 012 2v6a2 2 0 01-2 2h-2" />
            <circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" />
            <path strokeLinecap="round" d="M9 11h6" />
        </svg>
    );
    // XL — boxy van silhouette
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <rect x="1" y="8" width="14" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12h6a1 1 0 011 1v4h-7V8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 8l2-4h10" />
            <circle cx="5"  cy="19" r="2" />
            <circle cx="13" cy="19" r="2" />
            <circle cx="20" cy="19" r="2" />
        </svg>
    );
}

// ── Mapbox map — initialise once, update markers on prop change ───────────────
function MapDisplay({ pickup, destination }) {
    const containerRef = useRef(null);
    const map          = useRef(null);
    const markersRef   = useRef([]);
    const token        = process.env.REACT_APP_MAPBOX_TOKEN;

    useEffect(() => {
        if (map.current || !containerRef.current || !token) return;
        mapboxgl.accessToken = token;
        map.current = new mapboxgl.Map({
            container: containerRef.current,
            style:     'mapbox://styles/mapbox/dark-v11',
            center:    [-0.1276, 51.5074],
            zoom:      12,
            maxBounds: [[-0.5104, 51.2868], [0.3340, 51.6919]],
        });
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }, [token]);

    useEffect(() => {
        if (!map.current) return;

        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        if (pickup) {
            const el = document.createElement('div');
            el.style.cssText = 'width:16px;height:16px;background:#22C55E;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(34,197,94,0.5)';
            markersRef.current.push(
                new mapboxgl.Marker(el)
                    .setLngLat([pickup.lng, pickup.lat])
                    .setPopup(new mapboxgl.Popup().setText('Pickup'))
                    .addTo(map.current)
            );
        }

        if (destination) {
            const el = document.createElement('div');
            el.style.cssText = 'width:16px;height:16px;background:#EF4444;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(239,68,68,0.5)';
            markersRef.current.push(
                new mapboxgl.Marker(el)
                    .setLngLat([destination.lng, destination.lat])
                    .setPopup(new mapboxgl.Popup().setText('Destination'))
                    .addTo(map.current)
            );
        }

        if (pickup && destination) {
            const coordinates = [[pickup.lng, pickup.lat], [destination.lng, destination.lat]];
            const geojson     = { type: 'Feature', geometry: { type: 'LineString', coordinates } };

            const drawRoute = () => {
                if (map.current.getSource('route')) {
                    map.current.getSource('route').setData(geojson);
                } else {
                    map.current.addSource('route', { type: 'geojson', data: geojson });
                    map.current.addLayer({
                        id: 'route', type: 'line', source: 'route',
                        paint: { 'line-color': '#3B82F6', 'line-width': 4, 'line-opacity': 0.8 },
                    });
                }
            };

            map.current.isStyleLoaded() ? drawRoute() : map.current.once('load', drawRoute);

            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([pickup.lng, pickup.lat]);
            bounds.extend([destination.lng, destination.lat]);
            map.current.fitBounds(bounds, { padding: 80 });
        } else {
            if (map.current.isStyleLoaded()) {
                if (map.current.getLayer('route'))   map.current.removeLayer('route');
                if (map.current.getSource('route'))  map.current.removeSource('route');
            }
            if (pickup) map.current.flyTo({ center: [pickup.lng, pickup.lat], zoom: 13 });
        }
    }, [pickup, destination]);

    if (!token) {
        return (
            <div className="w-full h-full bg-gray-900 border border-gray-800 rounded-3xl flex flex-col items-center justify-center gap-3 p-8 text-center">
                <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                <p className="text-gray-500 text-sm font-semibold">Map unavailable</p>
                <p className="text-gray-600 text-xs">Add <code className="bg-gray-800 px-1 rounded">REACT_APP_MAPBOX_TOKEN</code> to Vercel environment variables, then redeploy.</p>
            </div>
        );
    }

    return <div ref={containerRef} style={{ height: '100%', width: '100%', borderRadius: '24px' }} />;
}

// ── Location search input with Mapbox Geocoding + "use my location" ───────────
function LocationInput({ inputId, label, color, value, onSelect, onError, showLocateMe }) {
    const [query,    setQuery]    = useState(value?.name || '');
    const [results,  setResults]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [locating, setLocating] = useState(false);
    const timeoutRef = useRef(null);

    const locateMe = () => {
        if (!navigator.geolocation) { onError?.('Geolocation is not supported by your browser.'); return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                try {
                    const res  = await fetch(
                        `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.longitude},${coords.latitude}.json?access_token=${mapboxgl.accessToken}&types=address,poi&limit=1`
                    );
                    const data = await res.json();
                    const place = data.features[0];
                    const name  = place
                        ? place.place_name
                        : `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
                    setQuery(name.split(',').slice(0, 2).join(','));
                    onSelect({ name, lat: coords.latitude, lng: coords.longitude });
                } catch {
                    onError?.('Could not resolve your location. Try again.');
                }
                setLocating(false);
            },
            () => { onError?.('Location access denied. Allow location permission and try again.'); setLocating(false); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const search = (q) => {
        setQuery(q);
        clearTimeout(timeoutRef.current);
        if (q.length < 3) { setResults([]); return; }
        setLoading(true);
        timeoutRef.current = setTimeout(async () => {
            try {
                const res  = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxgl.accessToken}&limit=5&types=place,address,poi&bbox=-0.5104,51.2868,0.3340,51.6919&proximity=-0.1276,51.5074`
                );
                const data = await res.json();
                setResults(data.features.map(f => ({
                    place_id:     f.id,
                    display_name: f.place_name,
                    lat:          f.center[1],
                    lon:          f.center[0],
                })));
            } catch {
                setResults([]);
                onError?.('Location search failed. Please try again.');
            }
            setLoading(false);
        }, 500);
    };

    const select = (place) => {
        const safeName = String(place.display_name).replace(/<[^>]*>/g, '').trim().slice(0, 300);
        setQuery(safeName.split(',').slice(0, 2).join(','));
        setResults([]);
        onSelect({ name: safeName, lat: parseFloat(place.lat), lng: parseFloat(place.lon) });
    };

    const colorDot = color === 'green' ? 'bg-green-400' : 'bg-red-400';

    return (
        <div className="relative">
            {/* Visually hidden label — associates the text with the input for screen readers */}
            <label htmlFor={inputId} className="sr-only">{label}</label>

            <div className="flex items-center gap-3 px-4 py-3">
                <span className={`w-3 h-3 rounded-full ${colorDot} flex-shrink-0`} aria-hidden="true" />
                <input
                    id={inputId}
                    type="text"
                    value={query}
                    onChange={e => search(e.target.value)}
                    placeholder={label}
                    maxLength={200}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={results.length > 0}
                    aria-controls={`${inputId}-results`}
                    aria-haspopup="listbox"
                    className="flex-1 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm"
                />
                {loading && <Spinner size={4} />}
                {showLocateMe && (
                    <button
                        type="button"
                        onClick={locateMe}
                        disabled={locating}
                        aria-label="Use my current location"
                        className={`text-gray-500 hover:text-green-400 transition flex-shrink-0 disabled:opacity-50 ${ring} rounded`}
                    >
                        {locating
                            ? <Spinner size={4} />
                            : (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                    <circle cx="12" cy="12" r="3" />
                                    <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                                    <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
                                </svg>
                            )
                        }
                    </button>
                )}
            </div>

            {/* Dropdown results — buttons for keyboard accessibility */}
            {results.length > 0 && (
                <ul
                    id={`${inputId}-results`}
                    role="listbox"
                    aria-label={`${label} suggestions`}
                    className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl z-50 overflow-hidden shadow-xl"
                >
                    {results.map(r => (
                        <li key={r.place_id} role="option" aria-selected="false">
                            <button
                                type="button"
                                onClick={() => select(r)}
                                className={`w-full text-left flex items-center gap-2.5 px-4 py-3 text-sm text-gray-300
                                    hover:bg-gray-700 border-b border-gray-700/60 last:border-0 transition
                                    ${ring} rounded-none`}
                            >
                                {/* Pin icon instead of 📍 emoji */}
                                <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="truncate">{r.display_name.split(',').slice(0, 3).join(',')}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
function BookRide() {
    const navigate  = useNavigate();
    const { user, logout, setRideDetails, saveRide } = useAuth();

    const [pickup,         setPickup]         = useState(null);
    const [destination,    setDestination]    = useState(null);
    const [selectedRide,   setSelectedRide]   = useState('Economy');
    const [passengers,     setPassengers]     = useState(1);
    const [price,          setPrice]          = useState(null);
    const [distance,       setDistance]       = useState(null);
    const [duration,       setDuration]       = useState(null);
    const [loading,        setLoading]        = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [error,          setError]          = useState('');

    const calculatePrice = useCallback(() => {
        if (!pickup || !destination) {
            setError('Please select both a pickup location and a destination.');
            return;
        }
        setError('');
        setLoading(true);
        setTimeout(() => {
            const km                 = getDistanceKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
            const miles              = parseFloat((km * KM_TO_MILES).toFixed(1));
            const rate               = RIDE_TYPES.find(r => r.name === selectedRide).ratePerMile;
            const passengerMult      = 1 + (passengers - 1) * 0.1;
            const total              = parseFloat((2.5 + miles * rate * passengerMult).toFixed(2));
            setDistance(miles);
            setDuration(Math.round((km / 40) * 60));
            setPrice(total);
            setLoading(false);
        }, 1500);
    }, [pickup, destination, selectedRide, passengers]);

    const handleConfirm = useCallback(async () => {
        setConfirmLoading(true);
        setError('');

        const details = {
            pickup:         pickup?.name?.split(',').slice(0, 2).join(','),
            destination:    destination?.name?.split(',').slice(0, 2).join(','),
            price, rideType: selectedRide, distance, duration, passengers,
            pickupLat:      pickup?.lat,      pickupLng:      pickup?.lng,
            destinationLat: destination?.lat, destinationLng: destination?.lng,
        };

        let rideId = null;
        try {
            rideId = await Promise.race([
                saveRide(details),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
            ]);
        } catch { /* fallback to local ID */ }

        const fullDetails = {
            ...details,
            id:        rideId || `local_${Date.now()}`,
            rideId,
            status:    'confirmed',
            createdAt: Date.now(),
        };

        setRideDetails(fullDetails);

        try {
            const prev = JSON.parse(localStorage.getItem('ridex_rides') || '[]');
            localStorage.setItem('ridex_rides', JSON.stringify([fullDetails, ...prev].slice(0, 50)));
        } catch { /* localStorage unavailable */ }

        setConfirmLoading(false);
        navigate('/payment', { state: { ride: fullDetails } });
    }, [pickup, destination, price, selectedRide, distance, duration, passengers, saveRide, setRideDetails, navigate]);

    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── Header ── */}
            <header>
                <nav
                    aria-label="Main navigation"
                    className="flex justify-between items-center px-5 md:px-6 py-4 border-b border-gray-800"
                >
                    <a href="/" aria-label="RideX home" className={`flex items-center gap-2 rounded-lg ${ring}`}>
                        <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center" aria-hidden="true">
                            <span className="text-black font-black text-xs">R</span>
                        </div>
                        <span className="text-lg font-black">RideX</span>
                    </a>

                    <div className="flex items-center gap-2">
                        <p className="text-gray-400 text-sm hidden md:block truncate max-w-[160px]">
                            {user?.displayName || user?.email}
                        </p>
                        <button
                            onClick={() => navigate('/history')}
                            className={`text-sm text-gray-400 hover:text-white transition border border-gray-800 px-3 py-1.5 rounded-full ${ring}`}
                        >
                            My Rides
                        </button>
                        <button
                            onClick={() => { logout(); navigate('/'); }}
                            className={`text-sm text-gray-500 hover:text-red-400 transition border border-gray-800 px-3 py-1.5 rounded-full ${ring}`}
                        >
                            Logout
                        </button>
                    </div>
                </nav>
            </header>

            {/* ── Main ── */}
            <main>
                <div className="flex flex-col lg:flex-row max-w-7xl mx-auto px-5 md:px-6 py-8 gap-8">

                    {/* ── Left: booking form ── */}
                    <section aria-labelledby="booking-heading" className="w-full lg:w-96 flex-shrink-0 relative z-10">
                        <h1 id="booking-heading" className="text-3xl font-black mb-1">Where to?</h1>
                        <p className="text-gray-500 mb-6 text-sm">Book a ride anywhere in London</p>

                        {/* Error */}
                        <div aria-live="polite" aria-atomic="true">
                            {error && (
                                <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}
                        </div>

                        {/* Location inputs */}
                        <div className="bg-gray-900 rounded-2xl p-1 mb-5 border border-gray-800 relative z-10">
                            <LocationInput
                                inputId="pickup-input"
                                label="Pickup location"
                                color="green"
                                value={pickup}
                                onSelect={setPickup}
                                onError={setError}
                                showLocateMe
                            />
                            <div className="h-px bg-gray-800 mx-4" aria-hidden="true" />
                            <LocationInput
                                inputId="destination-input"
                                label="Where to?"
                                color="red"
                                value={destination}
                                onSelect={setDestination}
                                onError={setError}
                            />
                        </div>

                        {/* Passengers stepper */}
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-5">
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mb-3">Passengers</p>
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setPassengers(p => Math.max(1, p - 1))}
                                    disabled={passengers <= 1}
                                    aria-label={`Decrease passengers, currently ${passengers}`}
                                    className={`w-9 h-9 bg-gray-800 rounded-full font-bold hover:bg-gray-700 transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${ring} rounded-full`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                    </svg>
                                </button>

                                <span
                                    className="text-2xl font-black w-8 text-center"
                                    aria-live="polite"
                                    aria-label={`${passengers} passenger${passengers !== 1 ? 's' : ''}`}
                                >
                                    {passengers}
                                </span>

                                <button
                                    type="button"
                                    onClick={() => setPassengers(p => Math.min(6, p + 1))}
                                    disabled={passengers >= 6}
                                    aria-label={`Increase passengers, currently ${passengers}`}
                                    className={`w-9 h-9 bg-gray-800 rounded-full font-bold hover:bg-gray-700 transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${ring} rounded-full`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>

                                <span className="text-gray-500 text-sm ml-1">
                                    {passengers === 1 ? '1 passenger' : `${passengers} passengers`}
                                </span>
                            </div>
                        </div>

                        {/* Ride type selector */}
                        <fieldset className="mb-5">
                            <legend className="text-xs text-gray-500 font-medium uppercase tracking-widest mb-3">Ride type</legend>
                            <div className="grid grid-cols-3 gap-3">
                                {RIDE_TYPES.map(ride => {
                                    const isSelected = selectedRide === ride.name;
                                    return (
                                        <button
                                            key={ride.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            onClick={() => { setSelectedRide(ride.name); setPrice(null); }}
                                            className={`rounded-2xl p-3 text-center transition border flex flex-col items-center gap-1
                                                ${ring}
                                                ${isSelected
                                                    ? 'bg-yellow-400 text-black border-yellow-400'
                                                    : 'bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-600'}`}
                                        >
                                            <RideIcon id={ride.id} className="w-6 h-6" />
                                            <p className="text-xs font-black leading-tight">{ride.name}</p>
                                            <p className={`text-[10px] leading-none ${isSelected ? 'text-black/60' : 'text-gray-600'}`}>
                                                £{ride.ratePerMile}/mi
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>

                        {/* Get estimate button */}
                        <button
                            type="button"
                            onClick={calculatePrice}
                            disabled={!pickup || !destination || loading}
                            className={`w-full py-4 font-black rounded-2xl transition text-base mb-4
                                flex items-center justify-center gap-2 ${ring} ${ringOffset}
                                ${pickup && destination && !loading
                                    ? 'bg-white text-black hover:bg-gray-100 active:bg-gray-200'
                                    : 'bg-gray-900 text-gray-600 cursor-not-allowed border border-gray-800'}`}
                        >
                            {loading ? <><Spinner size={5} />Calculating…</> : 'Get Price Estimate'}
                        </button>

                        {/* Price result */}
                        {price && (
                            <div className="bg-gray-900 border border-yellow-400/30 rounded-2xl p-5">
                                {/* Trip stats */}
                                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                                    <div className="bg-black/50 rounded-xl p-3">
                                        <p className="text-gray-500 text-xs mb-1">Fare</p>
                                        <p className="text-xl font-black text-yellow-400">£{price}</p>
                                    </div>
                                    <div className="bg-black/50 rounded-xl p-3">
                                        <p className="text-gray-500 text-xs mb-1">Distance</p>
                                        <p className="text-xl font-black">{distance} mi</p>
                                    </div>
                                    <div className="bg-black/50 rounded-xl p-3">
                                        <p className="text-gray-500 text-xs mb-1">Est. time</p>
                                        <p className="text-xl font-black">{duration} min</p>
                                    </div>
                                </div>

                                {/* Sample driver preview — decorative */}
                                <div className="flex items-center gap-3 bg-black/50 rounded-xl p-3 mb-4" aria-hidden="true">
                                    <div className="w-9 h-9 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="text-black font-black text-xs">JW</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">James Wilson</p>
                                        <p className="text-xs text-gray-500">Toyota Camry · 4.9★ · 2 min away</p>
                                    </div>
                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                                </div>

                                {/* Confirm button */}
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={confirmLoading}
                                    className={`w-full py-3.5 bg-yellow-400 text-black font-black rounded-xl hover:bg-yellow-300
                                        active:bg-yellow-500 transition disabled:opacity-60 disabled:cursor-not-allowed
                                        flex items-center justify-center gap-2 ${ring} ${ringOffset}`}
                                >
                                    {confirmLoading
                                        ? <><Spinner size={5} />Confirming…</>
                                        : `Confirm ${selectedRide} — £${price} →`}
                                </button>
                            </div>
                        )}
                    </section>

                    {/* ── Right: map — responsive height ── */}
                    <div
                        className="flex-1 rounded-3xl overflow-hidden border border-gray-800 h-72 sm:h-96 lg:h-auto lg:min-h-[600px]"
                        aria-label="Route map"
                        role="img"
                    >
                        <MapDisplay pickup={pickup} destination={destination} />
                    </div>
                </div>
            </main>
        </div>
    );
}

export default BookRide;
