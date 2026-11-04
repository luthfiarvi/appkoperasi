const pool = require('../config/database');

/**
 * Log aktivitas pengguna ke database
 * @param {Object} params
 * @param {number|null} params.userId
 * @param {string} params.userNama
 * @param {string} params.userRole
 * @param {string} params.action - e.g. 'LOGIN', 'MEMBER_ADD', 'SIMPANAN_TRANSAKSI', 'PINJAMAN_APPROVE', 'PELUNASAN_CEPAT', 'BACKUP_DB'
 * @param {string} params.targetType - e.g. 'USERS', 'SIMPANAN', 'PENGAJUAN', 'SYSTEM'
 * @param {number|null} params.targetId
 * @param {string} params.details - Keterangan aktivitas
 * @param {string|null} params.ipAddress
 */
async function logAudit({ userId, userNama, userRole, action, targetType, targetId, details, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_nama, user_role, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId || null,
        userNama || 'Sistem',
        userRole || 'admin',
        action,
        targetType || null,
        targetId || null,
        details || '',
        ipAddress || '127.0.0.1'
      ]
    );
  } catch (err) {
    console.error('⚠ Gagal mencatat audit log:', err.message);
  }
}

/**
 * Helper shortcut untuk request Express
 */
function logAuditReq(req, action, targetType, targetId, details) {
  const sessionUser = req.session ? (req.session.user || {}) : {};
  const userId = req.session ? (req.session.userId || sessionUser.id) : null;
  const userNama = sessionUser.nama || (req.session ? req.session.nama : 'Admin');
  const userRole = sessionUser.role || (req.session ? req.session.role : 'admin');
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  return logAudit({
    userId,
    userNama,
    userRole,
    action,
    targetType,
    targetId,
    details,
    ipAddress: ip
  });
}

module.exports = {
  logAudit,
  logAuditReq
};
