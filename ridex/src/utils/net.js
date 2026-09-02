// ── Network helpers ───────────────────────────────────────────────────────────

let warnedBaseUrl = false;

/** Base URL for the Firebase Cloud Functions. Empty string when unconfigured. */
export function getFunctionsBaseUrl() {
    if (process.env.REACT_APP_FUNCTIONS_BASE_URL) return process.env.REACT_APP_FUNCTIONS_BASE_URL;
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    if (!projectId) {
        if (process.env.NODE_ENV === 'development' && !warnedBaseUrl) {
            warnedBaseUrl = true;
            // eslint-disable-next-line no-console
            console.warn('REACT_APP_FIREBASE_PROJECT_ID is not set — Cloud Function calls will fail.');
        }
        return '';
    }
    return `https://us-central1-${projectId}.cloudfunctions.net`;
}

/** True when the browser reports it is offline. */
export function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** True for a fetch aborted by our timeout. */
export function isAbortError(err) {
    return err?.name === 'AbortError';
}

/**
 * fetch() with a hard timeout and tolerant JSON parsing.
 * Resolves to { res, data, ok, status }. `data` is {} when the body is not JSON
 * (e.g. an HTML 502 page from the load balancer). Rejects on network failure or
 * timeout (AbortError). Uses AbortController rather than AbortSignal.timeout,
 * which is missing in jsdom and iOS < 16.
 */
export async function fetchJson(url, options = {}, { timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        if (!data || typeof data !== 'object') data = {};
        return { res, data, ok: res.ok, status: res.status };
    } finally {
        clearTimeout(timer);
    }
}
