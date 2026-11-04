const pool = require('../config/database');

const PinjamanModel = {
  // ─── Create pengajuan ──────────────────────────────────────────────
  create: async ({ user_id, nominal_pengajuan, tenor_bulan, keperluan, is_topup = false, topup_pinjaman_id = null, pelunasan_pinjaman_lama = 0 }) => {
    const { rows } = await pool.query(
      `INSERT INTO pengajuan_pinjaman (user_id, nominal_pengajuan, tenor_bulan, keperluan, is_topup, topup_pinjaman_id, pelunasan_pinjaman_lama)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user_id, nominal_pengajuan, tenor_bulan, keperluan, is_topup, topup_pinjaman_id, pelunasan_pinjaman_lama]
    );
    return rows[0];
  },

  // ─── Find by ID ────────────────────────────────────────────────────
  findById: async (id) => {
    const { rows } = await pool.query(
      `SELECT p.*, u.nama, u.nip, u.jabatan, u.email, u.gaji_bersih, u.unit_kerja, u.no_hp
       FROM pengajuan_pinjaman p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // ─── Find by user_id ───────────────────────────────────────────────
  findByUserId: async (user_id) => {
    const { rows } = await pool.query(
      `SELECT * FROM pengajuan_pinjaman WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );
    return rows;
  },

  // ─── Active loan by user (APPROVED/not yet LUNAS) ──────────────────
  findActiveLoanByUserId: async (user_id) => {
    const { rows } = await pool.query(
      `SELECT p.*, 
         COALESCE(SUM(c.pokok_angsuran) FILTER (WHERE c.status_potong = 'BELUM_DIPOTONG'), 0) AS sisa_hutang_aktif
       FROM pengajuan_pinjaman p
       LEFT JOIN cicilan_pinjaman c ON c.pinjaman_id = p.id
       WHERE p.user_id = $1 AND p.status = 'APPROVED'
       GROUP BY p.id
       ORDER BY p.tanggal_persetujuan DESC
       LIMIT 1`,
      [user_id]
    );
    return rows[0] || null;
  },

  // ─── All pengajuan (admin) ─────────────────────────────────────────
  findAll: async (status = null) => {
    let query = `
      SELECT p.*, u.nama, u.nip, u.jabatan
      FROM pengajuan_pinjaman p
      JOIN users u ON u.id = p.user_id
    `;
    const params = [];
    if (status) {
      query += ` WHERE p.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY p.created_at DESC`;
    const { rows } = await pool.query(query, params);
    return rows;
  },

  // ─── Count by status ───────────────────────────────────────────────
  countByStatus: async () => {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*) as total FROM pengajuan_pinjaman GROUP BY status`
    );
    return rows;
  },

  // ─── Total dana tersalurkan ────────────────────────────────────────
  totalDanaTersalurkan: async () => {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(nominal_cair), 0) as total
       FROM pengajuan_pinjaman WHERE status IN ('APPROVED','LUNAS')`
    );
    return rows[0].total;
  },

  // ─── Approve (within a client for transaction) ─────────────────────
  approve: async (client, { id, biaya_admin, nominal_cair, catatan_admin }) => {
    const { rows } = await client.query(
      `UPDATE pengajuan_pinjaman
       SET status='APPROVED', biaya_admin=$2, nominal_cair=$3,
           catatan_admin=$4, tanggal_persetujuan=NOW()
       WHERE id=$1 RETURNING *`,
      [id, biaya_admin, nominal_cair, catatan_admin]
    );
    return rows[0];
  },

  // ─── Reject ────────────────────────────────────────────────────────
  reject: async (id, catatan_admin) => {
    const { rows } = await pool.query(
      `UPDATE pengajuan_pinjaman SET status='REJECTED', catatan_admin=$2 WHERE id=$1 RETURNING *`,
      [id, catatan_admin]
    );
    return rows[0];
  },

  // ─── Mark LUNAS ────────────────────────────────────────────────────
  markLunas: async (client, id) => {
    await client.query(
      `UPDATE pengajuan_pinjaman SET status='LUNAS' WHERE id=$1`,
      [id]
    );
  },
};

module.exports = PinjamanModel;
