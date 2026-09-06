# Lubaga Hospital Asset Booking System — Backend

Production REST API for the Hospital Asset Booking System. Manages users, roles,
departments, categories, assets, and a **concurrency-safe booking engine** backed by
**PostgreSQL**. Sends booking notifications over **Gmail SMTP**.

Live instance (Railway):

- Base URL: `https://lubaga-hospital-asset-booking-system-production.up.railway.app/`
- API root: `.../api`

---

## 1. Tech stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js (CommonJS), Express 5 |
| Database | PostgreSQL via `pg` (pool, transactions, row locks, advisory locks) |
| Auth | JWT (`jsonwebtoken`, 24h expiry), `bcryptjs` hashing |
| Validation | `express-validator` |
| Security | `helmet` (CSP), `express-rate-limit`, CORS allowlist |
| Email | `nodemailer` (Gmail SMTP) |
| Tests | Jest + supertest |

---

## 2. Project structure

```
backend/
├── src/
│   ├── app.js                  # Express app: security middleware, static files, routing
│   ├── server.js               # Bootstrap: connect DB → init schema → listen
│   ├── config/
│   │   ├── env.js              # Environment configuration (validated, `.env`-loaded)
│   │   ├── db.js               # PostgreSQL connection pool
│   │   ├── initDb.js           # Schema creation + booking exclusion constraint
│   │   └── seed.js             # Seeds admin, departments, categories, default assets
│   ├── middleware/
│   │   ├── auth.js             # protect (JWT), authorize/adminOnly/generalAdminOnly
│   │   ├── validate.js         # Runs express-validator result
│   │   └── error.js            # success() helper, 404 handler, error converter/handler
│   ├── validators/index.js     # Request schemas (auth, user, asset, booking)
│   ├── routes/                 # Route definitions per resource
│   ├── controllers/            # Thin HTTP handlers (parse req → call service → respond)
│   ├── services/               # Business logic, incl. the booking engine + email
│   ├── models/                 # Parameterised SQL data-access layer
│   └── utils/                  # ApiError, asyncHandler, bookingRules (pure rules)
└── tests/                      # Unit + integration tests
```

Layering: **routes → controllers → services → models → PostgreSQL**. Services never
touch `req`/`res`; controllers never touch SQL; models never expose `req`.

---

## 3. Roles & authentication

### Roles
| Role | Level | Powers |
|------|-------|--------|
| `staff` | default | Register, book assets, cancel own pending bookings, view own data |
| `admin` | elevated | Approve/reject/give-out/return bookings, manage users & assets |
| `general_admin` | highest | Everything above + create admins + delete users + view audit logs |

- The **first registered user** is auto-assigned `general_admin` (bootstrapping).
  Everyone after that is `staff`.
- Roles are **never accepted from the client** — the server always decides.
- Admins are limited to a **maximum of 20** accounts.

### Authentication
- `POST /api/auth/login` with `username`/`email` + `password` → `{ token, user }`.
- Send the token on protected calls as `Authorization: Bearer <token>`.

---

## 4. Setup (local development)

```bash
cd backend
npm install
cp .env.example .env        # then fill in real values (see §11)
npm run init:db             # creates schema
npm run seed                # seeds admin, departments, categories, assets
npm run dev                 # nodemon on http://localhost:5000
# or: npm start
```

Scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start with nodemon (auto-restart) |
| `npm start` | Start in production |
| `npm run init:db` | Create schema (`CREATE TABLE IF NOT EXISTS` + indexes + exclusion constraint) |
| `npm run seed` | Idempotent seed: admin, departments, categories, default assets |
| `npm test` | Jest unit + integration tests |
| `npm run test:watch` | Watch mode for tests |

---

## 5. Database schema

Created by `initDb.js` (idempotent). All tables get `created_at`/`updated_at`.

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| username | VARCHAR(60) UNIQUE | |
| email | VARCHAR(160) UNIQUE | |
| phone | VARCHAR(30) UNIQUE | |
| password_hash | TEXT | bcrypt, never plaintext |
| role | VARCHAR(30) | `staff` \| `admin` \| `general_admin` (CHECK) |
| service_element | VARCHAR(160) | |
| department | VARCHAR(160) | |
| active | BOOLEAN | Disabled users cannot log in |

