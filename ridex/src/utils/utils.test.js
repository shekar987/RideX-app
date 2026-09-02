import { toMillis, toDateSafe, formatTimeAgo } from './time';
import { normalizeRide, formatMoney, initialOf, telHref } from './ride';
import { fetchJson, getFunctionsBaseUrl } from './net';
import { lazyRetry, isChunkLoadError } from './lazyRetry';
import { checkLockout, recordFailedAttempt, clearAllAttemptData, MAX_ATTEMPTS } from './loginAttempts';

describe('time helpers', () => {
    test('toMillis handles every timestamp shape', () => {
        const now = Date.now();
        expect(toMillis(now)).toBe(now);
        expect(toMillis(new Date(now))).toBe(now);
        expect(toMillis({ toMillis: () => now })).toBe(now);
        expect(toMillis({ toDate: () => new Date(now) })).toBe(now);
        expect(toMillis({ seconds: Math.floor(now / 1000), nanoseconds: 0 })).toBe(Math.floor(now / 1000) * 1000);
        expect(toMillis(new Date(now).toISOString())).toBe(now);
    });

    test('toMillis returns 0 for garbage instead of throwing', () => {
        expect(toMillis(null)).toBe(0);
        expect(toMillis(undefined)).toBe(0);
        expect(toMillis('not a date')).toBe(0);
        expect(toMillis(NaN)).toBe(0);
        expect(toMillis({})).toBe(0);
        expect(toMillis({ toDate: () => { throw new Error('x'); } })).toBe(0);
    });

    test('toDateSafe returns null for unparseable input', () => {
        expect(toDateSafe('nope')).toBeNull();
        expect(toDateSafe(Date.now())).toBeInstanceOf(Date);
    });

    test('formatTimeAgo never returns NaN', () => {
        expect(formatTimeAgo(Date.now())).toBe('just now');
        expect(formatTimeAgo(Date.now() - 5 * 60000)).toBe('5m ago');
        expect(formatTimeAgo(Date.now() - 3 * 3600000)).toBe('3h ago');
        expect(formatTimeAgo(Date.now() - 2 * 86400000)).toBe('2d ago');
        expect(formatTimeAgo({ toDate: () => new Date() })).toBe('just now');
        expect(formatTimeAgo('bad')).toBe('');
        expect(formatTimeAgo(Date.now() + 60000)).toBe('just now'); // clock skew
    });
});

describe('ride helpers', () => {
    test('normalizeRide fills legacy aliases', () => {
        const r = normalizeRide('r1', { userName: 'Ann', pickup: 'A', destination: 'B', fare: '12.5' });
        expect(r.customerName).toBe('Ann');
        expect(r.pickupAddress).toBe('A');
        expect(r.destinationAddress).toBe('B');
        expect(r.price).toBe(12.5);
        expect(r.distance).toBe('—');
        expect(r.duration).toBe('—');
    });

    test('normalizeRide prefers canonical fields and tolerates garbage price', () => {
        const r = normalizeRide('r2', { customerName: 'Bob', userName: 'Old', price: 'abc', distance: 0 });
        expect(r.customerName).toBe('Bob');
        expect(r.price).toBe(0);
        expect(r.distance).toBe(0);
    });

    test('formatMoney is NaN-safe', () => {
        expect(formatMoney(12.5)).toBe('£12.50');
        expect(formatMoney('7')).toBe('£7.00');
        expect(formatMoney(undefined)).toBe('—');
        expect(formatMoney('x')).toBe('—');
    });

    test('initialOf handles non-strings', () => {
        expect(initialOf('ann')).toBe('A');
        expect(initialOf(42)).toBe('4');
        expect(initialOf(null)).toBe('?');
        expect(initialOf('   ', 'C')).toBe('C');
    });

    test('telHref strips formatting', () => {
        expect(telHref('+44 (7700) 900-000')).toBe('tel:+447700900000');
        expect(telHref('')).toBeNull();
    });
});

describe('net helpers', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    test('fetchJson tolerates non-JSON bodies', async () => {
        global.fetch = jest.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }));
        const { ok, status, data } = await fetchJson('http://x');
        expect(ok).toBe(false);
        expect(status).toBe(502);
        expect(data).toEqual({});
    });

    test('fetchJson aborts after the timeout', async () => {
        global.fetch = jest.fn((_url, { signal }) => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }));
        await expect(fetchJson('http://x', {}, { timeoutMs: 10 })).rejects.toMatchObject({ name: 'AbortError' });
    });

    test('getFunctionsBaseUrl returns empty string when unconfigured', () => {
        const prev = process.env.REACT_APP_FIREBASE_PROJECT_ID;
        delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
        expect(getFunctionsBaseUrl()).toBe('');
        process.env.REACT_APP_FIREBASE_PROJECT_ID = 'demo';
        expect(getFunctionsBaseUrl()).toBe('https://us-central1-demo.cloudfunctions.net');
        if (prev === undefined) delete process.env.REACT_APP_FIREBASE_PROJECT_ID; else process.env.REACT_APP_FIREBASE_PROJECT_ID = prev;
    });
});

describe('lazyRetry', () => {
    const realLocation = window.location;
    beforeEach(() => {
        sessionStorage.clear();
        delete window.location;
        window.location = { reload: jest.fn() };
    });
    afterEach(() => { window.location = realLocation; });

    test('retries once then resolves', async () => {
        const importFn = jest.fn()
            .mockRejectedValueOnce(new Error('ChunkLoadError'))
            .mockResolvedValueOnce({ default: 'ok' });
        const mod = await lazyRetry(importFn, { retryDelayMs: 0 })();
        expect(mod).toEqual({ default: 'ok' });
        expect(importFn).toHaveBeenCalledTimes(2);
        expect(window.location.reload).not.toHaveBeenCalled();
    });

    test('reloads once, then surfaces the error', async () => {
        const importFn = jest.fn().mockRejectedValue(new Error('Loading chunk 3 failed'));
        // first failure → reload (promise never resolves), flag set
        lazyRetry(importFn, { retryDelayMs: 0 })();
        await new Promise(r => setTimeout(r, 5));
        expect(window.location.reload).toHaveBeenCalledTimes(1);
        // flag set → next failure rethrows
        await expect(lazyRetry(importFn, { retryDelayMs: 0 })()).rejects.toThrow(/chunk/i);
    });

    test('isChunkLoadError recognises chunk failures', () => {
        expect(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 5 failed' })).toBe(true);
        expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
    });
});

describe('loginAttempts', () => {
    beforeEach(() => clearAllAttemptData());

    test('locks after MAX_ATTEMPTS and clears when expired', () => {
        const email = 'josé@example.com'; // non-Latin1 — btoa would have thrown
        let result;
        for (let i = 0; i < MAX_ATTEMPTS; i++) result = recordFailedAttempt(email, 1000);
        expect(result.locked).toBe(true);
        expect(checkLockout(email, 2000).locked).toBe(true);
        expect(checkLockout(email, 1000 + 16 * 60 * 1000).locked).toBe(false);
    });
});
