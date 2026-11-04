require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Memulai seeder user awal...');

    const adminHash = await bcrypt.hash('admin123', 12);
    const userHash  = await bcrypt.hash('pegawai123', 12);

    await client.query(`
      INSERT INTO users (nip, nama, jabatan, email, password_hash, role)
      VALUES
        ('197001010001', 'Admin Koperasi BKN', 'Ketua Koperasi', 'admin@koperasibkn.id', $1, 'admin'),
        ('199005152020011001', 'Budi Santoso', 'Analis Kepegawaian Ahli Muda', 'budi.santoso@bkn.go.id', $2, 'user')
      ON CONFLICT (nip) DO NOTHING;
    `, [adminHash, userHash]);

    console.log('✅ Seeder berhasil!');
    console.log('   Admin  → NIP: 197001010001       | Password: admin123');
    console.log('   User   → NIP: 199005152020011001 | Password: pegawai123');
  } catch (err) {
    console.error('❌ Seeder error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
