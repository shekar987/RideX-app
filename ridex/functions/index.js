const { setGlobalOptions } = require('firebase-functions');
const { onRequest } = require('firebase-functions/https');
const { onDocumentUpdated } = require('firebase-functions/firestore');
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
            : [];

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
// FCM HELPER
// Sends a push notification to a single device token. Silently swallows
// errors so a notification failure never blocks the business logic that
// called it. Invalid/expired tokens return 'messaging/registration-token-not-registered'
// which we log at debug level only.
// ─────────────────────────────────────────────────────────────────────────────
async function sendFcmNotification(token, title, body, url = '/') {
    if (!token || typeof token !== 'string') return;
    try {
        await admin.messaging().send({
            token,
            notification: { title, body },
            webpush: {
                notification: { icon: '/logo192.png', badge: '/logo192.png' },
                fcmOptions:   { link: url },
                data:         { url, tag: 'ridex' },
            },
        });
    } catch (err) {
        const code = err?.errorInfo?.code || '';
        if (code !== 'messaging/registration-token-not-registered') {
            logger.warn('sendFcmNotification failed', { code });
        }
    }
}

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
// POST /setDriverStatus
// Admin-only. Approves or rejects a driver application. Driver self-writes to
// the `status` field are blocked by firestore.rules — this is the only path
// that can change it.
// Body: { driverId, status: 'approved' | 'rejected' }
// ─────────────────────────────────────────────────────────────────────────────
exports.setDriverStatus = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            // Admin = ADMIN_EMAIL env (case-insensitive) OR a document at /admins/{uid}
            // (the same allow-list firestore.rules uses for admin reads).
            const adminEmail  = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
            const callerEmail = (decoded.email || '').trim().toLowerCase();
            let isAdmin = !!adminEmail && callerEmail === adminEmail;
            if (!isAdmin) {
                try {
                    const adminSnap = await db.collection('admins').doc(decoded.uid).get();
                    isAdmin = adminSnap.exists;
                } catch (err) {
                    logger.warn('admins lookup failed', { uid: decoded.uid, message: err?.message });
                }
            }
            if (!isAdmin) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const driverId  = sanitiseString(req.body?.driverId || '');
            const newStatus = sanitiseString(req.body?.status || '');

            if (!FIRESTORE_ID_RE.test(driverId)) return res.status(400).json({ error: 'Invalid driver reference.' });
            if (!['approved', 'rejected', 'pending'].includes(newStatus)) {
                return res.status(400).json({ error: 'Invalid status.' });
            }

            try {
                const ref  = db.collection('drivers').doc(driverId);
                const snap = await ref.get();
                if (!snap.exists) return res.status(404).json({ error: 'Driver not found.' });

                await ref.update({ status: newStatus });
                logger.info('Driver status updated', { driverId, newStatus, by: decoded.email });
                return res.json({ success: true });
            } catch (err) {
                logger.error('setDriverStatus failed', { driverId, message: err?.message });
                return res.status(500).json({ error: 'Failed to update driver status.' });
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /createConnectAccount
// Driver-only. Creates (if needed) a Stripe Express connected account for the
// calling driver and returns an onboarding link. Driver must already have an
// approved driver profile.
// ─────────────────────────────────────────────────────────────────────────────
exports.createConnectAccount = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const driverRef = db.collection('drivers').doc(decoded.uid);
            const driverSnap = await driverRef.get();
            if (!driverSnap.exists) return res.status(404).json({ error: 'Driver profile not found.' });

            const driver = driverSnap.data();
            const appBaseUrl = process.env.APP_BASE_URL || allowedOrigins[0];
            if (!appBaseUrl) return res.status(500).json({ error: 'Server is not configured for onboarding redirects.' });

            try {
                let accountId = driver.stripeAccountId;

                if (!accountId) {
                    const account = await getStripe().accounts.create({
                        type: 'express',
                        country: 'GB',
                        email: decoded.email,
                        capabilities: {
                            transfers:    { requested: true },
                            card_payments: { requested: true },
                        },
                        business_type: 'individual',
                        metadata: { driverId: decoded.uid },
                    });
                    accountId = account.id;
                    await driverRef.update({ stripeAccountId: accountId, payoutsEnabled: false, chargesEnabled: false });
                }

                const accountLink = await getStripe().accountLinks.create({
                    account: accountId,
                    refresh_url: `${appBaseUrl}/driver/dashboard?connect=refresh`,
                    return_url:  `${appBaseUrl}/driver/dashboard?connect=return`,
                    type: 'account_onboarding',
                });

                return res.json({ url: accountLink.url });
            } catch (err) {
                logger.error('createConnectAccount failed', { driverId: decoded.uid, message: err?.message });
                return res.status(500).json({ error: 'Could not start payout setup. Please try again.' });
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /connectAccountStatus
// Driver-only. Returns the current onboarding/payout status of the driver's
// connected account, syncing payoutsEnabled/chargesEnabled to Firestore.
// ─────────────────────────────────────────────────────────────────────────────
exports.connectAccountStatus = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const driverRef  = db.collection('drivers').doc(decoded.uid);
            const driverSnap = await driverRef.get();
            if (!driverSnap.exists) return res.status(404).json({ error: 'Driver profile not found.' });

            const driver = driverSnap.data();
            if (!driver.stripeAccountId) return res.json({ connected: false });

            try {
                const account = await getStripe().accounts.retrieve(driver.stripeAccountId);
                const status = {
                    connected:       true,
                    chargesEnabled:  !!account.charges_enabled,
                    payoutsEnabled:  !!account.payouts_enabled,
                    detailsSubmitted: !!account.details_submitted,
                };
                await driverRef.update({
                    payoutsEnabled: status.payoutsEnabled,
                    chargesEnabled: status.chargesEnabled,
                });
                return res.json(status);
            } catch (err) {
                logger.error('connectAccountStatus failed', { driverId: decoded.uid, message: err?.message });
                return res.status(500).json({ error: 'Could not check payout status.' });
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /completeRide
// Driver-only. Server-side ride completion: computes the 80/20 split from the
// ride's stored price (never trusts a client-supplied amount), transfers the
// driver's 80% to their connected Stripe account when payouts are enabled, and
// atomically updates the ride + driver totals via the Admin SDK. This replaces
// the old client-side Firestore transaction that let a driver self-report
// their own earnings.
// Body: { rideId }
// ─────────────────────────────────────────────────────────────────────────────
exports.completeRide = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

            const decoded = await verifyAuth(req);
            if (!decoded) return res.status(401).json({ error: 'Unauthorized' });

            const rideId = sanitiseString(req.body?.rideId || '');
            if (!FIRESTORE_ID_RE.test(rideId)) return res.status(400).json({ error: 'Invalid ride reference.' });

            const rideRef  = db.collection('rides').doc(rideId);
            const rideSnap = await rideRef.get();
            if (!rideSnap.exists) return res.status(404).json({ error: 'Ride not found.' });

            const ride = rideSnap.data();
            if (ride.driverId !== decoded.uid)      return res.status(403).json({ error: 'Forbidden' });
            if (ride.status !== 'in_progress')      return res.status(409).json({ error: 'Ride is not in progress.' });
            if (ride.paymentStatus !== 'paid')       return res.status(402).json({ error: 'Ride has not been paid for yet.' });

            const amountPence       = Math.round(parseFloat(ride.price) * 100);
            const driverSharePence  = Math.round(amountPence * 0.8);
            const platformFeePence  = amountPence - driverSharePence;
            const driverEarnings    = driverSharePence / 100;
            const platformFee       = platformFeePence / 100;

            const driverRef  = db.collection('drivers').doc(decoded.uid);
            const driverSnap = await driverRef.get();
            const driver     = driverSnap.exists ? driverSnap.data() : {};

            let transferId = null;
            let transferred = false;

            // Only attempt a real payout once the driver has completed Stripe
            // Connect onboarding. Otherwise the ride still completes — earnings
            // are recorded — but the payout is deferred until they finish setup.
            if (driver.stripeAccountId && driver.payoutsEnabled) {
                try {
                    const transfer = await getStripe().transfers.create({
                        amount: driverSharePence,
                        currency: 'gbp',
                        destination: driver.stripeAccountId,
                        metadata: { rideId, driverId: decoded.uid },
                    });
                    transferId = transfer.id;
                    transferred = true;
                } catch (err) {
                    logger.error('Driver transfer failed', { rideId, driverId: decoded.uid, message: err?.message });
                    // Don't block ride completion on a payout failure — earnings are
                    // still recorded and can be reconciled/retried manually.
                }
            }

            try {
                await db.runTransaction(async (tx) => {
                    tx.update(rideRef, {
                        status:          'completed',
                        completedAt:     admin.firestore.FieldValue.serverTimestamp(),
                        driverEarnings,
                        platformFee,
                        transferId,
                        payoutStatus:    transferred ? 'paid' : 'pending_connect_setup',
                    });
                    tx.update(driverRef, {
                        earnings:      admin.firestore.FieldValue.increment(driverEarnings),
                        todayEarnings: admin.firestore.FieldValue.increment(driverEarnings),
                        weekEarnings:  admin.firestore.FieldValue.increment(driverEarnings),
                        totalRides:    admin.firestore.FieldValue.increment(1),
                    });
                });
            } catch (err) {
                logger.error('completeRide Firestore update failed', { rideId, message: err?.message });
                return res.status(500).json({ error: 'Ride payment succeeded but completion failed. Contact support.' });
            }

            // Notify the customer that their ride is complete
            const customerToken = ride.customerFcmToken;
            if (customerToken) {
                await sendFcmNotification(
                    customerToken,
                    'Ride complete!',
                    `You have arrived. Your fare was £${parseFloat(ride.price).toFixed(2)}.`,
                    '/status',
                );
            }

            return res.json({ success: true, driverEarnings, platformFee, transferred });
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
                });
                // Notify all online approved drivers with an FCM token about the new ride
                try {
                    const driversSnap = await db.collection('drivers')
                        .where('isOnline', '==', true)
                        .where('status',   '==', 'approved')
                        .get();
                    const notifyPromises = driversSnap.docs
                        .map(d => d.data().fcmToken)
                        .filter(Boolean)
                        .map(token => sendFcmNotification(
                            token,
                            'New ride request!',
                            'A customer needs a ride near you. Open the app to accept.',
                            '/driver/dashboard',
                        ));
                    await Promise.allSettled(notifyPromises);
                } catch (notifyErr) {
                    logger.warn('Driver FCM notify failed', { message: notifyErr?.message });
                }
                break;
            }
            case 'payment_intent.payment_failed': {
                const { rideId } = pi.metadata || {};
                if (!rideId || !FIRESTORE_ID_RE.test(rideId)) break;
                await db.collection('rides').doc(rideId).update({ paymentStatus: 'failed' });
                break;
            }
            default: break;
        }
        return res.json({ received: true });
    })().catch((err) => {
        logger.error('Webhook processing failed', { message: err?.message || 'unknown' });
        return res.status(500).json({ error: 'Webhook processing failed' });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// Probes every dependency and returns a structured JSON report.
// Overall status is 'ok' only when every check passes.
// ─────────────────────────────────────────────────────────────────────────────
exports.health = onRequest((req, res) => {
    compressResponse(req, res, () => {
        corsHandler(req, res, async () => {
            setSecurityHeaders(res);

            const checks = {};

            // ── Firestore: read a sentinel document only (no writes on health checks) ─
            try {
                const ref = db.collection('_health').doc('probe');
                const snap = await ref.get();
                checks.firestore = snap.exists ? 'ok' : 'missing_probe';
            } catch (e) {
                checks.firestore = `error: ${e.code || e.message}`;
            }

            // ── Stripe: validate that the secret key is set and parseable ─────
            checks.stripe = process.env.STRIPE_SECRET_KEY
                ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_') ? 'ok' : 'invalid_key_format')
                : 'missing';

            // ── Stripe webhook secret ─────────────────────────────────────────
            checks.stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET
                ? (process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_') ? 'ok' : 'invalid_key_format')
                : 'missing';

            // ── Required env vars ─────────────────────────────────────────────
            const REQUIRED_VARS = [
                'STRIPE_SECRET_KEY',
                'STRIPE_WEBHOOK_SECRET',
            ];
            const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);
            checks.envVars = missingVars.length === 0 ? 'ok' : `missing: ${missingVars.join(', ')}`;

            // ── In-memory fare cache ──────────────────────────────────────────
            checks.fareCache = `${fareCache.size}/${FARE_CACHE_MAX} entries`;

            const allOk = Object.values(checks).every(v => v === 'ok' || v.startsWith(`${FARE_CACHE_MAX - 1}/`) || v.includes('entries'));
            const overallOk = checks.firestore === 'ok' && checks.stripe === 'ok' && checks.envVars === 'ok';

            res.status(overallOk ? 200 : 503).json({
                status:    overallOk ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                checks,
            });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Firestore trigger: onRideStatusChange
// Fires whenever a ride document is updated. Sends a push notification to
// the customer when their driver is assigned or has arrived. The 'completed'
// status is handled directly in the completeRide Cloud Function above.
// ─────────────────────────────────────────────────────────────────────────────
exports.onRideStatusChange = onDocumentUpdated('rides/{rideId}', async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (!after || before?.status === after.status) return;

    const token = after.customerFcmToken;
    if (!token) return;

    if (after.status === 'driver_assigned') {
        await sendFcmNotification(
            token,
            'Driver on the way!',
            `${after.driverName || 'Your driver'} is heading to your pickup location.`,
            '/status',
        );
    } else if (after.status === 'arrived') {
        await sendFcmNotification(
            token,
            'Driver has arrived!',
            `${after.driverName || 'Your driver'} is waiting for you. Show your ride code.`,
            '/status',
        );
    }
});
