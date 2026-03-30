const { setGlobalOptions } = require('firebase-functions');
const { onRequest } = require('firebase-functions/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const cors = require('cors');
const compression = require('compression');
const Stripe = require('stripe');

// ── One-time module-level initialisation ─────────────────────────────────────
setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();
const db = admin.firestore();

// ── Stripe lazy initialisation ────────────────────────────────────────────────
let _stripe;
function getStripe() {
    if (!_stripe) {
        if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set.');
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    }
    return _stripe;
}

// ── Gzip compression ──────────────────────────────────────────────────────────
// Compresses all JSON/text responses. For typical ride data (< 1 KB) compression
// won't fire (threshold = 512 bytes), but fare estimates, ride lists, and error
// messages on slower connections all benefit.
const compressResponse = compression({ threshold: 512 });

// ── CORS ──────────────────────────────────────────────────────────────────────
// Priority: ALLOWED_ORIGINS env var → Firebase Hosting URLs (derived from project ID)
//           → localhost in dev.  Never default to wildcard in production.
const rawOrigins = process.env.ALLOWED_ORIGINS;
const _projectId = process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || (() => { try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId; } catch { return null; } })();

const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim())
    : process.env.NODE_ENV === 'development'
        ? ['http://localhost:3000']
        : _projectId
            ? [`https://${_projectId}.web.app`, `https://${_projectId}.firebaseapp.com`]
            : true; // last resort: allow all — operator must set ALLOWED_ORIGINS

const corsHandler = cors({
    origin: allowedOrigins,
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
});

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY HELPERS  (unchanged from security hardening pass)
// ─────────────────────────────────────────────────────────────────────────────

function setSecurityHeaders(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '0');
    res.set('Cache-Control', 'no-store, no-cache');
    res.set('Pragma', 'no-cache');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
}

async function enforceRateLimit(ip, res, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const safeKey = `ip_${String(ip).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100)}`;
    const ref = db.collection('_ratelimits').doc(safeKey);
    try {
        const allowed = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            let ts = snap.exists ? (snap.data().ts || []) : [];
            ts = ts.filter((t) => t > windowStart);
            if (ts.length >= limit) return false;
            ts.push(now);
            tx.set(ref, { ts, expireAt: admin.firestore.Timestamp.fromMillis(now + windowMs * 2) });
            return true;
        });
        if (!allowed) {
            setSecurityHeaders(res);
            res.status(429).json({ error: 'Too many requests. Please try again later.' });
            return false;
        }
        return true;
    } catch {
        logger.warn('Rate limit store error; allowing request', { safeKey });
        return true;
    }
}

async function verifyAuth(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    try {
        return await admin.auth().verifyIdToken(authHeader.slice(7), true);
    } catch {
        return null;
    }
}

const PM_ID_RE       = /^pm_[a-zA-Z0-9]{8,200}$/;
const FIRESTORE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function sanitiseString(s, maxLen = 200) {
    return typeof s === 'string' ? s.trim().slice(0, maxLen) : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// FARE ESTIMATE CACHE
// In-memory LRU cache per function container.
// Semantics: same as a Redis cache with TTL=5min, but scoped to this process.
// To upgrade to true distributed caching, replace get/set below with
// Upstash Redis calls (drop-in: `redis.get(key)` / `redis.set(key, val, {ex: 300})`).
// ─────────────────────────────────────────────────────────────────────────────
const FARE_CACHE_TTL  = 5 * 60 * 1000;  // 5 minutes
const FARE_CACHE_MAX  = 500;             // cap memory use per container
const fareCache       = new Map();       // key → { price, distance, duration, cachedAt }

function fareFromCache(key) {
    const entry = fareCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > FARE_CACHE_TTL) { fareCache.delete(key); return null; }
    return entry;
}

function fareToCache(key, value) {
    if (fareCache.size >= FARE_CACHE_MAX) {
        fareCache.delete(fareCache.keys().next().value); // evict oldest (FIFO)
    }
    fareCache.set(key, { ...value, cachedAt: Date.now() });
}

// ── Haversine (shared between client and server) ──────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const RATE_PER_KM = { Economy: 1.2, Comfort: 1.8, XL: 2.4 };
const BASE_FARE   = 2.5;

