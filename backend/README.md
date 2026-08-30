# Lubaga Hospital Asset Booking System — Backend

A rebuilt, production-quality REST API backend for a **Hospital Asset Booking System**.
It manages users, roles, departments, categories, assets, and a concurrency-safe
booking engine backed by **PostgreSQL**.

> The existing frontend was a fully client-side `localStorage` application with no
> backend calls. This backend provides the complete server-side implementation to
> which the frontend can be wired (see "Frontend integration").

## Tech Stack

- **Node.js** (CommonJS) + **Express 5**
- **PostgreSQL** via `pg` (connection pool, transactions, row locking, advisory locks)
- **JWT** (`jsonwebtoken`) authentication
- **bcryptjs** password hashing
- **express-validator** for request validation
- **helmet** + **express-rate-limit** for security
- **Jest + supertest** for automated testing

## Project Structure

```
backend/
├── src/
│   ├── app.js                  # Express app setup (middleware, routes, error handling)
│   ├── server.js               # Bootstrap: connect DB, init schema, listen
│   ├── config/
│   │   ├── env.js              # Environment configuration (validated)
│   │   ├── db.js               # PostgreSQL connection pool
│   │   ├── initDb.js           # Schema / table creation + booking exclusion constraint
│   │   └── seed.js             # Seed admin, departments, categories, default assets
│   ├── controllers/            # Thin HTTP handlers
│   ├── services/               # Business logic (incl. booking engine)
│   ├── models/                 # Data-access layer (parameterised SQL)
│   ├── middleware/             # auth (protect/roles), error handler, validation
│   ├── validators/             # request schemas
│   ├── routes/                 # route definitions
│   └── utils/                  # ApiError, asyncHandler, bookingRules
└── tests/                      # unit + integration tests
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example`. At minimum set the hosted `DATABASE_URL`:

   ```env
   DATABASE_URL=postgresql://user:password@host:5432/lubaga_hospital
   SSL_DB=true
   JWT_SECRET=<a long random secret>
   ```

3. Create the schema:

   ```bash
   npm run init:db
   ```

4. Seed an admin, departments, categories and default assets:

   ```bash
   npm run seed
   ```

5. Start the server:

   ```bash
   npm run dev    # nodemon
   # or
   npm start
   ```

Admin seeded via `.env` → `ADMIN_USERNAME` / `ADMIN_PASSWORD` (default `admin` / `admin123`).
**Change these immediately in production.**

## API Endpoints

All endpoints return a consistent envelope:

```json
// success
{ "success": true, "message": "...", "data": { } }
// error
{ "success": false, "message": "...", "error": "CODE" }
```

### Auth `/api/auth`
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /register | Register (first user becomes general_admin) | none |
| POST | /login | Login (username or email) → JWT | none |
| POST | /forgot-password | Reset password via phone | none |
| POST | /change-password | Change own password | user |
| GET | /me | Current user profile | user |

### Users `/api/users`
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | / | List users | admin |
| POST | / | Create an admin account (max 20 admins) | admin |
| PUT | /:id/toggle | Enable/disable a user | admin |
| DELETE | /:id | Delete a user | general admin |

### Assets `/api/assets`
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | / | List/search/filter/paginate | user |
| GET | /:id | Get one asset | user |
| POST | / | Create asset | admin |
| PUT | /:id | Update asset | admin |
| PATCH | /:id/status | Change asset status | admin |
| POST | /:id/specifications | Add a specification | admin |
| DELETE | /:id/specifications | Remove a specification (body `{spec}`) | admin |
| DELETE | /:id | Delete asset (blocked if referenced by a booking) | admin |

### Bookings `/api/bookings` (core engine)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | / | List bookings (staff: own only; admin: all) | user |
| GET | /stats | Dashboard counts (scoped to role) | user |
| POST | /availability | Check availability for an asset/period | user |
| POST | / | Create a booking (conflict-safe) | user |
| GET | /:id | Get one booking | user |
| POST | /:id/approve | Approve a pending booking | admin |
| POST | /:id/reject | Reject a pending booking | admin |
| POST | /:id/cancel | Cancel (staff: own; admin: any) | user |
| POST | /:id/activate | Mark approved booking active | admin |
| POST | /:id/complete | Mark active booking completed (return) | admin |

### References
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/departments | List departments | user |
| GET | /api/categories | List asset categories | user |
| POST | /api/categories | Create a category | admin |
| DELETE | /api/categories/:id | Delete a category | admin |

### Audit
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/audit-logs | View audit logs | general admin |

## Booking engine

Prevents **double booking, overlapping bookings, booking unavailable/retired assets,
past dates, and end-before-start**, enforces authorization on cancellation, and
defines strict, valid-only status transitions.

**Overlap rule (half-open interval):** a new period `[S, E)` conflicts with an
existing booking `[A, B)` when `A < E && S < B`. Back-to-back periods
(e.g. existing `10:00–12:00`, new `12:00–14:00`) are **allowed**.

**Status transitions:**
```
pending  -> approved | rejected | cancelled
approved -> active   | cancelled
active   -> completed
rejected|cancelled|completed -> (terminal)
```

**Concurrency safety** (the check-then-insert race). For every booking creation:
1. `BEGIN` a transaction.
2. Take an **advisory lock** scoped to the asset (`pg_advisory_xact_lock`), serialising
   concurrent attempts on the same asset.
3. `SELECT ... FOR UPDATE` the asset row; verify it exists and is `available`.
4. Re-check for overlapping bookings inside the same transaction.
5. Insert; `COMMIT`.
6. Optionally reinforced by a DB-level **GiST exclusion constraint**
   (`bookings_no_overlap` — enabled automatically when `btree_gist` is available).

**Asset status vs booking status** are kept separate. Booking an asset does not change
the asset's status; the asset is "occupied" only indirectly via its bookings.

## Security

- Passwords hashed with **bcrypt** (never stored plaintext).
- **JWT** auth; role is **never** accepted from the client (server assigns role).
- Role-based authorization enforced **server-side** (`protect` + role middleware).
- All SQL uses **parameterised queries** (no injection).
- `helmet` security headers; `express-rate-limit` (global + stricter on auth).
- CORS restricted to configured origins.
- Centralised error handler — **no stack traces / SQL / secrets leaked** to clients.
- Secrets (JWT secret, DB URL) loaded from `.env`, never in source.

## Tests

```bash
npm test
```

- `tests/bookingRules.test.js` — **pure unit tests** (no DB): overlap boundaries,
  back-to-back allowed, date validation, asset bookability, status transitions.
- `tests/auth.test.js`, `tests/asset.test.js`, `tests/booking.test.js` — **integration
  tests** (Jest + supertest) against a live PostgreSQL via `DATABASE_URL`. They cover
  authentication, RBAC / privilege escalation, asset CRUD, booking conflicts,
  workflow/transitions, scoping, availability, and concurrent booking attempts.

## Frontend integration

The existing HTML frontend stores all data in browser `localStorage` and makes no
API calls. To connect it to this backend, the frontend must be rewired to call these
endpoints with a `Bearer` token from `/api/auth/login`. This is a frontend change and
has not been performed (per scope). The backend is designed to mirror the domain
(users/roles, assets + specifications, bookings with an approval/return workflow).

## Status

- Backend implementation: **complete**.
- Pure unit tests: **passing** (19/19).
- Integration tests: **written but not yet executed** — they require the hosted
  `DATABASE_URL`. Run `npm run init:db`, `npm run seed`, then `npm test` once the
  connection string is configured.
