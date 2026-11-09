/**
 * database/migrate_pensiun.js
 * Migrasi penambahan status_keanggotaan pada users & tabel penarikan_pensiun
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'koperasi_bkn',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🚀 Memulai migrasi fitur Penarikan Dana Pensiun...');
    await client.query('BEGIN');

    // 1. Tambah status_keanggotaan pada tabel users
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS status_keanggotaan VARCHAR(20) NOT NULL DEFAULT 'AKTIF';
    `);
    console.log('  ✔ Kolom status_keanggotaan pada users');

    // 2. Buat tabel penarikan_pensiun
    await client.query(`
      CREATE TABLE IF NOT EXISTS penarikan_pensiun (
        id                      SERIAL PRIMARY KEY,
        user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nomor_surat             VARCHAR(100) UNIQUE NOT NULL,
        tanggal_penarikan       DATE NOT NULL DEFAULT CURRENT_DATE,
        total_simpanan_pokok    NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_simpanan_wajib    NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_simpanan_sukarela NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_simpanan_kotor    NUMERIC(15,2) NOT NULL DEFAULT 0,
        sisa_pinjaman_pokok     NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_dana_diterima     NUMERIC(15,2) NOT NULL DEFAULT 0,
        alasan                  VARCHAR(100) NOT NULL DEFAULT 'Pensiun (Batas Usia Pensiun)',
        keterangan              TEXT,
        admin_id                INTEGER REFERENCES users(id),
        created_at              TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pensiun_user ON penarikan_pensiun(user_id);
      CREATE INDEX IF NOT EXISTS idx_pensiun_tgl ON penarikan_pensiun(tanggal_penarikan);
    `);
    console.log('  ✔ Tabel penarikan_pensiun');

    await client.query('COMMIT');
    console.log('🎉 Migrasi Penarikan Dana Pensiun Selesai 100%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal migrasi penarikan pensiun:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
