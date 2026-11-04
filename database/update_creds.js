require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'koperasi_bkn',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function main() {
  try {
    const adminHash = await bcrypt.hash('admin123', 12);
    const userHash  = await bcrypt.hash('user123', 12);

    // Update Admin
    await pool.query(
      "UPDATE users SET nip = 'admin', password_hash = $1 WHERE role = 'admin' OR id = 1",
      [adminHash]
    );
    console.log('✔ Akun Admin berhasil diupdate: nip = admin, pass = admin123');

    // Update User (Budi Santoso)
    await pool.query(
      "UPDATE users SET nip = 'user', password_hash = $1 WHERE id = 2 OR (role = 'user' AND nama ILIKE '%Budi%')",
      [userHash]
    );
    console.log('✔ Akun User berhasil diupdate: nip = user, pass = user123');

    const { rows } = await pool.query('SELECT id, nama, nip, role FROM users ORDER BY id');
    console.table(rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