### `categories`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(120) UNIQUE | e.g. Laptop, Projector |

### `departments`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(160) UNIQUE | |
| service_element | VARCHAR(160) | groups departments |

### `assets`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(160) UNIQUE | |
| code | VARCHAR(60) UNIQUE | generated when seeding |
| category_id | FK → categories | `ON DELETE SET NULL` |
| description / department / location / serial_number / image_url | TEXT/VARCHAR | |
| condition_name | VARCHAR(60) | `Good` \| `Fair` \| `Poor` \| `Damaged` (CHECK) |
| status | VARCHAR(30) | `available` \| `under_maintenance` \| `damaged` \| `retired` \| `unavailable` (CHECK) |

### `asset_specifications`
One asset has many specifications (e.g. laptop model names). `UNIQUE(asset_id, specification)`, `ON DELETE CASCADE`.

### `bookings`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| asset_id | FK → assets | `ON DELETE RESTRICT` (must not delete assets with bookings) |
| user_id | FK → users | `ON DELETE RESTRICT` |
| start_time / end_time | TIMESTAMPTZ | `CHECK (end_time > start_time)` |
| purpose | TEXT | |
| status | VARCHAR(30) | `pending` \| `approved` \| `rejected` \| `cancelled` \| `active` \| `completed` (CHECK) |
| power_code, power_extension, hdmi_adapter | BOOLEAN | projector accessories |
| vga_hdmi | VARCHAR(30) | |
| approved_by | FK → users | `ON DELETE SET NULL` |
| date_approved / date_given_out / date_returned | TIMESTAMPTZ | |
| returned_by | VARCHAR(160) | |
| notes | TEXT | |

Indexes: `assets(status)`, `assets(category_id)`, `bookings(asset_id)`, `bookings(user_id)`, `bookings(status)`, `bookings(start_time, end_time)`, `audit_logs(entity, entity_id)`.

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| user_id | FK → users | `ON DELETE SET NULL` |
| action | VARCHAR(120) | e.g. `BOOKING_APPROVED`, `USER_LOGIN` |
| entity / entity_id | VARCHAR(60) / INTEGER | what was acted upon |
| details | JSONB | extra context |

**Optional DB-level overlap guard:** `initDb` tries to enable a GiST exclusion
constraint `bookings_no_overlap` (`asset_id WITH =` + `tstzrange(...,...) WITH &&`
for `pending/approved/active` bookings). Requires `btree_gist`; if the host forbids
`CREATE EXTENSION`, it is skipped and the app-level locks still prevent double booking.

---

## 6. Response envelope

Success:
```json
{ "success": true, "message": "Login successful", "data": { } }
```

Error:
```json
{ "success": false, "message": "human readable message", "error": "MACHINE_CODE" }
```

Common error codes: `NO_TOKEN`, `INVALID_TOKEN`, `FORBIDDEN`, `RATE_LIMITED`,
`VALIDATION_ERROR`, `NOT_FOUND`, `INVALID_CREDENTIALS`, `BOOKING_CONFLICT`,
`INVALID_TRANSITION`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `PHONE_TAKEN`, etc.
Validation failures return `400` with `error: "VALIDATION_ERROR"` and `message` listing
the first failing field rule.

---

## 7. API reference

All routes below `API_BASE` (e.g. `https://host/api`). `Auth` column: **none**, **user**
(any authenticated), **admin**, **general**.

### 7.1 Auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | none | Register; first user → `general_admin`, rest → `staff` |
| POST | `/login` | none | Login with username or email |
| POST | `/forgot-password` | none | Reset password by phone + newPassword |
| GET | `/me` | user | Current user profile |
| POST | `/change-password` | user | Change own password |

**Register / Create-body**
```jsonc
{
  "username": "jane",
  "email": "jane@lubaga.org",
  "phone": "0772123457",           // must match ^07[0-9]{8}$
  "password": "secret123",         // min 6 chars
  "serviceElement": "ICT Office",  // required (registry: service_element)
  "department": "Information Mgmt, QA & QI"
}
```
Response (register/login):
```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "user": { "id": 1, "username": "jane", "email": "...", "phone": "...",
              "role": "staff", "service_element": "...", "department": "...", "active": true }
  }
}
```

