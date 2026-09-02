// ── Ride document normalisation ───────────────────────────────────────────────
// Ride docs carry legacy field aliases (userName/customerName, pickup/pickupAddress,
// destination/destinationAddress, price/fare). Every portal reads through
// normalizeRide() so a ride written by any client version renders correctly.

/** Statuses during which a ride is still "live" for the customer. */
export const ACTIVE_RIDE_STATUSES = ['confirmed', 'driver_assigned', 'arrived', 'in_progress'];

/** Replace empty / null / undefined with an em dash for display. */
function orDash(value) {
    return value === null || value === undefined || value === '' ? '—' : value;
}

/** Normalise a raw Firestore ride document into the canonical shape the UI expects. */
export function normalizeRide(id, data = {}) {
    const price = Number(data.price ?? data.fare);
    return {
        id,
        ...data,
        customerName:       data.customerName       || data.userName    || 'Customer',
        pickupAddress:      data.pickupAddress      || data.pickup      || 'Pickup location',
        destinationAddress: data.destinationAddress || data.destination || 'Destination',
        price:              Number.isFinite(price) ? price : 0,
        distance:           orDash(data.distance),
        duration:           orDash(data.duration),
    };
}

/** Format a number as GBP ("£12.50"); returns the fallback for NaN / missing values. */
export function formatMoney(value, { currency = '£', fallback = '—' } = {}) {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) ? `${currency}${n.toFixed(2)}` : fallback;
}

/** First character of a name, upper-cased, with a safe fallback for non-strings. */
export function initialOf(name, fallback = '?') {
    const s = String(name ?? '').trim();
    return (s || fallback).charAt(0).toUpperCase();
}

/** Strip everything that is not a digit or leading + so `tel:` links stay valid. */
export function telHref(phone) {
    const clean = String(phone ?? '').replace(/[^\d+]/g, '');
    return clean ? `tel:${clean}` : null;
}
