import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '../firebase';

// Set in Vercel: Project Settings → Environment Variables → REACT_APP_FIREBASE_VAPID_KEY
// Generate in Firebase Console → Project Settings → Cloud Messaging → Web push certificates → Generate key pair
const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

// `navigator.serviceWorker.ready` never resolves when no worker is registered
// (development, or iOS Safari outside an installed PWA) — cap the wait.
const SW_READY_TIMEOUT_MS = 8000;

/** True when this browser can show push notifications at all. */
export const notificationsSupported =
    typeof window !== 'undefined'
    && typeof Notification !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator;

/** Human-readable explanation for a failed requestPermission() `reason`. */
export function describeNotificationFailure(reason) {
    switch (reason) {
        case 'unsupported': return 'Notifications aren’t supported in this browser. On iPhone, add RideX to your Home Screen first.';
        case 'no-vapid':    return 'Notifications aren’t configured for this deployment yet.';
        case 'denied':      return 'Notifications are blocked. Enable them for RideX in your browser or phone settings.';
        case 'sw-timeout':  return 'Notifications need the installed app. Add RideX to your Home Screen and try again.';
        default:            return 'Could not enable notifications. Please try again later.';
    }
}

// Send Firebase config to the service worker so it can handle background messages
// when the app is not in the foreground.
function sendConfigToSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({
            type:   'FIREBASE_CONFIG',
            config: {
                apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
                authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
                projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
                storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
                appId:             process.env.REACT_APP_FIREBASE_APP_ID,
            },
        });
    }).catch(() => {});
}

// Older Safari uses the legacy callback signature and returns undefined.
function requestNativePermission() {
    return new Promise((resolve) => {
        try {
            const maybePromise = Notification.requestPermission((p) => resolve(p));
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(resolve, () => resolve(Notification.permission));
            }
        } catch {
            resolve(Notification.permission);
        }
    });
}

function swReadyWithTimeout() {
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), SW_READY_TIMEOUT_MS)),
    ]);
}

// Returns: { supported, permission, token, error, requestPermission }
// permission: 'default' | 'granted' | 'denied'
// requestPermission(): async → { token, permission, reason }
//   reason: null on success, else 'unsupported' | 'no-vapid' | 'denied' |
//           'no-messaging' | 'sw-timeout' | 'error'
export function useNotifications({ onForegroundMessage } = {}) {
    const [permission, setPermission] = useState(
        notificationsSupported ? Notification.permission : 'denied'
    );
    const [token, setToken]  = useState(null);
    const [error, setError]  = useState(null);
    const msgRef             = useRef(null);
    const msgFailedRef       = useRef(false);
    // Latest handler in a ref so an inline callback never resubscribes onMessage
    const handlerRef         = useRef(onForegroundMessage);
    useEffect(() => { handlerRef.current = onForegroundMessage; }, [onForegroundMessage]);

    function getMsg() {
        if (msgRef.current) return msgRef.current;
        if (msgFailedRef.current) return null;
        try {
            msgRef.current = getMessaging(app);
            return msgRef.current;
        } catch {
            msgFailedRef.current = true;
            return null;
        }
    }

    const requestPermission = useCallback(async () => {
        if (!notificationsSupported) return { token: null, permission: 'denied', reason: 'unsupported' };
        if (!VAPID_KEY) return { token: null, permission: Notification.permission, reason: 'no-vapid' };

        let perm = Notification.permission;
        try {
            perm = await requestNativePermission();
            setPermission(perm);
            if (perm !== 'granted') return { token: null, permission: perm, reason: 'denied' };

            const messaging = getMsg();
            if (!messaging) return { token: null, permission: perm, reason: 'no-messaging' };

            // Seed the SW with the Firebase config before requesting the push token
            // so background messages work immediately after permission is granted.
            sendConfigToSW();

            const swReg = await swReadyWithTimeout();
            const fcmToken = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: swReg,
            });
            if (!fcmToken) return { token: null, permission: perm, reason: 'error' };
            setToken(fcmToken);
            setError(null);
            return { token: fcmToken, permission: perm, reason: null };
        } catch (err) {
            const reason = err?.message === 'sw-timeout' ? 'sw-timeout' : 'error';
            setError(describeNotificationFailure(reason));
            return { token: null, permission: perm, reason };
        }
    }, []);

    // Listen for messages while the app is in the foreground
    const hasHandler = !!onForegroundMessage;
    useEffect(() => {
        if (permission !== 'granted' || !hasHandler) return undefined;
        const messaging = getMsg();
        if (!messaging) return undefined;
        return onMessage(messaging, (payload) => handlerRef.current?.(payload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permission, hasHandler]);

    // On mount: if already granted, ensure the SW has the Firebase config
    useEffect(() => {
        if (permission === 'granted') sendConfigToSW();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { supported: notificationsSupported, permission, token, error, requestPermission };
}
