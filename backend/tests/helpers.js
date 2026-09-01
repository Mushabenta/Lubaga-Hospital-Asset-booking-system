const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// TEST DATABASE ISOLATION
//
// Tests MUST NOT run against the production database. Set TEST_DATABASE_URL to
// a dedicated test database (any PostgreSQL instance works — free Neon/Supabase
// tiers are fine). If TEST_DATABASE_URL is missing, every test run would
// TRUNCATE the production data (departments, assets, users…).
//
// We override DATABASE_URL *before* any app module is imported so the app's
// internal pool connects to the test database for the entire test run.
// ---------------------------------------------------------------------------
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  console.error(
    '\n  ⚠  TEST_DATABASE_URL is not set.\n' +
    '     Tests will NOT run to protect production data.\n' +
    '     Add TEST_DATABASE_URL to backend/.env (see .env.example).\n'
  );
  process.exit(1);
}

// Point the app's pool at the test database.
process.env.DATABASE_URL = testDbUrl;

// Now safe to import app modules — they read DATABASE_URL from process.env
// at require-time and will connect to the test database.
const env = require('../src/config/env');
const { pool, connectDB } = require('../src/config/db');
const { initDb } = require('../src/config/initDb');
const app = require('../src/app');

// Ensure a clean database for every test run.
async function setupDatabase() {
  await connectDB();
  await initDb();
}

async function cleanAll() {
  const tables = ['audit_logs', 'bookings', 'asset_specifications', 'assets', 'categories', 'departments', 'users'];
  for (const t of tables) {
    await pool.query(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
  }
}

async function teardown() {
  await pool.end();
}

async function createUserClient(overrides = {}) {
  const data = {
    username: 'testuser',
    email: '',
    phone: '',
    password: 'secret123',
    role: 'staff',
    service_element: 'ICT Office',
    department: 'ICT',
    ...overrides
  };
  if (!data.email) data.email = `${data.username}@example.com`;
  if (!data.phone) {
    let n = 0;
    for (let i = 0; i < data.username.length; i++) n = (n * 31 + data.username.charCodeAt(i)) >>> 0;
    const digits = String(n).slice(-8).padStart(8, '0');
    data.phone = `07${digits}`;
  }
  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, phone, password_hash, role, service_element, department)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.username, data.email, data.phone, hash, data.role, data.service_element, data.department]
  );
  const user = rows[0];
  return {
    user,
    token: jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1h' }),
    plain: { password: data.password }
  };
}

async function createAsset(overrides = {}) {
  const data = {
    name: 'Laptop Dell XPS',
    code: 'LAP-100',
    category_name: 'Laptop',
    specifications: ['Dell XPS 13'],
    ...overrides
  };
  const { rows: catRows } = await pool.query(
    'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [data.category_name]
  );
  const categoryId = catRows[0].id;
  const { rows } = await pool.query(
    `INSERT INTO assets (name, code, category_id, status)
     VALUES ($1,$2,$3,'available') RETURNING *`,
    [data.name, data.code, categoryId]
  );
  const asset = rows[0];
  for (const spec of data.specifications) {
    await pool.query(
      'INSERT INTO asset_specifications (asset_id, specification) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [asset.id, spec]
    );
  }
  return asset;
}

// Build an authenticated supertest request wrapper.
function agent(token) {
  const api = request(app);
  return {
    get: (url) => api.get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => api.post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => api.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => api.patch(url).set('Authorization', `Bearer ${token}`),
    del: (url) => api.del(url).set('Authorization', `Bearer ${token}`)
  };
}

module.exports = {
  app,
  pool,
  connectDB,
  setupDatabase,
  cleanAll,
  teardown,
  createUserClient,
  createAsset,
  agent
};