**forgot-password body:** `{ "phone": "0772123457", "newPassword": "newpass1" }`

### 7.2 Users — `/api/users`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | admin | List all users |
| POST | `/` | general | Create an `admin` account (max 20 admins) |
| PUT | `/:id/toggle` | admin | Enable/disable a user (not self, not general_admin) |
| DELETE | `/:id` | general | Delete a user (blocked if they have bookings, or self) |

### 7.3 Assets — `/api/assets`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | user | List/search/filter/paginate |
| GET | `/:id` | user | Get one asset |
| POST | `/` | admin | Create asset (optional `specifications[]`) |
| PUT | `/:id` | admin | Update fields + replace `specifications[]` if provided |
| PATCH | `/:id/status` | admin | Change status only |
| POST | `/:id/specifications` | admin | Add a specification (`{ "spec": "..." }`) |
| DELETE | `/:id/specifications` | admin | Remove a specification |
| DELETE | `/:id` | admin | Delete (blocked if referenced by any booking) |

**Asset object** (from GET):
```jsonc
{
  "id": 1, "name": "Dell Latitude 5420", "code": "LAPTOP-100",
  "category_id": 1, "category": "Laptop",
  "description": "", "department": "", "location": "", "serial_number": "",
  "condition_name": "Good", "status": "available", "image_url": "",
  "specifications": ["Dell Latitude 5420", "HP EliteBook 840"],
  "created_at": "...", "updated_at": "..."
}
```

List query params: `search`, `status`, `categoryId`, `department`, `page`, `limit`
(max 200). Returns `{ assets, total, page, limit }`.

**Create body**
```jsonc
{
  "name": "Dell Latitude 5420",
  "code": "LAPTOP-100",
  "category_id": 1,
  "status": "available",
  "condition_name": "Good",
  "specifications": ["Dell Latitude 5420"]
}
```

### 7.4 Bookings — `/api/bookings` (core engine)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | user | Staff see only their own; admins see all |
| GET | `/stats` | user | Dashboard counts + top/bottom asset usage |
| POST | `/availability` | user | Check if an asset is free for a period |
| POST | `/` | user | Create a booking (conflict-safe) |
| GET | `/:id` | user | Get one booking (staff: own only) |
| POST | `/:id/approve` | admin | Approve a pending booking → emails user |
| POST | `/:id/reject` | admin | Reject (optional `reason`) → emails user |
| POST | `/:id/cancel` | user | Cancel (staff: own only; admin: any) |
| POST | `/:id/activate` | admin | Mark given-out (return clock starts, `date_given_out`) → emails user |
| POST | `/:id/complete` | admin | Mark returned (`returned_by`, `notes` optional) → emails user |

**Create body**
```jsonc
{
  "asset_id": 3,
  "start_time": "2026-09-08T08:00:00.000Z",
  "end_time": "2026-09-08T10:00:00.000Z",
  "purpose": "Committee meeting presentation",
  "power_code": false,
  "power_extension": false,
  "vga_hdmi": "HDMI",
  "hdmi_adapter": true,
  "notes": ""
}
```

**Booking object** (from GET):
```jsonc
{
  "id": 10, "asset_id": 3, "asset_name": "Epson EB-2150W", "asset_code": "PROJECTOR-100",
  "category": "Projector", "asset_specifications": ["Epson EB-2150W"],
  "user_id": 5, "requestor": "jane", "email": "jane@lubaga.org", "phone": "0772123457",
  "user_service_element": "...", "user_department": "...",
  "start_time": "...", "end_time": "...", "purpose": "...", "status": "pending",
  "power_code": false, "power_extension": false, "vga_hdmi": "HDMI", "hdmi_adapter": true,
  "approved_by": null, "approved_by_name": null, "date_approved": null,
  "date_given_out": null, "returned_by": "", "date_returned": null,
  "notes": "", "created_at": "...", "updated_at": "..."
}
```

