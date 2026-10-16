# RideX

**A ride-hailing platform with customer, driver and admin portals.** It's a personal portfolio project modelled on a real-world brief: one person's build, not client work.

Live demo: **[uber-demo-omega.vercel.app](https://uber-demo-omega.vercel.app/)**

## What it does

- **Customers:** book a ride on a Mapbox map with an upfront fare estimate, pay by card with Stripe (including 3-D Secure), follow the ride's status live and see their ride history.
- **Drivers:** go online or offline, accept and complete rides, see earnings and receipts, and set up Stripe Connect payouts.
- **Admins:** a dashboard to monitor rides and manage drivers.

## How it's built

- **Frontend:** React 19, React Router, Tailwind CSS and Recharts, with protected routes per role (customer, driver, admin) and an error boundary.
- **Backend:** Node.js Firebase Cloud Functions, which make up 8 REST endpoints (fare estimate, ride history, payment intent, driver status, Connect onboarding and status, ride completion, health) plus a Stripe webhook and a Firestore trigger on ride status changes.
- **Security:**
  - Server-side Firebase ID-token checks on the protected endpoints.
  - Per-IP rate limiting (100 requests per 15 minutes).
  - Firestore security rules per role.
- **Payments:** Stripe PaymentIntents with 3-D Secure. Ride completion runs on the server and computes the 80/20 driver/platform split.
- **Real-time dispatch:** Firestore listeners and transactions, so one ride can't be booked twice.
- **Testing:** Jest and React Testing Library.

## Running it locally

All npm commands run from the `ridex/` folder.

```bash
cd ridex
npm install
npm start          # http://localhost:3000
npm test
```

You'll need your own Firebase project, Stripe test keys and a Mapbox token, set as `REACT_APP_FIREBASE_*`, `REACT_APP_STRIPE_PUBLISHABLE_KEY` and `REACT_APP_MAPBOX_TOKEN` in `ridex/.env`. Cloud Functions live in `ridex/functions/`.

## Author

**Soma Shekar Keesari** · [LinkedIn](https://www.linkedin.com/in/shekar-keesari/) · [Portfolio](https://shekar-portfolio-eight.vercel.app/)
