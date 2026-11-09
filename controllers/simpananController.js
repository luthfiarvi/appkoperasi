/**
 * controllers/simpananController.js
 * Modul Simpanan Koperasi Pegawai BKN Kanreg V Jakarta
 * Menangani:
 * a> Simpanan Pokok
 * b> Simpanan Wajib
 * c> Simpanan Sukarela
 * d> Total Keseluruhan
 * Beserta transaksi setoran, penarikan, rekap mutasi, dan cetak kwitansi
 */
const pool = require('../config/database');
const { logAuditReq } = require('../utils/auditLogger');
const { terbilangRupiah } = require('../utils/terbilang');

module.exports = {
  // ─── 1. Rekap Data Simpanan Anggota ────────────────────────────
  listSimpanan: async (req, res) => {
    try {
      const q = req.query.q ? req.query.q.trim() : '';
      let filterSql = '';
      const params = [];

      if (q) {
        filterSql = ` AND (u.nama ILIKE $1 OR u.nip ILIKE $1 OR u.nik ILIKE $1 OR u.unit_kerja ILIKE $1)`;
        params.push(`%${q}%`);
      }

      // Query agregasi saldo simpanan per anggota
      const sql = `
        SELECT 
          u.id as user_id,
          u.nama,
          u.nip,
          u.nik,
          u.jabatan,
          u.unit_kerja,
          u.status_keanggotaan,
          u.skema_simpanan_pokok,
          u.tenor_simpanan_pokok,
          u.nominal_cicilan_pokok,
          COALESCE(SUM(CASE WHEN ts.jenis_simpanan = 'pokok' AND ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.jenis_simpanan = 'pokok' AND ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) AS simpanan_pokok,
          COALESCE(SUM(CASE WHEN ts.jenis_simpanan = 'wajib' AND ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.jenis_simpanan = 'wajib' AND ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) AS simpanan_wajib,
          COALESCE(SUM(CASE WHEN ts.jenis_simpanan = 'sukarela' AND ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.jenis_simpanan = 'sukarela' AND ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) AS simpanan_sukarela,
          COALESCE(SUM(CASE WHEN ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) AS total_simpanan
        FROM users u
        LEFT JOIN transaksi_simpanan ts ON u.id = ts.user_id
        WHERE u.role = 'user' ${filterSql}
        GROUP BY u.id, u.nama, u.nip, u.nik, u.unit_kerja, u.skema_simpanan_pokok, u.tenor_simpanan_pokok, u.nominal_cicilan_pokok
        ORDER BY u.nama ASC
      `;

      const { rows: simpananList } = await pool.query(sql, params);

      // Hitung Grand Total Koperasi
      const grandTotal = simpananList.reduce((acc, row) => {
        acc.pokok += parseFloat(row.simpanan_pokok);
        acc.wajib += parseFloat(row.simpanan_wajib);
        acc.sukarela += parseFloat(row.simpanan_sukarela);
        acc.total += parseFloat(row.total_simpanan);
        return acc;
      }, { pokok: 0, wajib: 0, sukarela: 0, total: 0 });

      // Ambil daftar anggota aktif untuk pilihan modal input transaksi cepat beserta status simpanan pokok
      const { rows: allUsers } = await pool.query(`
        SELECT 
          u.id, u.nip, u.nama, u.unit_kerja, u.skema_simpanan_pokok, u.tenor_simpanan_pokok, u.nominal_cicilan_pokok,
          COALESCE(SUM(CASE WHEN ts.jenis_simpanan = 'pokok' AND ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.jenis_simpanan = 'pokok' AND ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) AS simpanan_pokok
        FROM users u
        LEFT JOIN transaksi_simpanan ts ON u.id = ts.user_id
        WHERE u.role = 'user'
        GROUP BY u.id, u.nip, u.nama, u.unit_kerja, u.skema_simpanan_pokok, u.tenor_simpanan_pokok, u.nominal_cicilan_pokok
        ORDER BY u.nama ASC
      `);

      res.render('admin/list-simpanan', {
        title: 'Data Simpanan Anggota — Koperasi BKN',
        simpananList,
        grandTotal,
        allUsers,
        targetPokok: 1005000,
        simpananWajibPerBulan: 100000,
        q,
        success: req.query.success || null,
        error: req.query.error || null,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/simpanan',
      });
    } catch (err) {
      console.error('Error listSimpanan:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: true, currentPath: '/admin/simpanan' });
    }
  },

  // ─── 2. Detail Mutasi Simpanan Anggota ─────────────────────────
  detailSimpananAnggota: async (req, res) => {
    try {
      const { userId } = req.params;

      const { rows: userRows } = await pool.query(
        "SELECT id, nama, nip, nik, jabatan, unit_kerja, no_hp, alamat, skema_simpanan_pokok, tenor_simpanan_pokok, nominal_cicilan_pokok, status_keanggotaan FROM users WHERE id = $1 AND role = 'user'",
        [userId]
      );

      if (userRows.length === 0) {
        return res.redirect('/admin/simpanan?error=Anggota tidak ditemukan');
      }

      const anggota = userRows[0];

      // Ambil data pencairan pensiun jika ada
      const { rows: pensiunRows } = await pool.query(
        "SELECT id, nomor_surat, tanggal_penarikan, total_dana_diterima FROM penarikan_pensiun WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
        [userId]
      );
      const dataPensiun = pensiunRows.length > 0 ? pensiunRows[0] : null;

      // Ambil seluruh riwayat transaksi simpanan anggota
      const { rows: riwayat } = await pool.query(`
        SELECT ts.*, adm.nama as admin_nama
        FROM transaksi_simpanan ts
        LEFT JOIN users adm ON ts.admin_id = adm.id
        WHERE ts.user_id = $1
        ORDER BY ts.tanggal DESC, ts.id DESC
      `, [userId]);

      // Hitung saldo masing-masing
      let pokok = 0, wajib = 0, sukarela = 0;
      riwayat.forEach(r => {
        const nom = parseFloat(r.nominal);
        const delta = r.tipe_transaksi === 'setor' ? nom : -nom;
        if (r.jenis_simpanan === 'pokok') pokok += delta;
        else if (r.jenis_simpanan === 'wajib') wajib += delta;
        else if (r.jenis_simpanan === 'sukarela') sukarela += delta;
      });

      const total = pokok + wajib + sukarela;
      const targetPokok = 1005000;
      const isPokokLunas = pokok >= targetPokok;
      const sisaPokok = Math.max(0, targetPokok - pokok);
      const persenPokok = Math.min(100, Math.round((pokok / targetPokok) * 100));
      const cicilanPerBulan = parseFloat(anggota.nominal_cicilan_pokok) > 0 
        ? parseFloat(anggota.nominal_cicilan_pokok) 
        : Math.round(targetPokok / (anggota.tenor_simpanan_pokok || 12));

      res.render('admin/detail-simpanan', {
        title: `Buku Simpanan — ${anggota.nama}`,
        anggota,
        dataPensiun,
        riwayat,
        saldo: { pokok, wajib, sukarela, total },
        targetPokok,
        simpananWajibPerBulan: 100000,
        isPokokLunas,
        sisaPokok,
        persenPokok,
        cicilanPerBulan,
        success: req.query.success || null,
        error: req.query.error || null,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/simpanan',
      });
    } catch (err) {
      console.error('Error detailSimpananAnggota:', err);
      res.redirect('/admin/simpanan?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── 3. Simpan Transaksi Simpanan ──────────────────────────────
  simpanTransaksi: async (req, res) => {
    try {
      const { user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, redirect_to } = req.body;

      const cleanNominal = typeof nominal === 'string' ? nominal.replace(/[^0-9]/g, '') : nominal;
      const nom = parseFloat(cleanNominal) || 0;

      if (!user_id || !jenis_simpanan || !nom || nom <= 0) {
        return res.redirect('/admin/simpanan?error=' + encodeURIComponent('Mohon isi semua data transaksi simpanan dengan benar.'));
      }

      // Validasi batas maksimal Simpanan Pokok: Rp 1.005.000 (tidak bisa disetor lagi jika sudah lunas)
      if (jenis_simpanan === 'pokok' && (tipe_transaksi === 'setor' || !tipe_transaksi)) {
        const { rows: pokokRow } = await pool.query(`
          SELECT COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal ELSE -nominal END), 0) as total_pokok
          FROM transaksi_simpanan
          WHERE user_id = $1 AND jenis_simpanan = 'pokok'
        `, [user_id]);

        const currentPokok = parseFloat(pokokRow[0]?.total_pokok || 0);
        const MAX_POKOK = 1005000;

        if (currentPokok >= MAX_POKOK) {
          const redirectUrl = redirect_to || `/admin/simpanan/anggota/${user_id}`;
          return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent('Simpanan Pokok anggota sudah lunas (Maksimal Rp 1.005.000). Tidak dapat menambah setoran simpanan pokok lagi.'));
        }

        if (currentPokok + nom > MAX_POKOK) {
          const sisaBoleh = MAX_POKOK - currentPokok;
          const redirectUrl = redirect_to || `/admin/simpanan/anggota/${user_id}`;
          return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(`Nominal setoran melebihi batas maksimal Simpanan Pokok (Rp 1.005.000). Sisa kewajiban anggota hanya Rp ${sisaBoleh.toLocaleString('id-ID')}.`));
        }
      }

      // Jika penarikan, cek apakah saldo mencukupi
      if (tipe_transaksi === 'tarik') {
        const { rows: saldoRow } = await pool.query(`
          SELECT COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal ELSE -nominal END), 0) as saldo
          FROM transaksi_simpanan
          WHERE user_id = $1 AND jenis_simpanan = $2
        `, [user_id, jenis_simpanan]);

        const currentBalance = parseFloat(saldoRow[0]?.saldo || 0);
        if (nom > currentBalance) {
          const redirectUrl = redirect_to || `/admin/simpanan/anggota/${user_id}`;
          return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'error=' + encodeURIComponent(`Saldo ${jenis_simpanan} tidak mencukupi untuk ditarik. Saldo saat ini: Rp ${currentBalance.toLocaleString('id-ID')}`));
        }
      }

      const { rows: inserted } = await pool.query(`
        INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        user_id,
        jenis_simpanan,
        tipe_transaksi || 'setor',
        nom,
        tanggal || new Date().toISOString().slice(0, 10),
        keterangan || (tipe_transaksi === 'tarik' ? 'Penarikan Simpanan' : 'Setoran Simpanan'),
        req.session.userId || req.session.user?.id || null,
      ]);

      const trxId = inserted[0]?.id;
      const { rows: userRow } = await pool.query('SELECT nama FROM users WHERE id = $1', [user_id]);
      const namaUser = userRow[0]?.nama || `User #${user_id}`;

      await logAuditReq(
        req, 
        tipe_transaksi === 'tarik' ? 'SIMPANAN_TARIK' : 'SIMPANAN_SETOR',
        'SIMPANAN',
        trxId,
        `${tipe_transaksi === 'tarik' ? 'Penarikan' : 'Setoran'} ${jenis_simpanan} sebesar Rp ${nom.toLocaleString('id-ID')} untuk ${namaUser}`
      );

      const target = redirect_to || `/admin/simpanan/anggota/${user_id}`;
      return res.redirect(target + (target.includes('?') ? '&' : '?') + 'success=' + encodeURIComponent('Transaksi simpanan berhasil dicatat!'));
    } catch (err) {
      console.error('Error simpanTransaksi:', err);
      res.redirect('/admin/simpanan?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── 4. Hapus Transaksi Simpanan ───────────────────────────────
  hapusTransaksi: async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.query;

      await pool.query('DELETE FROM transaksi_simpanan WHERE id = $1', [id]);
      await logAuditReq(req, 'SIMPANAN_HAPUS', 'SIMPANAN', id, `Menghapus mutasi simpanan ID #${id}`);

      const redirectUrl = user_id ? `/admin/simpanan/anggota/${user_id}` : '/admin/simpanan';
      return res.redirect(redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'success=' + encodeURIComponent('Transaksi simpanan berhasil dihapus.'));
    } catch (err) {
      console.error('Error hapusTransaksi:', err);
      res.redirect('/admin/simpanan?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── 5. Cetak Kwitansi Simpanan ───────────────────────────────
  cetakKwitansiSimpanan: async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(`
        SELECT ts.*, 
               u.nama AS anggota_nama, u.nip AS anggota_nip, u.unit_kerja AS anggota_unit_kerja,
               adm.nama AS admin_nama
        FROM transaksi_simpanan ts
        JOIN users u ON ts.user_id = u.id
        LEFT JOIN users adm ON ts.admin_id = adm.id
        WHERE ts.id = $1
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).send('Transaksi simpanan tidak ditemukan.');
      }

      const transaksi = rows[0];
      const terbilang = terbilangRupiah(transaksi.nominal);

      res.render('admin/kwitansi-simpanan', {
        title: `Kwitansi Simpanan No. ${transaksi.id} — Koperasi BKN`,
        transaksi,
        terbilang,
      });
    } catch (err) {
      console.error('Error cetakKwitansiSimpanan:', err);
      res.status(500).send('Gagal memuat kwitansi: ' + err.message);
    }
  },

  // ─── 6. View Simpanan untuk Anggota (Pegawai) ─────────────────
  simpananSaya: async (req, res) => {
    try {
      const userId = req.session.userId || req.session.user?.id;
      const currentUser = req.session.user || { id: userId, nama: req.session.nama, nip: req.session.nip, role: req.session.role };

      // Ambil transaksi simpanan user login
      const { rows: riwayat } = await pool.query(`
        SELECT ts.*, adm.nama as admin_nama
        FROM transaksi_simpanan ts
        LEFT JOIN users adm ON ts.admin_id = adm.id
        WHERE ts.user_id = $1
        ORDER BY ts.tanggal DESC, ts.id DESC
      `, [userId]);

      let pokok = 0, wajib = 0, sukarela = 0;
      riwayat.forEach(r => {
        const nom = parseFloat(r.nominal);
        const delta = r.tipe_transaksi === 'setor' ? nom : -nom;
        if (r.jenis_simpanan === 'pokok') pokok += delta;
        else if (r.jenis_simpanan === 'wajib') wajib += delta;
        else if (r.jenis_simpanan === 'sukarela') sukarela += delta;
      });

      // Ambil preferensi skema simpanan pokok anggota
      const { rows: userPrefRows } = await pool.query(
        "SELECT skema_simpanan_pokok, tenor_simpanan_pokok, nominal_cicilan_pokok FROM users WHERE id = $1",
        [userId]
      );
      const userPref = userPrefRows[0] || {};
      const targetPokok = 1005000;
      const isPokokLunas = pokok >= targetPokok;
      const sisaPokok = Math.max(0, targetPokok - pokok);
      const persenPokok = Math.min(100, Math.round((pokok / targetPokok) * 100));
      const cicilanPerBulan = parseFloat(userPref.nominal_cicilan_pokok) > 0 
        ? parseFloat(userPref.nominal_cicilan_pokok) 
        : Math.round(targetPokok / (userPref.tenor_simpanan_pokok || 12));

      // Ambil data pencairan pensiun jika ada
      const { rows: pensiunRows } = await pool.query(
        "SELECT id, nomor_surat, tanggal_penarikan, total_dana_diterima FROM penarikan_pensiun WHERE user_id = $1 ORDER BY id DESC LIMIT 1",
        [userId]
      );
      const dataPensiun = pensiunRows.length > 0 ? pensiunRows[0] : null;

      res.render('user/simpanan-saya', {
        title: 'Buku Simpanan Saya — Koperasi BKN',
        riwayat,
        dataPensiun,
        saldo: { pokok, wajib, sukarela, total: pokok + wajib + sukarela },
        user: currentUser,
        userPref,
        targetPokok,
        simpananWajibPerBulan: 100000,
        isPokokLunas,
        sisaPokok,
        persenPokok,
        cicilanPerBulan,
        isAdmin: false,
        currentPath: '/simpanan-saya',
      });
    } catch (err) {
      console.error('Error simpananSaya:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: false, currentPath: '/simpanan-saya' });
    }
  },
};