**Stats** (`GET /api/bookings/stats`):
```json
{
  "success": true,
  "data": {
    "stats": {
      "total": 24, "pending": 3, "approved": 4, "active": 2,
      "completed": 12, "rejected": 2, "cancelled": 1,
      "mostBooked": [ { "id": 1, "asset_name": "...", "asset_code": "...", "booking_count": 6 } ],
      "leastBooked": [ ... ]
    }
  }
}
```

**Availability** (POST `/availability`): body `{ asset_id, start_time, end_time }` →
```json
{ "success": true, "data": { "asset_id": 3, "status": "available", "available": true, "conflicts": 0 } }
```

### 7.5 References
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/categories` | user | List categories |
| POST | `/api/categories` | admin | Create category (`{ "name": "..." }`) |
| DELETE | `/api/categories/:id` | admin | Delete category |
| GET | `/api/departments` | user | List departments (name + service_element) |

### 7.6 Audit
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit-logs` | general | View audit trail (query: `page`, `limit`) |

### 7.7 Health
| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | none |
| GET | `/api/health` | none |

`GET /api` returns an API index (name, version, endpoint map).

---

## 8. Booking engine

### Overlap rule (half-open interval)
New period `[S, E)` conflicts with existing `[A, B)` when **`A < E && S < B`**.
Back-to-back (existing `10:00–12:00`, new `12:00–14:00`) is **allowed**.
Only statuses that occupy the asset count: **pending, approved, active**.

### Time validation
- `end_time` must be strictly after `start_time` (`END_BEFORE_START`).
- `start_time` must not be in the past (`PAST_BOOKING`). A **10-minute grace period**
  is allowed so "Book Now" survives network/clock skew.

### Bookable assets
Only assets with status **`available`** can be booked (`ASSET_UNAVAILABLE` if not;
`ASSET_RETIRED` if `retired`).

### Status machine
```
pending  -> approved | rejected | cancelled
approved -> active   | cancelled
active   -> completed
rejected | cancelled | completed -> terminal (no further transitions)
```
Invalid transitions return `400 INVALID_TRANSITION`.

### Concurrency safety (check-then-insert race)
1. `BEGIN` transaction.
2. **Advisory lock** scoped to asset (`pg_advisory_xact_lock(asset_id)`) — serialises
   simultaneous attempts on the same asset.
3. `SELECT ... FOR UPDATE` the asset row; verify exists + `available`.
4. Re-check conflicts inside the transaction.
5. Insert + `COMMIT`.
6. Optional DB-level **GiST exclusion constraint** `bookings_no_overlap` reinforces the
   same rule at the database level when `btree_gist` is available.

### Asset status vs booking status
Bookings do **not** change the asset's status. An asset is "occupied" only indirectly
through its overlapping bookings.

---

## 9. Email notifications

`nodemailer` + Gmail SMTP. Emails are sent **fire-and-forget** (never block the API
response; failures are logged, not thrown).

| Event | Recipient | Template |
|-------|-----------|----------|
| New booking created | All active admins | "New Asset Booking Request - `<asset>`" |
| Booking approved | Requesting user | "Booking Approved - `<asset>`" (green) |
| Booking rejected | Requesting user | "Booking Rejected - `<asset>`" (red) |
| Asset given out (`activate`) | Requesting user | "Asset Given Out - `<asset>`" (blue, return within 3 days) |
| Booking returned (`complete`) | Requesting user | "Asset Returned - `<asset>`" (teal) |

Emails are skipped gracefully when `EMAIL_USER`/`EMAIL_PASS` are unset (a warning is
logged). See `services/emailService.js`.
> For production on Gmail use an **App Password** (2FA required), never the account
> password.

---

## 10. Security

- **bcrypt** password hashing (cost 10); no plaintext storage.
- **JWT auth**; role assigned server-side, never read from the request.
- **RBAC middleware** (`protect` + `adminOnly`/`generalAdminOnly`) enforced on every
  route; restricted resources are server-checked.
