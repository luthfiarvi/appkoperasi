const pool = require('../config/database');

const UserModel = {
  findByNip: async (nip) => {
    const val = (nip || '').trim();
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(nip) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [val]
    );
    return rows[0] || null;
  },

  findById: async (id) => {
    const { rows } = await pool.query('SELECT id, nip, nama, jabatan, email, role, created_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  create: async ({ nip, nama, jabatan, email, password_hash, role }) => {
    const { rows } = await pool.query(
      `INSERT INTO users (nip, nama, jabatan, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nip, nama, email, role`,
      [nip, nama, jabatan, email, password_hash, role || 'user']
    );
    return rows[0];
  },

  findAll: async () => {
    const { rows } = await pool.query(
      'SELECT id, nip, nama, jabatan, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },
};

module.exports = UserModel;
