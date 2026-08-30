const dotenv = require('dotenv');

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  sslDb: process.env.SSL_DB === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  corsOrigin: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@lubaga.org',
    phone: process.env.ADMIN_PHONE || '0772123456',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

module.exports = env;