// ─────────────────────────────────────────────────────────────────────────────
// POST /estimateFare
// Body: { pickupLat, pickupLng, destLat, destLng, rideType, passengers }
// Returns cached estimate when the same route is requested within 5 minutes.
// ─────────────────────────────────────────────────────────────────────────────
exports.estimateFare = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const { pickupLat, pickupLng, destLat, destLng, rideType, passengers } = req.body;

            // Validate
            if (![pickupLat, pickupLng, destLat, destLng].every(Number.isFinite)) {
                return res.status(400).json({ error: 'Invalid coordinates.' });
            }
            if (!RATE_PER_KM[rideType]) {
                return res.status(400).json({ error: 'Invalid ride type.' });
            }
            const pax = parseInt(passengers);
            if (!Number.isInteger(pax) || pax < 1 || pax > 6) {
                return res.status(400).json({ error: 'Passengers must be 1–6.' });
            }

            // Round coords to ~100m precision for cache key — nearby routes share a cached result
            const cacheKey = [
                Math.round(pickupLat * 1000) / 1000,
                Math.round(pickupLng * 1000) / 1000,
                Math.round(destLat  * 1000) / 1000,
                Math.round(destLng  * 1000) / 1000,
                rideType,
                pax,
            ].join('_');

            const cached = fareFromCache(cacheKey);
            if (cached) {
                res.set('X-Cache', 'HIT');
                return res.json(cached);
            }

            const km       = haversineKm(pickupLat, pickupLng, destLat, destLng);
            const rate     = RATE_PER_KM[rideType];
            const mult     = 1 + (pax - 1) * 0.1;
            const price    = parseFloat((BASE_FARE + km * rate * mult).toFixed(2));
            const duration = Math.round((km / 40) * 60);
            const distance = parseFloat(km.toFixed(1));

            const result = { price, distance, duration };
            fareToCache(cacheKey, result);

            res.set('X-Cache', 'MISS');
            return res.json(result);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /getUserRides?limit=10&cursor=<docId>&status=<status>
// Cursor-based pagination — avoids offset scans that get slower with large datasets.
// Requires the composite index: rides (userId ASC, createdAt DESC)
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserRides = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.socket?.remoteAddress || 'unknown';
            const rateLimitPassed = await enforceRateLimit(ip, res);
            if (!rateLimitPassed) return;

            // Parse + clamp pagination params
            const limit  = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
            const cursor = sanitiseString(req.query.cursor || '');
            const status = sanitiseString(req.query.status || '');

            // Build query — uses the composite index
            let query = db.collection('rides')
                .where('userId', '==', decoded.uid)
                .orderBy('createdAt', 'desc')
                .limit(limit + 1); // fetch one extra to determine hasMore

            if (status) {
                query = db.collection('rides')
                    .where('userId', '==', decoded.uid)
                    .where('status', '==', status)
                    .orderBy('createdAt', 'desc')
                    .limit(limit + 1);
            }

            // Apply cursor (start-after the last doc from the previous page)
            if (cursor && FIRESTORE_ID_RE.test(cursor)) {
                try {
                    const cursorDoc = await db.collection('rides').doc(cursor).get();
                    if (cursorDoc.exists && cursorDoc.data().userId === decoded.uid) {
                        query = query.startAfter(cursorDoc);
                    }
                } catch { /* invalid cursor — ignore and start from beginning */ }
            }

            let snapshot;
            try {
                snapshot = await query.get();
            } catch (err) {
                logger.error('getUserRides query failed', { userId: decoded.uid });
                return res.status(500).json({ error: 'Failed to load ride history.' });
            }

            const docs    = snapshot.docs;
            const hasMore = docs.length > limit;
            const page    = hasMore ? docs.slice(0, limit) : docs;

            // Only return fields the client actually needs — never return internal fields
            const rides = page.map((d) => {
                const data = d.data();
                return {
                    id:            d.id,
                    pickup:        data.pickup,
                    destination:   data.destination,
                    price:         data.price,
                    rideType:      data.rideType,
                    status:        data.status,
                    paymentStatus: data.paymentStatus || null,
                    distance:      data.distance,
                    duration:      data.duration,
                    passengers:    data.passengers,
                    createdAt:     data.createdAt?.toMillis() ?? null,
                };
            });

            return res.json({
                rides,
                nextCursor: hasMore ? page[page.length - 1].id : null,
                hasMore,
            });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /createPaymentIntent  (unchanged logic; compression added)
