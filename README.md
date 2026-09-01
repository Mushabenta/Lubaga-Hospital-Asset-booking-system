# Lubaga Hospital Asset Booking System

A hospital asset booking platform consisting of:

- **Frontend** — static HTML/CSS/JS pages (no build step), hosted on **Netlify**.
- **Backend** — Node.js + Express + PostgreSQL REST API, hosted on **Railway**.

Originally the frontend was a fully client-side `localStorage` app with no server. This
repo rebuilds and wires a complete production backend to the existing UI **without
changing any of the HTML/UI markup** — only the inline JavaScript logic was updated to
talk to the live API.

---

## Live URLs

| Component | URL |
|-----------|-----|
| Frontend (Netlify) | `https://lubaga-asset-booking-system.netlify.app/` |
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

On **Netlify** the frontend talks to the backend through a **same-origin proxy**, so the
browser never makes a cross-origin request and **no CORS is involved**. Requests to
`/api/*` on the Netlify domain are forwarded server-to-server by Netlify to the Railway
API (see `netlify.toml`):

- Frontend page → `GET/POST /api/...` (same origin, e.g. `https://<site>.netlify.app/api/...`)
- Netlify proxy → forwards to `https://lubaga-hospital-asset-booking-system-production.up.railway.app/api/...`
- Railway responds → Netlify streams the response back — same-origin to the browser.

Each frontend page resolves its API endpoint from:

```js
const API_BASE = (localStorage.getItem('lubaga_api_base') || '').replace(/\/+$/, '');
```

`API_BASE` is empty by default = same origin. For local development where the backend is
served by the Node server on the same origin this also works directly. To point the
frontend at a different backend (e.g. bypassing the proxy), set an override in the
browser console:

```js
localStorage.setItem('lubaga_api_base', 'https://lubaga-hospital-asset-booking-system-production.up.railway.app'); // production
localStorage.setItem('lubaga_api_base', 'http://localhost:5000'); // local Node server
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
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500,https://lubaga-hospital-asset-booking-syste.vercel.app,https://lubaga-asset-booking-system.netlify.app
```

- `DATABASE_URL` — required; the app refuses to start without it.
- `JWT_SECRET` — token-signing secret (64-byte hex generated; documented in
  `backend/.env.example`).
- `CORS_ORIGIN` — comma-separated frontend origin(s) allowed to call the API directly.
  With the Netlify proxy, requests are server-to-server (no browser `Origin`), so CORS is
  **not** applied — but keep the origins here anyway as a fallback for direct access.
- `SSL_DB=true` — set when your host requires TLS (Railway/Neon/Supabase do).
- `TEST_DATABASE_URL` — **required to run `npm test`**. Tests refuse to start without
  it to protect production data. Set this to any dedicated Postgres database (free Neon
  or Supabase tiers work). Tests truncate all tables on every run.

Non-browser callers (curl, Postman, server scripts) work regardless of `CORS_ORIGIN`
because requests without an `Origin` header are allowed.

---

## Hosting the frontend on Netlify

The frontend is served as static files from the repo root. Netlify publishes those files
and proxies the API to Railway, so the browser sees a single origin (no CORS).

1. **Push the repo to GitHub** (the `main` branch is the deployment branch).
2. In Netlify, choose **Add new site → Import an existing project → GitHub** and pick the
   repo.
3. Netlify auto-detects `netlify.toml`:
   - **Build command:** none (static site)
   - **Publish directory:** `/` (repo root)
   - `netlify.toml` also defines **proxy redirects** for `/api/*` and `/health` to the
     Railway API, so cross-origin requests are never made by the browser.
4. Deploy. The site is now live at `https://<your-site>.netlify.app/`.
   The default Netlify subdomain is what must be present in the backend `CORS_ORIGIN`
   (currently `https://lubaga-asset-booking-system.netlify.app`).
5. If you connect a **custom domain**, add that origin to `CORS_ORIGIN` on Railway too.

> **Why no CORS errors?** The browser calls `https://<site>.netlify.app/api/...` (same
> origin). Netlify forwards that to the Railway API server-to-server. Railway sees no
> browser `Origin` header, so it treats it as a non-browser caller and always allows it.
> The response comes back through Netlify to the browser as a normal same-origin response.

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

The API runs on `http://localhost:5000`. Since `API_BASE` now defaults to same-origin,
the locally served Node server (which serves both the pages and `/api`) works without
extra configuration. If you open the pages via a static server on another port (e.g.
Live Server on `:5500`), point them at the backend:

```js
localStorage.setItem('lubaga_api_base', 'http://localhost:5000');
```

---

## API reference

See [`backend/README.md`](backend/README.md) for the full endpoint reference, booking
engine rules, status transitions, and security notes.

---

## Status

- ✅ Backend rebuilt, tested (75/75), and seeded (admin, departments, categories, assets).
- ✅ All four frontend pages wired to the live API (UI markup unchanged).
- ✅ Deployed: backend on **Railway**, frontend on **Netlify** (with API proxy).
- ⚠️ Confirm the Railway service has all required variables set + deployed, and Netlify
  deployed from the `main` branch, before going live.
