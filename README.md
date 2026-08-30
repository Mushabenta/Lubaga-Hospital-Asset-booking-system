# Lubaga Hospital Asset Booking System

A hospital asset booking platform consisting of:

- **Frontend** — static HTML/CSS/JS pages (no build step), hosted on **Vercel**.
- **Backend** — Node.js + Express + PostgreSQL REST API, hosted on **Railway**.

Originally the frontend was a fully client-side `localStorage` app with no server. This
repo rebuilds and wires a complete production backend to the existing UI **without
changing any of the HTML/UI markup** — only the inline JavaScript logic was updated to
talk to the live API.

---

## Live URLs

| Component | URL |
|-----------|-----|
| Frontend (Vercel) | `https://lubaga-hospital-asset-booking-syste.vercel.app/` |
| Backend API (Railway) | `https://lubaga-hospital-asset-booking-system-production.up.railway.app/` |
| API base path | `https://lubaga-hospital-asset-booking-system-production.up.railway.app/api` |
| GitHub | `https://github.com/Mushabenta/Lubaga-Hospital-Asset-booking-system` |

---

## Test Logins (live system)

These credentials are seeded into the production database. Login at the frontend URL.

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| **Admin** | `admin` | `admin123` | General admin; full dashboard + user/asset management |
| **Staff** | *(register one)* | — | Registration creates a staff account (`general_admin` role is auto-assigned to the very first user only) |

> ⚠️ Change the admin password in production via the backend env
> (`ADMIN_PASSWORD`) — the default is for testing only.

Staff flow: open the frontend → **Register** to create your account (auto-logs-in) →
book an asset. Admin flow: login as `admin` → **admin dashboard** → approve/reject and
return bookings, manage users and assets.

---

## Repository layout

```
├── index.html          # Login / forgot password / me  (wired)
├── register.html       # Registration + auto-login     (wired)
├── user-dashboard.html # Staff dashboard & bookings     (wired)
├── admin-dashboard.html# Admin dashboard               (wired)
├── assets.html         # Legacy static page (kept as-is)
├── dashboard.html      # Legacy static page (kept as-is)
├── lubaga logo.png     # Brand asset
├── lubaga badge.webp   # Brand asset
└── backend/            # Node/Express/PostgreSQL REST API (see its README)
```

---

## Frontend → Backend wiring

Each frontend page resolves its API endpoint from:

```js
const API_BASE =
  (localStorage.getItem('lubaga_api_base') ||
   'https://lubaga-hospital-asset-booking-system-production.up.railway.app')
  .replace(/\/+$/, '');
```

- **Default** — points at the deployed Railway backend (already baked into the pages).
- **Override** — set `lubaga_api_base` in the browser dev-tools console to send requests
  elsewhere (e.g. a local server), useful for development:

  ```js
  localStorage.setItem('lubaga_api_base', 'http://localhost:5000'); // local backend
  localStorage.setItem('lubaga_api_base', 'https://lubaga-hospital-asset-booking-system-production.up.railway.app'); // production
  localStorage.removeItem('lubaga_api_base'); // back to default
  ```

What the rewired pages now do (UI untouched):

- **Auth**: login/register/forgot/me through `/api/auth/*`, storing
  `lubaga_token`, `lubaga_user`, `lubaga_session` in localStorage.
- **Staff dashboard**: loads assets (`/api/assets` → grouped by category), lists own
  bookings (`/api/bookings`, filtered by requestor), creates a booking (2-hour slot,
  `end_time = start_time + BOOKING_DURATION_HOURS`), and cancels pending requests.
- **Admin dashboard**: session via `/api/auth/me`; bookings with approve (`:id/approve`),
  reject (`:id/reject`) and return (`activate` then `complete`); user management
  (`GET/POST /api/users`, `PUT :id/toggle`); asset manager over
  `/api/categories` + `/api/assets`.
- The old `localStorage` persistence helpers (`saveAssets`, `saveRequests`, `saveUsers`)
  are now no-ops — the backend owns the data.

---

## Required backend environment variables (Railway)

The deployed backend requires these variables. Add them in the **Railway dashboard →
service → Variables** and let it redeploy.

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE   # your hosted PostgreSQL
JWT_SECRET=<512-bit hex secret — see backend/.env.example>
JWT_EXPIRY=24h
SSL_DB=true
NODE_ENV=production
CORS_ORIGIN=https://lubaga-hospital-asset-booking-syste.vercel.app
```

- `DATABASE_URL` — required; the app refuses to start without it.
- `JWT_SECRET` — token-signing secret (64-byte hex generated; documented in
  `backend/.env.example`).
- `CORS_ORIGIN` — comma-separated frontend origin(s) allowed to call the API. Must
  include the Vercel URL or the browser will block requests.
- `SSL_DB=true` — set when your host requires TLS (Railway/Neon/Supabase do).

Non-browser callers (curl, Postman, server scripts) work regardless of `CORS_ORIGIN`
because requests without an `Origin` header are allowed.

---

## Running locally

Frontend (static — open any page directly or serve `backend/` static files). Backend:

```bash
cd backend
npm install
cp .env.example .env        # then set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm run init:db
npm run seed
npm run dev
```

The API runs on `http://localhost:5000` and the API base defaults there in development.

---

## API reference

See [`backend/README.md`](backend/README.md) for the full endpoint reference, booking
engine rules, status transitions, and security notes.

---

## Status

- ✅ Backend rebuilt, tested (75/75), and seeded (admin, departments, categories, assets).
- ✅ All four frontend pages wired to the live API (UI markup unchanged).
- ✅ Deployed: backend on **Railway**, frontend on **Vercel**.
- ⚠️ Confirm the Railway service has all required variables set + deployed, and Vercel
  redeployed, before going live.
