const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.sslDb
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

async function connectDB() {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected successfully');
    client.release();
    return pool;
  } catch (error) {
    console.error('PostgreSQL connection error:', error.message);
    throw error;
  }
}

module.exports = { pool, connectDB };
