import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────
// Mapbox active-ride map (inline, no react-map-gl)
// ─────────────────────────────────────────────
export default function ActiveRideMap({ driverLat, driverLng, pickupLat, pickupLng, destLat, destLng }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.REACT_APP_MAPBOX_TOKEN;
    if (!token) return;

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = token;

      const centerLng = driverLng || pickupLng || -0.1276;
      const centerLat = driverLat || pickupLat || 51.5074;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [centerLng, centerLat],
        zoom: 13,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (driverLat && driverLng) {
          const el = document.createElement('div');
          el.className = 'driver-dot';
          el.style.cssText = `
            width:18px;height:18px;border-radius:50%;
            background:#3b82f6;border:3px solid white;
            box-shadow:0 0 0 6px rgba(59,130,246,0.35);
            animation:pulse 1.5s infinite;
          `;
          new mapboxgl.Marker(el).setLngLat([driverLng, driverLat]).addTo(map);
        }

        if (pickupLat && pickupLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#22c55e;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([pickupLng, pickupLat]).addTo(map);
        }

        if (destLat && destLng) {
          const el = document.createElement('div');
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#ef4444;border:3px solid white;
          `;
          new mapboxgl.Marker(el).setLngLat([destLng, destLat]).addTo(map);
        }

        const coords = [
          driverLat  && [driverLng, driverLat],
          pickupLat  && [pickupLng, pickupLat],
          destLat    && [destLng, destLat],
        ].filter(Boolean);
        if (coords.length > 1) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new mapboxgl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50 });
        }
      });
    }).catch(() => {});

    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="w-full h-48 rounded-2xl overflow-hidden border border-gray-800 shadow-lg shadow-black/40" />
  );
}