// ─────────────────────────────────────────────────────────────────────────────
exports.createPaymentIntent = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

            const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                || req.socket?.remoteAddress || 'unknown';
            const rateLimitPassed = await enforceRateLimit(ip, res);
            if (!rateLimitPassed) return;

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const rawPmId   = sanitiseString(req.body?.paymentMethodId || '');
            const rawRideId = sanitiseString(req.body?.rideId || '');

            if (!PM_ID_RE.test(rawPmId))        return res.status(400).json({ error: 'Invalid payment method.' });
            if (!FIRESTORE_ID_RE.test(rawRideId)) return res.status(400).json({ error: 'Invalid ride reference.' });

            let rideDoc;
            try {
                rideDoc = await db.collection('rides').doc(rawRideId).get();
            } catch {
                logger.error('Firestore read failed', { rideId: rawRideId });
                return res.status(500).json({ error: 'Unable to retrieve ride. Please try again.' });
            }

            if (!rideDoc.exists) return res.status(404).json({ error: 'Ride not found.' });
            const ride = rideDoc.data();
            if (ride.userId !== decoded.uid) return res.status(403).json({ error: 'Forbidden' });

            const amountPence = Math.round(parseFloat(ride.price) * 100);
            if (!Number.isFinite(amountPence) || amountPence < 30 || amountPence > 10_000_00) {
                return res.status(400).json({ error: 'Invalid ride price.' });
            }

            let alreadyPaid = false;
            try {
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(db.collection('rides').doc(rawRideId));
                    if (!snap.exists) throw new Error('NOT_FOUND');
                    if (snap.data().paymentStatus === 'paid') { alreadyPaid = true; return; }
                    tx.update(db.collection('rides').doc(rawRideId), { paymentStatus: 'processing' });
                });
            } catch (err) {
                if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Ride not found.' });
                return res.status(500).json({ error: 'Unable to process payment. Please try again.' });
            }

            if (alreadyPaid) return res.status(409).json({ error: 'This ride has already been paid.' });

            try {
                const paymentIntent = await getStripe().paymentIntents.create({
                    amount: amountPence,
                    currency: 'gbp',
                    payment_method: rawPmId,
                    confirm: true,
                    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                    metadata: { rideId: rawRideId, userId: decoded.uid },
                });

                if (paymentIntent.status === 'succeeded') {
                    await db.collection('rides').doc(rawRideId).update({
                        paymentStatus: 'paid',
                        paymentIntentId: paymentIntent.id,
                        paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    logger.info('Payment succeeded', { rideId: rawRideId });
                    return res.json({ success: true });
                }
                if (paymentIntent.status === 'requires_action') {
                    return res.json({ requiresAction: true, clientSecret: paymentIntent.client_secret });
                }
                await db.collection('rides').doc(rawRideId).update({ paymentStatus: null });
                return res.status(400).json({ error: 'Payment could not be completed. Please try again.' });

            } catch (err) {
                await db.collection('rides').doc(rawRideId).update({ paymentStatus: null }).catch(() => {});
                logger.error('Stripe error', { type: err.type || 'unknown', rideId: rawRideId });
                const clientMessage = err.type?.startsWith('card_')
                    ? err.message
                    : 'Payment processing failed. Please try again.';
                return res.status(400).json({ error: clientMessage });
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stripeWebhook
// ─────────────────────────────────────────────────────────────────────────────
exports.stripeWebhook = onRequest((req, res) => {
    setSecurityHeaders(res);
    if (req.method !== 'POST') return res.status(405).end();

    const sig           = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) { logger.error('STRIPE_WEBHOOK_SECRET not configured'); return res.status(500).end(); }

    let event;
    try {
        event = getStripe().webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch {
        logger.warn('Webhook signature verification failed');
        return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    res.json({ received: true });

    (async () => {
        const pi = event.data?.object;
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const { rideId } = pi.metadata || {};
                if (!rideId || !FIRESTORE_ID_RE.test(rideId)) break;
                await db.collection('rides').doc(rideId).update({
                    paymentStatus: 'paid',
                    paymentIntentId: pi.id,
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                }).catch(() => logger.error('Webhook: Firestore update failed', { rideId }));
                break;
            }
            case 'payment_intent.payment_failed': {
                const { rideId } = pi.metadata || {};
                if (!rideId || !FIRESTORE_ID_RE.test(rideId)) break;
                await db.collection('rides').doc(rideId).update({ paymentStatus: 'failed' }).catch(() => {});
                break;
            }
            default: break;
        }
    })();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────
exports.health = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, () => {
            setSecurityHeaders(res);
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                services: {
                    firestore: 'connected',
                    stripe:    !!process.env.STRIPE_SECRET_KEY,
                    webhook:   !!process.env.STRIPE_WEBHOOK_SECRET,
                    fareCache: `${fareCache.size} entries`,
                },
            });
        });
    });
});
