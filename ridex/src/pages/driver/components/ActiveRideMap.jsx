import { useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';

// ─────────────────────────────────────────────
// Mapbox active-ride map (inline, no react-map-gl)
// • initialises once, then UPDATES markers as the driver moves / the ride
//   loads (the old version froze everything at mount time)
// • survives unmounting mid-chunk-load (no leaked WebGL contexts)
// • resize()s when its tab becomes visible (it starts life inside display:none)
// • falls back to a Google Maps deep link when Mapbox is unavailable
// ─────────────────────────────────────────────

const LONDON = [-0.1276, 51.5074];
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function makeDot(color, size, extra = '') {
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;${extra}`;
  return el;
}

export default function ActiveRideMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng, active = true }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const mapboxRef    = useRef(null);
  const markersRef   = useRef({ driver: null, pickup: null, dest: null });
  const loadedRef    = useRef(false);
  const [ready,     setReady]     = useState(false);
  const [loadError, setLoadError] = useState(false);

  const token = process.env.REACT_APP_MAPBOX_TOKEN;

  // ── Initialise the map once ──────────────────────────────────────────────
  useEffect(() => {
    if (!token || !containerRef.current) return undefined;
    let cancelled = false;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;
      mapboxRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style:     'mapbox://styles/mapbox/dark-v11',
        center:    LONDON,
        zoom:      12,
      });
      mapRef.current = map;

      // Only a failure BEFORE the style loads means "map unusable"; later tile
      // errors are transient and Mapbox retries them itself.
      map.on('error', () => { if (!loadedRef.current) setLoadError(true); });
      map.on('load', () => {
        if (cancelled) { map.remove(); return; }
        loadedRef.current = true;
        setReady(true);
      });
    }).catch(() => { if (!cancelled) setLoadError(true); });

    return () => {
      cancelled = true;
      loadedRef.current = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markersRef.current = { driver: null, pickup: null, dest: null };
      setReady(false);
    };
  }, [token]);

  // ── Keep markers in sync with the latest coordinates ────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!ready || !map || !mapboxgl) return;

    const upsert = (key, lng, lat, make) => {
      if (!isNum(lat) || !isNum(lng)) {
        markersRef.current[key]?.remove();
        markersRef.current[key] = null;
        return null;
      }
      if (markersRef.current[key]) {
        markersRef.current[key].setLngLat([lng, lat]);
      } else {
        markersRef.current[key] = new mapboxgl.Marker(make()).setLngLat([lng, lat]).addTo(map);
      }
      return [lng, lat];
    };

    const coords = [
      upsert('driver', driverLng, driverLat, () => makeDot('#3b82f6', 18, 'animation:driverPulse 1.5s infinite;')),
      upsert('pickup', pickupLng, pickupLat, () => makeDot('#22c55e', 20)),
      upsert('dest',   destLng,   destLat,   () => makeDot('#ef4444', 20)),
    ].filter(Boolean);

    try {
      if (coords.length > 1) {
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 50, maxZoom: 16, duration: 600 });
      } else if (coords.length === 1) {
        map.easeTo({ center: coords[0], zoom: 14, duration: 600 });
      }
    } catch (_) { /* map mid-teardown */ }
  }, [ready, driverLat, driverLng, pickupLat, pickupLng, destLat, destLng]);

  // ── The Rides tab is display:none when inactive → canvas is 0×0 at init ──
  useEffect(() => {
    if (active && ready) {
      try { mapRef.current?.resize(); } catch (_) {}
    }
  }, [active, ready]);

  // ── Fallback: no token / style failed → deep link instead of a grey box ──
  const targetLat = isNum(pickupLat) ? pickupLat : destLat;
  const targetLng = isNum(pickupLng) ? pickupLng : destLng;
  const mapsUrl   = isNum(targetLat) && isNum(targetLng)
    ? `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`
    : null;

  if (!token || loadError) {
    return (
      <div className="w-full h-56 sm:h-72 rounded-2xl border border-gray-800 bg-gray-900 flex flex-col items-center justify-center gap-2 p-5 text-center">
        <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <p className="text-gray-400 text-sm font-semibold">Map unavailable</p>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-400 text-sm font-bold underline min-h-[44px] inline-flex items-center px-2"
          >
            Open route in Google Maps
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Live ride map"
      className="w-full h-56 sm:h-72 rounded-2xl overflow-hidden border border-gray-800 shadow-lg shadow-black/40"
    />
  );
}
