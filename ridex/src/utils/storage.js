// ── Safe web-storage helpers ──────────────────────────────────────────────────
// localStorage / sessionStorage throw in private mode and some webviews; every
// access goes through these so a storage failure never crashes a page.

function storage(kind) {
    try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}

export function readJson(key, fallback = null, kind = 'local') {
    try {
        const raw = storage(kind)?.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
}

export function writeJson(key, value, kind = 'local') {
    try { storage(kind)?.setItem(key, JSON.stringify(value)); } catch {}
}

export function removeKey(key, kind = 'local') {
    try { storage(kind)?.removeItem(key); } catch {}
}

/** Remove every key starting with `prefix` from the given storage. */
export function clearByPrefix(prefix, kind = 'local') {
    try {
        const s = storage(kind);
        if (!s) return;
        const doomed = [];
        for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k && k.startsWith(prefix)) doomed.push(k);
        }
        doomed.forEach(k => s.removeItem(k));
    } catch {}
}
