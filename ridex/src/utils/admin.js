// ── Admin identity (client side) ──────────────────────────────────────────────
// The admin is EITHER the email in REACT_APP_ADMIN_EMAIL (legacy) OR any user
// with a document at /admins/{uid} (the allow-list firestore.rules and the
// setDriverStatus Cloud Function also use). Rules only let a user read their
// own /admins doc, so this lookup is safe to run for anyone.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ADMIN_EMAIL = (process.env.REACT_APP_ADMIN_EMAIL || '').trim().toLowerCase();

/** Resolve whether a Firebase user is the platform admin. Never throws. */
export async function isAdminUser(user) {
    if (!user) return false;
    if (ADMIN_EMAIL && (user.email || '').trim().toLowerCase() === ADMIN_EMAIL) return true;
    try {
        const snap = await getDoc(doc(db, 'admins', user.uid));
        return typeof snap?.exists === 'function' ? snap.exists() : !!snap?.exists;
    } catch {
        return false;
    }
}
