import { useCallback, useEffect, useRef, useState } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '../firebase';

// Set in Vercel: Project Settings → Environment Variables → REACT_APP_FIREBASE_VAPID_KEY
// Generate in Firebase Console → Project Settings → Cloud Messaging → Web push certificates → Generate key pair
const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

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

// Returns: { permission, token, error, requestPermission }
// permission: 'default' | 'granted' | 'denied'
// token: FCM token string (once granted), or null
// requestPermission(): async — prompts the user, registers the SW, returns the token or null
export function useNotifications({ onForegroundMessage } = {}) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [token, setToken]  = useState(null);
  const [error, setError]  = useState(null);
  const msgRef             = useRef(null);

  function getMsg() {
    if (msgRef.current) return msgRef.current;
    try {
      msgRef.current = getMessaging(app);
      return msgRef.current;
    } catch {
      return null;
    }
  }

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return null;
    if (!VAPID_KEY) return null;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return null;

      const messaging = getMsg();
      if (!messaging) return null;

      // Seed the SW with the Firebase config before requesting the push token
      // so background messages work immediately after permission is granted.
      sendConfigToSW();

      const swReg = await navigator.serviceWorker.ready;
      const fcmToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });
      setToken(fcmToken);
      return fcmToken;
    } catch {
      setError('Could not enable notifications. Please try again later.');
      return null;
    }
  }, []);

  // Listen for messages while the app is in the foreground
  useEffect(() => {
    if (permission !== 'granted' || !onForegroundMessage) return;
    const messaging = getMsg();
    if (!messaging) return;
    return onMessage(messaging, onForegroundMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, onForegroundMessage]);

  // On mount: if already granted, ensure the SW has the Firebase config
  useEffect(() => {
    if (permission === 'granted') sendConfigToSW();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { permission, token, error, requestPermission };
}
