/**
 * database/migrate_features.js
 * Migrasi penambahan kolom data anggota dan tabel transaksi simpanan
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
    console.log('🔄 Memulai migrasi...');
    await client.query('BEGIN');

    // 1. Kolom tambahan untuk Data Anggota di tabel users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS nik VARCHAR(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_kerja VARCHAR(150);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS alamat TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS no_hp VARCHAR(30);
    `);
    console.log('  ✔ Kolom NIK, Unit Kerja, Alamat, No HP pada tabel users');

    // 2. Tabel transaksi simpanan
    await client.query(`
      CREATE TABLE IF NOT EXISTS transaksi_simpanan (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jenis_simpanan  VARCHAR(20) NOT NULL CHECK (jenis_simpanan IN ('pokok', 'wajib', 'sukarela')),
        tipe_transaksi  VARCHAR(10) NOT NULL DEFAULT 'setor' CHECK (tipe_transaksi IN ('setor', 'tarik')),
        nominal         NUMERIC(15,2) NOT NULL CHECK (nominal > 0),
        tanggal         DATE NOT NULL DEFAULT CURRENT_DATE,
        keterangan      TEXT,
        admin_id        INTEGER REFERENCES users(id),
        created_at      TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_simpanan_user ON transaksi_simpanan(user_id);
      CREATE INDEX IF NOT EXISTS idx_simpanan_jenis ON transaksi_simpanan(jenis_simpanan);
      CREATE INDEX IF NOT EXISTS idx_simpanan_tanggal ON transaksi_simpanan(tanggal);
    `);
    console.log('  ✔ Tabel transaksi_simpanan');

    // 3. Update sample users dengan data anggota riil
    await client.query(`
      UPDATE users SET 
        nik = '3175011505900001',
        unit_kerja = 'Subbagian Kepegawaian & TU',
        alamat = 'Jl. Mayjen Sutoyo No. 12, Cililitan, Jakarta Timur',
        no_hp = '081234567890'
      WHERE nip = '199005152020011001';

      UPDATE users SET 
        nik = '3175022008920002',
        unit_kerja = 'Bidang Pengangkatan & Pensiun',
        alamat = 'Jl. Dewi Sartika No. 45, Cawang, Jakarta Timur',
        no_hp = '081298765432'
      WHERE nip = '199208202021022002';
    `);
    console.log('  ✔ Update profil sample anggota');

    // 4. Seed data simpanan contoh jika tabel masih kosong
    const { rows: simpananCount } = await client.query('SELECT COUNT(*) FROM transaksi_simpanan');
    if (parseInt(simpananCount[0].count) === 0) {
      const { rows: budi } = await client.query("SELECT id FROM users WHERE nip = '199005152020011001'");
      const { rows: siti } = await client.query("SELECT id FROM users WHERE nip = '199208202021022002'");
      const { rows: admin } = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      const adminId = admin[0]?.id || null;

      if (budi.length > 0) {
        const uId = budi[0].id;
        await client.query(`
          INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id) VALUES
          ($1, 'pokok', 'setor', 100000, '2026-01-05', 'Setoran Awal Simpanan Pokok Anggota', $2),
          ($1, 'wajib', 'setor', 50000, '2026-08-25', 'Simpanan Wajib Periode Agustus 2026', $2),
          ($1, 'wajib', 'setor', 50000, '2026-09-25', 'Simpanan Wajib Periode September 2026', $2),
          ($1, 'wajib', 'setor', 50000, '2026-10-25', 'Simpanan Wajib Periode Oktober 2026', $2),
          ($1, 'sukarela', 'setor', 500000, '2026-09-10', 'Setoran Sukarela Tambahan', $2);
        `, [uId, adminId]);
      }

      if (siti.length > 0) {
        const uId = siti[0].id;
        await client.query(`
          INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id) VALUES
          ($1, 'pokok', 'setor', 100000, '2026-02-10', 'Setoran Awal Simpanan Pokok Anggota', $2),
          ($1, 'wajib', 'setor', 50000, '2026-08-25', 'Simpanan Wajib Periode Agustus 2026', $2),
          ($1, 'wajib', 'setor', 50000, '2026-09-25', 'Simpanan Wajib Periode September 2026', $2),
          ($1, 'wajib', 'setor', 50000, '2026-10-25', 'Simpanan Wajib Periode Oktober 2026', $2),
          ($1, 'sukarela', 'setor', 250000, '2026-10-01', 'Setoran Sukarela Tabungan', $2);
        `, [uId, adminId]);
      }
      console.log('  ✔ Data awal simpanan berhasil di-seed');
    }

    await client.query('COMMIT');
    console.log('✅ Migrasi database berhasil 100%!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Gagal:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
