/**
 * controllers/auditController.js
 * Jejak Audit Aktivitas Admin & Backup Database 1-Klik
 */
const pool = require('../config/database');
const { logAuditReq } = require('../utils/auditLogger');

module.exports = {
  // ─── 1. Daftar Jejak Audit Aktivitas ───────────────────────────
  listAuditLogs: async (req, res) => {
    try {
      const q = req.query.q ? req.query.q.trim() : '';
      const actionFilter = req.query.action ? req.query.action.trim() : '';

      let sql = `
        SELECT id, user_nama, user_role, action, target_type, target_id, details, ip_address, created_at
        FROM audit_logs
        WHERE 1=1
      `;
      const params = [];

      if (q) {
        params.push(`%${q}%`);
        sql += ` AND (user_nama ILIKE $${params.length} OR details ILIKE $${params.length} OR ip_address ILIKE $${params.length})`;
      }

      if (actionFilter) {
        params.push(actionFilter);
        sql += ` AND action = $${params.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT 100`;

      const { rows: logs } = await pool.query(sql, params);

      // Ambil distinct actions untuk filter dropdown
      const { rows: actionRows } = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC');
      const actionList = actionRows.map(r => r.action);

      // Hitung ringkasan database untuk kartu backup
      const { rows: countUsers } = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'user'");
      const { rows: countSimpanan } = await pool.query("SELECT COUNT(*) FROM transaksi_simpanan");
      const { rows: countPinjaman } = await pool.query("SELECT COUNT(*) FROM pengajuan_pinjaman");
      const { rows: countCicilan } = await pool.query("SELECT COUNT(*) FROM cicilan_pinjaman");

      const dbSummary = {
        totalAnggota: countUsers[0]?.count || 0,
        totalSimpanan: countSimpanan[0]?.count || 0,
        totalPinjaman: countPinjaman[0]?.count || 0,
        totalCicilan: countCicilan[0]?.count || 0,
        totalAudit: logs.length
      };

      res.render('admin/audit-logs', {
        title: 'Audit Log & Backup Database — Koperasi BKN',
        logs,
        actionList,
        q,
        actionFilter,
        dbSummary,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/audit-logs',
        success: req.query.success || null,
      });
    } catch (err) {
      console.error('Error listAuditLogs:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: true, currentPath: '/admin/audit-logs' });
    }
  },

  // ─── 2. Backup Database 1-Klik (Export JSON Terarsip) ───────────
  downloadBackup: async (req, res) => {
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');

      // Ambil seluruh data dari setiap tabel sistem koperasi
      const { rows: users } = await pool.query('SELECT id, nik, nip, nama, unit_kerja, jabatan, alamat, no_hp, email, role, gaji_bersih, created_at FROM users ORDER BY id ASC');
      const { rows: transaksi_simpanan } = await pool.query('SELECT * FROM transaksi_simpanan ORDER BY id ASC');
      const { rows: pengajuan_pinjaman } = await pool.query('SELECT * FROM pengajuan_pinjaman ORDER BY id ASC');
      const { rows: cicilan_pinjaman } = await pool.query('SELECT * FROM cicilan_pinjaman ORDER BY id ASC');
      const { rows: audit_logs } = await pool.query('SELECT * FROM audit_logs ORDER BY id ASC');

      const backupData = {
        metadata: {
          app_name: 'Koperasi Pegawai BKN Kanreg V Jakarta',
          version: '2.5.0-Enterprise',
          backup_timestamp: now.toISOString(),
          generated_by: req.session.user?.nama || 'Admin',
          database_engine: 'PostgreSQL',
          summary: {
            users_count: users.length,
            transaksi_simpanan_count: transaksi_simpanan.length,
            pengajuan_pinjaman_count: pengajuan_pinjaman.length,
            cicilan_pinjaman_count: cicilan_pinjaman.length,
            audit_logs_count: audit_logs.length
          }
        },
        data: {
          users,
          transaksi_simpanan,
          pengajuan_pinjaman,
          cicilan_pinjaman,
          audit_logs
        }
      };

      await logAuditReq(req, 'BACKUP_DB', 'SYSTEM', null, `Mengunduh backup database lengkap (Users: ${users.length}, Pinjaman: ${pengajuan_pinjaman.length}, Simpanan: ${transaksi_simpanan.length})`);

      const filename = `koperasi_bkn_backup_${timestamp}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(backupData, null, 2));

    } catch (err) {
      console.error('Error downloadBackup:', err);
      res.redirect('/admin/audit-logs?error=' + encodeURIComponent(err.message));
    }
  }
};
