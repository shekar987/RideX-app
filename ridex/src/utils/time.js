// ── Timestamp helpers ─────────────────────────────────────────────────────────
// Ride/driver documents reach the UI in several shapes depending on the write
// path: a Firestore Timestamp (SDK), a plain { seconds, nanoseconds } object
// (serialised/cached), a number (Date.now()), an ISO string (REST writes), or
// a Date. Every reader should go through these helpers instead of calling
// `.toDate()` / `new Date(x)` directly, which throw or yield "Invalid Date".

/** Convert any timestamp-ish value to epoch milliseconds. Returns 0 when unknown. */
export function toMillis(ts) {
    if (ts == null) return 0;
    if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
    if (ts instanceof Date) {
        const ms = ts.getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof ts.toMillis === 'function') {
        try { const ms = ts.toMillis(); return Number.isFinite(ms) ? ms : 0; } catch { return 0; }
    }
    if (typeof ts.toDate === 'function') {
        try { const ms = ts.toDate().getTime(); return Number.isFinite(ms) ? ms : 0; } catch { return 0; }
    }
    if (typeof ts.seconds === 'number') {
        return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (typeof ts === 'string') {
        const ms = new Date(ts).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }
    return 0;
}

/** Convert any timestamp-ish value to a Date, or null when it cannot be parsed. */
export function toDateSafe(ts) {
    const ms = toMillis(ts);
    return ms > 0 ? new Date(ms) : null;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" — never NaN, never negative. */
export function formatTimeAgo(ts) {
    const ms = toMillis(ts);
    if (!ms) return '';
    const diffMin = Math.floor(Math.max(0, Date.now() - ms) / 60000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24)  return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
}
