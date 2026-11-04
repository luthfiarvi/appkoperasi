/**
 * setup.js — Inisialisasi database otomatis
 * Jalankan: node setup.js
 *
 * Script ini akan:
 * 1. Membuat tabel-tabel yang diperlukan
 * 2. Menambahkan user admin dan user pegawai contoh
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

async function setup() {
  console.log('');
  console.log('🔧 Setup Database Koperasi BKN...');

  // Koneksi awal ke postgres (database default) untuk cek/buat database
  const adminPool = new Pool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Cek apakah database sudah ada
    const dbName = process.env.DB_NAME || 'koperasi_bkn';
    const check  = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]
    );

    if (check.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database '${dbName}' berhasil dibuat.`);
    } else {
      console.log(`ℹ️  Database '${dbName}' sudah ada.`);
    }
  } catch (err) {
    // Jika tidak bisa connect ke postgres, mungkin sudah dibuat
    console.log('⚠️  Tidak bisa cek database, melanjutkan...');
  } finally {
    await adminPool.end();
  }

  // Koneksi ke database target
  const pool = new Pool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'koperasi_bkn',
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── DDL: Buat tabel ────────────────────────────────────────
    console.log('\n📋 Membuat tabel-tabel...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        nip           VARCHAR(30) UNIQUE NOT NULL,
        nama          VARCHAR(150) NOT NULL,
        jabatan       VARCHAR(100),
        email         VARCHAR(150) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          VARCHAR(10) NOT NULL DEFAULT 'user'
                        CHECK (role IN ('admin','user')),
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✔ Tabel users');

    await client.query(`
      CREATE TABLE IF NOT EXISTS pengajuan_pinjaman (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nominal_pengajuan   NUMERIC(15,2) NOT NULL,
        tenor_bulan         INTEGER NOT NULL CHECK (tenor_bulan BETWEEN 1 AND 60),
        suku_bunga_persen   NUMERIC(5,2) NOT NULL DEFAULT 2.0,
        keperluan           TEXT,
        biaya_admin         NUMERIC(15,2) DEFAULT 0,
        nominal_cair        NUMERIC(15,2),
        status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING','APPROVED','REJECTED','LUNAS')),
        catatan_admin       TEXT,
        tanggal_persetujuan DATE,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✔ Tabel pengajuan_pinjaman');

    await client.query(`
      CREATE TABLE IF NOT EXISTS cicilan_pinjaman (
        id               SERIAL PRIMARY KEY,
        pinjaman_id      INTEGER NOT NULL REFERENCES pengajuan_pinjaman(id) ON DELETE CASCADE,
        bulan_ke         INTEGER NOT NULL,
        periode_tagihan  VARCHAR(7) NOT NULL,
        pokok_angsuran   NUMERIC(15,2) NOT NULL,
        bunga_angsuran   NUMERIC(15,2) NOT NULL,
        total_angsuran   NUMERIC(15,2) NOT NULL,
        sisa_pokok       NUMERIC(15,2) NOT NULL,
        status_potong    VARCHAR(20) NOT NULL DEFAULT 'BELUM_DIPOTONG'
                           CHECK (status_potong IN ('BELUM_DIPOTONG','SUDAH_DIPOTONG')),
        tanggal_potong   DATE,
        admin_id         INTEGER REFERENCES users(id),
        created_at       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  ✔ Tabel cicilan_pinjaman');

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cicilan_pinjaman_id ON cicilan_pinjaman(pinjaman_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cicilan_periode ON cicilan_pinjaman(periode_tagihan)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cicilan_status ON cicilan_pinjaman(status_potong)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pengajuan_user ON pengajuan_pinjaman(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pengajuan_status ON pengajuan_pinjaman(status)`);
    console.log('  ✔ Indexes dibuat');

    // ─── Seeder: User awal ──────────────────────────────────────
    console.log('\n🌱 Membuat user awal...');

    const adminHash  = await bcrypt.hash('admin123', 12);
    const userHash1  = await bcrypt.hash('user123', 12);
    const userHash2  = await bcrypt.hash('user123', 12);

    await client.query(`
      INSERT INTO users (nip, nama, jabatan, email, password_hash, role)
      VALUES
        ('admin', 'Admin Koperasi BKN', 'Ketua Koperasi', 'admin@koperasibkn.id', $1, 'admin'),
        ('user', 'Budi Santoso', 'Analis Kepegawaian Ahli Muda', 'budi.santoso@bkn.go.id', $2, 'user'),
        ('198803202019031002', 'Siti Rahayu', 'Pranata SDM Aparatur', 'siti.rahayu@bkn.go.id', $3, 'user')
      ON CONFLICT (nip) DO NOTHING
    `, [adminHash, userHash1, userHash2]);

    console.log('  ✔ User admin dan pegawai berhasil dibuat');

    await client.query('COMMIT');

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║        ✅ Setup Database Berhasil!                    ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log('║  Admin   → NIP: 197001010001       / admin123        ║');
    console.log('║  Pegawai → NIP: 199005152020011001 / pegawai123      ║');
    console.log('║  Pegawai → NIP: 198803202019031002 / pegawai123      ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log('║  Jalankan: npm start                                  ║');
    console.log('║  Buka    : http://localhost:3000                      ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Setup gagal:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