- **Parameterised SQL** everywhere — no SQL injection.
- **helmet** with a CSP that allows the frontend's CDNs (jsdelivr) + same-origin API.
- **Rate limiting**: global 300 req/15 min; auth endpoints 50 req/15 min.
- **CORS** restricted to `CORS_ORIGIN` allowlist; requests without an `Origin` header
  (curl, server-to-server proxy) are always allowed.
- **Centralised error handler** — no stack traces, SQL, or secrets leak to clients.
- Body limit `1mb`; `X-Content-Type-Options: nosniff` via helmet.
- Seeded admin credentials come from env (`ADMIN_USERNAME`/`ADMIN_PASSWORD`).

---

## 11. Environment variables

See `backend/.env.example`. All loaded through `src/config/env.js`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **yes** | PostgreSQL connection string; server refuses to start without it |
| `JWT_SECRET` | yes | Token signing secret (long, random — see `.env.example`) |
| `JWT_EXPIRY` | no | Default `24h` |
| `SSL_DB` | no | `true` for Railway/Neon/Supabase TLS |
| `PORT` | no | Default `5000` |
| `NODE_ENV` | no | `development` / `production` |
| `CORS_ORIGIN` | no | Comma-separated allowed browser origins |
| `ADMIN_USERNAME` | no | Seeded admin login (default `admin`) |
| `ADMIN_EMAIL` | no | Seeded admin email |
| `ADMIN_PHONE` | no | Seeded admin phone |
| `ADMIN_PASSWORD` | no | Seeded admin password (default `admin123` — change!) |
| `EMAIL_HOST` | no | Gmail SMTP: `smtp.gmail.com` |
| `EMAIL_PORT` | no | `587` |
| `EMAIL_SECURE` | no | `false` for STARTTLS on 587 |
| `EMAIL_USER` | no | Gmail address (sending account) |
| `EMAIL_PASS` | no | Gmail App Password |
| `EMAIL_FROM` | no | Defaults to `EMAIL_USER` |

> If `EMAIL_USER`/`EMAIL_PASS` are missing, emails are skipped with a console warning —
> the app still runs.

---

## 12. Testing

```bash
npm test
```

Requires a dedicated `TEST_DATABASE_URL`/`DATABASE_URL` (tests truncate tables).
Test files:

- `tests/bookingRules.test.js` — pure unit tests (no DB): overlap boundaries,
  back-to-back allowed, date validation, asset bookability, transitions.
- `tests/auth.test.js`, `tests/asset.test.js`, `tests/booking.test.js` — integration
  tests (Jest + supertest) against PostgreSQL: auth, RBAC/escalation, asset CRUD,
  booking conflicts, workflow transitions, scoping, availability, concurrency.

---

## 13. Deployment (Railway)

1. Push the repo; create a Railway service for `backend/`.
2. Set all required variables in **Railway → Service → Variables** (`DATABASE_URL`,
   `JWT_SECRET`, `SSL_DB=true`, `NODE_ENV=production`, `CORS_ORIGIN`).
3. Railway runs `npm install` + `npm start` (`src/server.js`). `server.js` runs
   `initDb()` on boot, so no manual migration step is needed on deploy.
4. On first deploy run `npm run seed` (via Railway CLI/plan) or hit the app to create
   the admin.

---

## 14. Frontend integration

The four frontend pages (`index.html`, `register.html`, `user-dashboard.html`,
`admin-dashboard.html`) call this API:

- Auth via `/api/auth/*`, token stored as `lubaga_token` in localStorage.
- Staff dashboard loads `/api/assets` (grouped by category) and own `/api/bookings`,
  creates bookings with `end_time = start_time + 2h`, cancels pending ones.
- Admin dashboard uses `/api/auth/me`, approves/rejects/gives-out/returns bookings,
  manages users (`/api/users`) and assets (`/api/categories`, `/api/assets`).
- Email notifications are handled entirely server-side (`emailService.js`).

On Netlify, requests to `/api/*` are proxied server-to-server to this backend
(see `netlify.toml`), so the browser stays same-origin and no CORS is involved.
The backend also serves the static frontend files directly from the repo root on a
whitelist (see `src/app.js`), enabling a single-origin local setup.