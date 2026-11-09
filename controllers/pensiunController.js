/**
 * controllers/pensiunController.js
 * Modul Penarikan Seluruh Dana Simpanan Pensiun & Tutup Akun Keanggotaan Koperasi BKN
 */
const pool = require('../config/database');
const { logAuditReq } = require('../utils/auditLogger');
const { terbilangRupiah } = require('../utils/terbilang');

const formatRp = (val) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(val) || 0);
};

const getBulanRomawi = (monthIndex) => {
  const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romawi[monthIndex] || 'I';
};

const PensiunController = {
  // ─── 1. Daftar Riwayat Penarikan Dana Pensiun ────────────────────
  listPensiun: async (req, res) => {
    try {
      const q = req.query.q ? req.query.q.trim() : '';

      let sql = `
        SELECT 
          p.*,
          u.nama as nama_anggota,
          u.nip as nip_anggota,
          u.jabatan as jabatan_anggota,
          u.unit_kerja as unit_kerja_anggota,
          COALESCE(adm.nama, 'Admin Koperasi') as admin_nama
        FROM penarikan_pensiun p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN users adm ON adm.id = p.admin_id
      `;
      const params = [];

      if (q) {
        sql += ` WHERE (u.nama ILIKE $1 OR u.nip ILIKE $1 OR p.nomor_surat ILIKE $1 OR u.unit_kerja ILIKE $1)`;
        params.push(`%${q}%`);
      }

      sql += ` ORDER BY p.tanggal_penarikan DESC, p.id DESC`;

      const { rows: listPensiun } = await pool.query(sql, params);

      // Ringkasan Statistik Pensiun
      const totalKasus = listPensiun.length;
      const totalDanaDicairkan = listPensiun.reduce((acc, row) => acc + parseFloat(row.total_dana_diterima || 0), 0);
      const totalHutangDipotong = listPensiun.reduce((acc, row) => acc + parseFloat(row.sisa_pinjaman_pokok || 0), 0);

      // Anggota Aktif yang bisa dipilih untuk proses pensiun
      const { rows: anggotaAktif } = await pool.query(`
        SELECT id, nip, nama, unit_kerja, jabatan 
        FROM users 
        WHERE role = 'user' AND (status_keanggotaan IS NULL OR status_keanggotaan = 'AKTIF')
        ORDER BY nama ASC
      `);

      res.render('admin/list-pensiun', {
        title: 'Penarikan Dana Pensiun — Koperasi BKN Kanreg V',
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/pensiun',
        listPensiun,
        totalKasus,
        totalDanaDicairkan,
        totalHutangDipotong,
        anggotaAktif,
        q,
        formatRp,
        success: req.query.success || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('Error listPensiun:', err);
      res.status(500).send('Gagal memuat daftar pensiun: ' + err.message);
    }
  },

  // ─── 2. Form Rincian & Konfirmasi Penarikan Pensiun ──────────────
  showFormPensiun: async (req, res) => {
    try {
      const { userId } = req.params;

      // 1. Data Anggota
      const { rows: userRows } = await pool.query(`
        SELECT id, nip, nama, unit_kerja, jabatan, alamat, no_hp, email, status_keanggotaan 
        FROM users 
        WHERE id = $1 AND role = 'user'
      `, [userId]);

      if (userRows.length === 0) {
        return res.redirect('/admin/pensiun?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
      }

      const anggota = userRows[0];

      // Cek apakah sudah pernah diproses pensiun
      if (anggota.status_keanggotaan === 'PENSIUN') {
        const { rows: existingPensiun } = await pool.query(`
          SELECT id, nomor_surat FROM penarikan_pensiun WHERE user_id = $1 ORDER BY id DESC LIMIT 1
        `, [userId]);

        if (existingPensiun.length > 0) {
          return res.redirect(`/admin/pensiun/bukti/${existingPensiun[0].id}?info=` + encodeURIComponent(`Anggota ini sudah berstatus PENSIUN dengan dokumen no: ${existingPensiun[0].nomor_surat}.`));
        }
      }

      // 2. Saldo Simpanan Aktual
      const { rows: saldoRows } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS pokok,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS wajib,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS sukarela
        FROM transaksi_simpanan
        WHERE user_id = $1
      `, [userId]);

      const saldoPokok = Math.max(0, parseFloat(saldoRows[0]?.pokok || 0));
      const saldoWajib = Math.max(0, parseFloat(saldoRows[0]?.wajib || 0));
      const saldoSukarela = Math.max(0, parseFloat(saldoRows[0]?.sukarela || 0));
      const totalSimpananKotor = saldoPokok + saldoWajib + saldoSukarela;

      // 3. Cek Pinjaman Aktif & Sisa Pokok Hutang
      const { rows: pinjamanRows } = await pool.query(`
        SELECT p.id, p.nominal_pengajuan, p.tenor_bulan, p.suku_bunga_persen, p.nominal_cair, p.status,
               COALESCE(SUM(c.pokok_angsuran), 0) as sisa_pokok_hutang,
               COUNT(c.id) as sisa_cicilan_bulan
        FROM pengajuan_pinjaman p
        LEFT JOIN cicilan_pinjaman c ON c.pinjaman_id = p.id AND c.status_potong = 'BELUM_DIPOTONG'
        WHERE p.user_id = $1 AND p.status = 'APPROVED'
        GROUP BY p.id
        LIMIT 1
      `, [userId]);

      const pinjamanAktif = pinjamanRows.length > 0 ? pinjamanRows[0] : null;
      const sisaHutang = pinjamanAktif ? parseFloat(pinjamanAktif.sisa_pokok_hutang || 0) : 0;

      // Estimasi Dana Bersih (jika hutang dipotong dari simpanan)
      const estimasiNetto = Math.max(0, totalSimpananKotor - sisaHutang);

      res.render('admin/form-pensiun', {
        title: `Proses Penarikan Pensiun: ${anggota.nama} — Koperasi BKN`,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/pensiun',
        anggota,
        saldo: {
          pokok: saldoPokok,
          wajib: saldoWajib,
          sukarela: saldoSukarela,
          total: totalSimpananKotor
        },
        pinjamanAktif,
        sisaHutang,
        estimasiNetto,
        formatRp,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('Error showFormPensiun:', err);
      res.redirect('/admin/pensiun?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── 3. Eksekusi Pencairan Dana Pensiun (Atomic Transaction) ─────
  postProsesPensiun: async (req, res) => {
    const client = await pool.connect();
    try {
      const { user_id, potong_pinjaman, alasan, keterangan } = req.body;
      const adminId = req.session.userId || req.session.user?.id || null;

      if (!user_id) {
        return res.redirect('/admin/pensiun?error=' + encodeURIComponent('ID Anggota tidak valid.'));
      }

      await client.query('BEGIN');

      // 1. Kunci data user & verifikasi status
      const { rows: userRows } = await client.query(`
        SELECT id, nip, nama, unit_kerja, jabatan, status_keanggotaan 
        FROM users 
        WHERE id = $1 FOR UPDATE
      `, [user_id]);

      if (userRows.length === 0) {
        await client.query('ROLLBACK');
        return res.redirect('/admin/pensiun?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
      }

      const anggota = userRows[0];
      if (anggota.status_keanggotaan === 'PENSIUN') {
        await client.query('ROLLBACK');
        return res.redirect('/admin/pensiun?error=' + encodeURIComponent('Anggota sudah pernah diproses pensiun sebelumnya.'));
      }

      // 2. Kalkulasi ulang saldo simpanan secara akurat di dalam transaksi
      const { rows: saldoRows } = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS pokok,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS wajib,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'setor' THEN nominal 
                            WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS sukarela
        FROM transaksi_simpanan
        WHERE user_id = $1
      `, [user_id]);

      const saldoPokok = Math.max(0, parseFloat(saldoRows[0]?.pokok || 0));
      const saldoWajib = Math.max(0, parseFloat(saldoRows[0]?.wajib || 0));
      const saldoSukarela = Math.max(0, parseFloat(saldoRows[0]?.sukarela || 0));
      const totalSimpananKotor = saldoPokok + saldoWajib + saldoSukarela;

      // 3. Cek sisa hutang pinjaman
      const { rows: pinjamanRows } = await client.query(`
        SELECT p.id,
               COALESCE(SUM(c.pokok_angsuran), 0) as sisa_pokok_hutang
        FROM pengajuan_pinjaman p
        LEFT JOIN cicilan_pinjaman c ON c.pinjaman_id = p.id AND c.status_potong = 'BELUM_DIPOTONG'
        WHERE p.user_id = $1 AND p.status = 'APPROVED'
        GROUP BY p.id
        LIMIT 1
      `, [user_id]);

      let sisaHutang = 0;
      let activeLoanId = null;
      if (pinjamanRows.length > 0) {
        sisaHutang = parseFloat(pinjamanRows[0].sisa_pokok_hutang || 0);
        activeLoanId = pinjamanRows[0].id;
      }

      const isPotongHutang = potong_pinjaman === '1' && sisaHutang > 0;
      const nominalPotonganHutang = isPotongHutang ? sisaHutang : 0;
      const totalDanaDiterima = Math.max(0, totalSimpananKotor - nominalPotonganHutang);

      // 4. Generate Nomor Surat Resmi
      const now = new Date();
      const tahun = now.getFullYear();
      const bulanRomawi = getBulanRomawi(now.getMonth());

      const { rows: countRows } = await client.query(`
        SELECT COUNT(*) as total FROM penarikan_pensiun WHERE EXTRACT(YEAR FROM created_at) = $1
      `, [tahun]);
      const urut = (parseInt(countRows[0]?.total || 0) + 1).toString().padStart(3, '0');
      const nomorSurat = `PENS/KOP-BKN/${tahun}/${bulanRomawi}/${urut}`;

      // 5. Simpan ke tabel penarikan_pensiun
      const finalAlasan = alasan && alasan.trim() ? alasan.trim() : 'Pensiun (Batas Usia Pensiun)';
      const finalKet = keterangan && keterangan.trim() ? keterangan.trim() : `Pencairan seluruh hak simpanan anggota pensiun ${anggota.nama}`;

      const { rows: pensiunInsert } = await client.query(`
        INSERT INTO penarikan_pensiun (
          user_id, nomor_surat, tanggal_penarikan,
          total_simpanan_pokok, total_simpanan_wajib, total_simpanan_sukarela, total_simpanan_kotor,
          sisa_pinjaman_pokok, total_dana_diterima, alasan, keterangan, admin_id
        )
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        user_id,
        nomorSurat,
        saldoPokok,
        saldoWajib,
        saldoSukarela,
        totalSimpananKotor,
        nominalPotonganHutang,
        totalDanaDiterima,
        finalAlasan,
        finalKet,
        adminId
      ]);

      const pensiunId = pensiunInsert[0]?.id;

      // 6. Tarik seluruh simpanan anggota menjadi Rp 0
      const tglHariIni = now.toISOString().slice(0, 10);
      if (saldoPokok > 0) {
        await client.query(`
          INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id)
          VALUES ($1, 'pokok', 'tarik', $2, $3, $4, $5)
        `, [user_id, saldoPokok, tglHariIni, `Pencairan Simpanan Pokok Pensiun (${nomorSurat})`, adminId]);
      }

      if (saldoWajib > 0) {
        await client.query(`
          INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id)
          VALUES ($1, 'wajib', 'tarik', $2, $3, $4, $5)
        `, [user_id, saldoWajib, tglHariIni, `Pencairan Simpanan Wajib Pensiun (${nomorSurat})`, adminId]);
      }

      if (saldoSukarela > 0) {
        await client.query(`
          INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id)
          VALUES ($1, 'sukarela', 'tarik', $2, $3, $4, $5)
        `, [user_id, saldoSukarela, tglHariIni, `Pencairan Simpanan Sukarela Pensiun (${nomorSurat})`, adminId]);
      }

      // 7. Jika hutang dipotong dari simpanan, lunaskan pinjaman
      if (isPotongHutang && activeLoanId) {
        await client.query(`
          UPDATE cicilan_pinjaman 
          SET status_potong = 'SUDAH_DIPOTONG', tanggal_potong = CURRENT_DATE, admin_id = $1
          WHERE pinjaman_id = $2 AND status_potong = 'BELUM_DIPOTONG'
        `, [adminId, activeLoanId]);

        await client.query(`
          UPDATE pengajuan_pinjaman 
          SET status = 'LUNAS', catatan_admin = $1
          WHERE id = $2
        `, [`Dilunasi otomatis via pemotongan dana pensiun (${nomorSurat})`, activeLoanId]);
      }

      // 8. Update status keanggotaan user menjadi PENSIUN
      await client.query(`
        UPDATE users 
        SET status_keanggotaan = 'PENSIUN'
        WHERE id = $1
      `, [user_id]);

      // 9. Catat ke Audit Log
      await logAuditReq(
        req,
        'PENSION_DISBURSEMENT',
        'PENSIUN',
        pensiunId,
        `Pencairan dana pensiun no. ${nomorSurat} untuk ${anggota.nama} (NIP: ${anggota.nip}) sebesar ${formatRp(totalDanaDiterima)}`
      );

      await client.query('COMMIT');
      return res.redirect(`/admin/pensiun/bukti/${pensiunId}?success=` + encodeURIComponent('Pencairan dana pensiun berhasil diproses!'));
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error postProsesPensiun:', err);
      res.redirect('/admin/pensiun?error=' + encodeURIComponent('Gagal memproses penarikan pensiun: ' + err.message));
    } finally {
      client.release();
    }
  },

  // ─── 4. Cetak Berita Acara & Bukti Pencairan Pensiun ─────────────
  cetakBuktiPensiun: async (req, res) => {
    try {
      const { id } = req.params;

      const { rows } = await pool.query(`
        SELECT 
          p.*,
          u.nama as nama_anggota,
          u.nip as nip_anggota,
          u.jabatan as jabatan_anggota,
          u.unit_kerja as unit_kerja_anggota,
          u.alamat as alamat_anggota,
          u.no_hp as no_hp_anggota,
          COALESCE(adm.nama, 'Admin Koperasi') as admin_nama
        FROM penarikan_pensiun p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN users adm ON adm.id = p.admin_id
        WHERE p.id = $1
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).send('Dokumen bukti pencairan pensiun tidak ditemukan.');
      }

      const data = rows[0];
      const terbilang = terbilangRupiah(data.total_dana_diterima);

      res.render('admin/surat-pensiun', {
        title: `Bukti Pencairan Pensiun ${data.nomor_surat} - Koperasi BKN`,
        data,
        terbilang,
        formatRp,
        success: req.query.success || null,
        info: req.query.info || null,
      });
    } catch (err) {
      console.error('Error cetakBuktiPensiun:', err);
      res.status(500).send('Gagal memuat dokumen bukti pensiun: ' + err.message);
    }
  },
};

module.exports = PensiunController;

