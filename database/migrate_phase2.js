/**
 * database/migrate_phase2.js
 * Migrasi database untuk 5 fitur baru:
 * 1. Gaji bersih pada tabel users (untuk Debt Service Ratio)
 * 2. Tabel audit_logs untuk jejak aktivitas admin
 * 3. Nilai default gaji bersih untuk anggota demo
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
    console.log('🔄 Memulai migrasi Phase 2...');
    await client.query('BEGIN');

    // 1. Tambah kolom gaji_bersih pada tabel users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gaji_bersih NUMERIC(15,2) DEFAULT 6500000;
    `);
    console.log('  ✔ Kolom gaji_bersih pada users');

    // 2. Buat tabel audit_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_nama   VARCHAR(150),
        user_role   VARCHAR(20),
        action      VARCHAR(50) NOT NULL,
        target_type VARCHAR(50),
        target_id   INTEGER,
        details     TEXT,
        ip_address  VARCHAR(50),
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    `);
    console.log('  ✔ Tabel audit_logs');

    // 3. Tambahkan catatan audit awal
    const { rows: auditCount } = await client.query('SELECT COUNT(*) FROM audit_logs');
    if (parseInt(auditCount[0].count) === 0) {
      await client.query(`
        INSERT INTO audit_logs (user_nama, user_role, action, target_type, details)
        VALUES 
          ('Sistem', 'system', 'SYSTEM_INIT', 'DATABASE', 'Inisialisasi sistem Koperasi Pegawai BKN Kanreg V Jakarta'),
          ('Admin Koperasi', 'admin', 'MEMBER_SEED', 'USERS', 'Inisialisasi anggota demo Budi Santoso dan Siti Rahayu');
      `);
      console.log('  ✔ Initial audit logs tercatat');
    }

    // 4. Update gaji demo pegawai
    await client.query(`
      UPDATE users SET gaji_bersih = 7500000 WHERE nip = 'user' OR nama ILIKE '%Budi%';
      UPDATE users SET gaji_bersih = 6200000 WHERE nip = '198803202019031002' OR nama ILIKE '%Siti%';
    `);
    console.log('  ✔ Gaji bersih demo pegawai diset');

    await client.query('COMMIT');
    console.log('✅ Migrasi Phase 2 Selesai 100%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal migrasi Phase 2:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
