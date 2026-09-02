// ── Client-side login attempt limiter ─────────────────────────────────────────
// Slows down credential guessing in the browser (5 attempts → 15 min lock).
// This is UX-level protection only — Firebase Auth applies its own server-side
// throttling. Keys are per-email in sessionStorage.

import { readJson, writeJson, removeKey, clearByPrefix } from './storage';

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS   = 15 * 60 * 1000;
const PREFIX = '_la_';

// encodeURIComponent (not btoa) — btoa throws on non-Latin1 addresses.
function keyFor(email) {
    return `${PREFIX}${encodeURIComponent(String(email || '').toLowerCase().trim())}`;
}

export function getAttemptData(email) {
    const data = readJson(keyFor(email), null, 'session');
    return data && typeof data === 'object' ? data : { count: 0, lockedUntil: null };
}

export function setAttemptData(email, data) {
    writeJson(keyFor(email), data, 'session');
}

export function clearAttemptData(email) {
    removeKey(keyFor(email), 'session');
}

export function clearAllAttemptData() {
    clearByPrefix(PREFIX, 'session');
}

/**
 * Check whether an email is currently locked out. Expired locks are cleared.
 * Returns { locked, lockedUntil, secondsLeft, data }.
 */
export function checkLockout(email, now = Date.now()) {
    const data = getAttemptData(email);
    if (data.lockedUntil && now < data.lockedUntil) {
        return { locked: true, lockedUntil: data.lockedUntil, secondsLeft: Math.ceil((data.lockedUntil - now) / 1000), data };
    }
    if (data.lockedUntil && now >= data.lockedUntil) {
        const reset = { count: 0, lockedUntil: null };
        setAttemptData(email, reset);
        return { locked: false, lockedUntil: null, secondsLeft: 0, data: reset };
    }
    return { locked: false, lockedUntil: null, secondsLeft: 0, data };
}

/** Record a failed credential attempt. Returns { locked, lockedUntil, attemptsLeft }. */
export function recordFailedAttempt(email, now = Date.now()) {
    const data     = getAttemptData(email);
    const newCount = (data.count || 0) + 1;
    const locked   = newCount >= MAX_ATTEMPTS;
    const lockedUntil = locked ? now + LOCKOUT_MS : null;
    setAttemptData(email, { count: newCount, lockedUntil });
    return { locked, lockedUntil, attemptsLeft: Math.max(0, MAX_ATTEMPTS - newCount) };
}
