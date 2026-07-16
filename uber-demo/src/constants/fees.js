// Fare split constants — single source of truth for the client.
// Must match DRIVER_SHARE in functions/index.js completeRide (the server-side
// split that actually moves money via Stripe Connect). If Amit negotiates a
// different commission, change it HERE and in functions/index.js together.
export const DRIVER_SHARE   = 0.8;  // driver receives 80% of the fare
export const PLATFORM_SHARE = 0.2;  // platform (Amit) keeps 20% commission
