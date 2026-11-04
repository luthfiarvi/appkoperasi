const pool = require('../config/database');

const CicilanModel = {
  // ─── Bulk insert cicilan (within a client) ──────────────────────────
  bulkInsert: async (client, cicilanArray) => {
    for (const c of cicilanArray) {
      await client.query(
        `INSERT INTO cicilan_pinjaman
           (pinjaman_id, bulan_ke, periode_tagihan, pokok_angsuran,
            bunga_angsuran, total_angsuran, sisa_pokok)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c.pinjaman_id, c.bulan_ke, c.periode_tagihan,
         c.pokok_angsuran, c.bunga_angsuran, c.total_angsuran, c.sisa_pokok]
      );
    }
  },

  // ─── Find cicilan by pinjaman_id ───────────────────────────────────
  findByPinjamanId: async (pinjaman_id) => {
    const { rows } = await pool.query(
      `SELECT * FROM cicilan_pinjaman WHERE pinjaman_id=$1 ORDER BY bulan_ke ASC`,
      [pinjaman_id]
    );
    return rows;
  },

  // ─── Find cicilan by periode (for payroll) ─────────────────────────
  findByPeriode: async (periode) => {
    const { rows } = await pool.query(
      `SELECT c.*, p.nominal_pengajuan, p.suku_bunga_persen,
              u.nama, u.nip, u.jabatan
       FROM cicilan_pinjaman c
       JOIN pengajuan_pinjaman p ON p.id = c.pinjaman_id
       JOIN users u ON u.id = p.user_id
       WHERE c.periode_tagihan = $1
       ORDER BY u.nama ASC`,
      [periode]
    );
    return rows;
  },

  // ─── Find pending cicilan by periode ──────────────────────────────
  findPendingByPeriode: async (periode) => {
    const { rows } = await pool.query(
      `SELECT c.*, p.nominal_pengajuan, p.suku_bunga_persen,
              u.nama, u.nip, u.jabatan
       FROM cicilan_pinjaman c
       JOIN pengajuan_pinjaman p ON p.id = c.pinjaman_id
       JOIN users u ON u.id = p.user_id
       WHERE c.periode_tagihan = $1 AND c.status_potong = 'BELUM_DIPOTONG'
       ORDER BY u.nama ASC`,
      [periode]
    );
    return rows;
  },

  // ─── Mark as SUDAH_DIPOTONG (within transaction) ──────────────────
  markPaid: async (client, id, admin_id) => {
    const { rows } = await client.query(
      `UPDATE cicilan_pinjaman
       SET status_potong='SUDAH_DIPOTONG', tanggal_potong=NOW(), admin_id=$2
       WHERE id=$1 RETURNING *`,
      [id, admin_id]
    );
    return rows[0];
  },

  // ─── Get remaining saldo for pinjaman ─────────────────────────────
  getSisaPokok: async (client, pinjaman_id) => {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(pokok_angsuran), 0) AS sisa
       FROM cicilan_pinjaman
       WHERE pinjaman_id=$1 AND status_potong='BELUM_DIPOTONG'`,
      [pinjaman_id]
    );
    return parseFloat(rows[0].sisa);
  },

  // ─── Histori cicilan (paid) by user ───────────────────────────────
  findPaidByUserId: async (user_id) => {
    const { rows } = await pool.query(
      `SELECT c.*, p.nominal_pengajuan
       FROM cicilan_pinjaman c
       JOIN pengajuan_pinjaman p ON p.id = c.pinjaman_id
       WHERE p.user_id=$1 AND c.status_potong='SUDAH_DIPOTONG'
       ORDER BY c.tanggal_potong DESC
       LIMIT 20`,
      [user_id]
    );
    return rows;
  },

  // ─── Total penerimaan angsuran bulan ini ─────────────────────────
  totalPenerimaanBulanIni: async () => {
    const periode = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(total_angsuran), 0) AS total
       FROM cicilan_pinjaman
       WHERE periode_tagihan=$1 AND status_potong='SUDAH_DIPOTONG'`,
      [periode]
    );
    return rows[0].total;
  },
};

module.exports = CicilanModel;
