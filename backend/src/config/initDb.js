const { pool, connectDB } = require('./db');

async function initDb() {
  await connectDB();

  const statements = [
    `-- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE
    );`,

    `-- Departments
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      service_element VARCHAR(160) NOT NULL
    );`,

    `-- Users
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(60) NOT NULL UNIQUE,
      email VARCHAR(160) NOT NULL UNIQUE,
      phone VARCHAR(30) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'staff'
        CHECK (role IN ('staff', 'admin', 'general_admin')),
      service_element VARCHAR(160) NOT NULL DEFAULT '',
      department VARCHAR(160) NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

    `-- Assets
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      code VARCHAR(60) NOT NULL UNIQUE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      department VARCHAR(160) NOT NULL DEFAULT '',
      location VARCHAR(160) NOT NULL DEFAULT '',
      serial_number VARCHAR(120) NOT NULL DEFAULT '',
      condition_name VARCHAR(60) NOT NULL DEFAULT 'Good'
        CHECK (condition_name IN ('Good', 'Fair', 'Poor', 'Damaged')),
      status VARCHAR(30) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'under_maintenance', 'damaged', 'retired', 'unavailable')),
      image_url VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

    `-- Asset specifications (each asset can have multiple specifications)
    CREATE TABLE IF NOT EXISTS asset_specifications (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      specification VARCHAR(200) NOT NULL,
      UNIQUE (asset_id, specification)
    );`,

    `-- Bookings
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'active', 'completed')),
      power_code BOOLEAN NOT NULL DEFAULT FALSE,
      power_extension BOOLEAN NOT NULL DEFAULT FALSE,
      vga_hdmi VARCHAR(30) NOT NULL DEFAULT 'N/A',
      hdmi_adapter BOOLEAN NOT NULL DEFAULT FALSE,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      date_approved TIMESTAMPTZ,
      date_given_out TIMESTAMPTZ,
      returned_by VARCHAR(160) NOT NULL DEFAULT '',
      date_returned TIMESTAMPTZ,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_time > start_time)
    );`,

    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS date_given_out TIMESTAMPTZ;`,

    `-- Audit logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(120) NOT NULL,
      entity VARCHAR(60) NOT NULL DEFAULT '',
      entity_id INTEGER,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`,

    `CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);`,
    `CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_asset ON bookings(asset_id);`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);`
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of statements) {
      await client.query(sql);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Optional DB-level overlap guarantee using a GiST exclusion constraint.
  // Requires the btree_gist extension. Some hosted providers disallow
  // CREATE EXTENSION, so this is intentionally non-fatal: application-level
  // advisory locking + transactions already prevent double booking.
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS btree_gist;");
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'
        ) THEN
          ALTER TABLE bookings
          ADD CONSTRAINT bookings_no_overlap
          EXCLUDE USING gist (
            asset_id WITH =,
            tstzrange(start_time, end_time) WITH &&
          )
          WHERE (status IN ('pending','approved','active'));
        END IF;
      END $$;
    `);
    console.log('Bookings overlap exclusion constraint: enabled');
  } catch (error) {
    console.warn(
      'Bookings overlap exclusion constraint could not be enabled (extension unavailable on host?). ' +
      'Application-level concurrency control remains active. Detail: ' + error.message
    );
  }

  console.log('Database schema initialised successfully');
}

if (require.main === module) {
  initDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Database initialisation failed:', err.message);
      process.exit(1);
    });
}

module.exports = { initDb };
