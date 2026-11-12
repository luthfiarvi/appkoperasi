require('dotenv').config();
const { Pool } = require('pg');

const isWindows = process.platform === 'win32';

const pool = new Pool({
  host: process.env.DB_HOST || (isWindows ? 'localhost' : '/var/run/postgresql'),
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'koperasi_bkn',
  user: process.env.DB_USER || (isWindows ? 'postgres' : (process.env.PGUSER || 'magangit')),
  password: process.env.DB_PASSWORD || (isWindows ? 'postgres' : (process.env.PGPASSWORD || 'K@nreg5')),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('✅ Database PostgreSQL terhubung.');
});

pool.on('error', (err) => {
  console.error('❌ Kesalahan koneksi database:', err.message);
});

module.exports = pool;
