// ── Resilient React.lazy imports ──────────────────────────────────────────────
// After a deploy, a phone that still has the old index.html open requests chunk
// hashes that no longer exist and the dynamic import rejects (ChunkLoadError).
// Retry once, then reload the page once (flag in sessionStorage so we never
// loop), and only surface the error to the boundary after that.

const RELOAD_FLAG = 'ridex_chunk_reloaded';

function readFlag() {
    try { return sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { return false; }
}
function writeFlag(on) {
    try { on ? sessionStorage.setItem(RELOAD_FLAG, '1') : sessionStorage.removeItem(RELOAD_FLAG); } catch {}
}

/** Wrap a `() => import('./Page')` factory for use with React.lazy. */
export function lazyRetry(importFn, { retryDelayMs = 1000 } = {}) {
    return () => importFn()
        .catch(() => new Promise(resolve => setTimeout(resolve, retryDelayMs)).then(importFn))
        .then(mod => { writeFlag(false); return mod; })
        .catch(err => {
            if (!readFlag()) {
                writeFlag(true);
                window.location.reload();
                // Keep the Suspense fallback up while the page unloads.
                return new Promise(() => {});
            }
            throw err;
        });
}

/** True when an error looks like a failed code-split chunk load. */
export function isChunkLoadError(err) {
    return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i
        .test(`${err?.name ?? ''} ${err?.message ?? ''}`);
}
