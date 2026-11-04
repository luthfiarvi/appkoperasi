/**
 * controllers/pinjamanController.js
 * Manajemen Pinjaman, Simulasi Sliding Rate, Approval, Pelunasan Dipercepat & SKL
 */

/**
 * Kalkulasi simulasi bunga menurun (sliding rate)
 * Angsuran Pokok Tetap = plafon / tenor
 * Bunga = sukuBunga% × sisa saldo pokok
 */
function hitungSimulasi(plafon, tenor, sukuBungaPersen = 2.0) {
  const angsuranPokok = plafon / tenor;
  const rows = [];
  let sisaPokok = plafon;

  for (let i = 1; i <= tenor; i++) {
    const bunga = (sukuBungaPersen / 100) * sisaPokok;
    const total = angsuranPokok + bunga;
    sisaPokok   = sisaPokok - angsuranPokok;

    rows.push({
      bulan_ke:       i,
      pokok_angsuran: Math.round(angsuranPokok * 100) / 100,
      bunga_angsuran: Math.round(bunga * 100) / 100,
      total_angsuran: Math.round(total * 100) / 100,
      sisa_pokok:     Math.max(0, Math.round(sisaPokok * 100) / 100),
    });
  }
  return rows;
}

/**
 * Generate periode_tagihan (YYYY-MM) mulai bulan depan dari sekarang
 */
function generatePeriodeTags(tenor) {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const hasil = [];
  for (let i = 0; i < tenor; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    hasil.push(`${y}-${m}`);
  }
  return hasil;
}

const pool          = require('../config/database');
const PinjamanModel = require('../models/pinjamanModel');
const CicilanModel  = require('../models/cicilanModel');
const { logAuditReq } = require('../utils/auditLogger');
const { terbilangRupiah } = require('../utils/terbilang');

const PinjamanController = {
  // ─── User: Dashboard ───────────────────────────────────────────────
  userDashboard: async (req, res) => {
    try {
      const userId    = req.session.userId;
      const pengajuan = await PinjamanModel.findByUserId(userId);
      const activeLoan = await PinjamanModel.findActiveLoanByUserId(userId);
      const histori   = await CicilanModel.findPaidByUserId(userId);
      
      let jadwalCicilan = [];
      if (activeLoan) {
        jadwalCicilan = await CicilanModel.findByPinjamanId(activeLoan.id);
      }

      const totalHutang = activeLoan ? activeLoan.sisa_hutang_aktif : 0;
      const totalPinjam = pengajuan
        .filter(p => p.status === 'APPROVED' || p.status === 'LUNAS')
        .reduce((sum, p) => sum + parseFloat(p.nominal_pengajuan), 0);

      res.render('user/dashboard', {
        title: 'Dashboard Saya - Koperasi BKN',
        user: { nama: req.session.nama, nip: req.session.nip },
        activeLoan,
        jadwalCicilan,
        histori,
        totalHutang,
        totalPinjam,
        pengajuan,
        formatRp,
      });
    } catch (err) {
      console.error('userDashboard error:', err);
      res.status(500).send('Server Error');
    }
  },

  // ─── User: Form Pengajuan ──────────────────────────────────────────
  showFormPengajuan: async (req, res) => {
    try {
      const activeLoan = await PinjamanModel.findActiveLoanByUserId(req.session.userId);
      const semua = await PinjamanModel.findByUserId(req.session.userId);
      const pendingLoan = semua.find(p => p.status === 'PENDING') || null;

      const { rows: uRows } = await pool.query('SELECT gaji_bersih FROM users WHERE id = $1', [req.session.userId]);
      const gajiBersih = uRows[0]?.gaji_bersih ? parseFloat(uRows[0].gaji_bersih) : 6500000;

      const rawNom = req.query.nominal || req.query.plafon || '';
      const defaultNominal = rawNom ? String(rawNom).replace(/[^0-9]/g, '') : '';
      const defaultTenor   = req.query.tenor || '';

      res.render('user/form-pengajuan', {
        title: 'Pengajuan Pinjaman - Koperasi BKN',
        user: { nama: req.session.nama, gaji_bersih: gajiBersih },
        gajiBersih,
        activeLoan,
        pendingLoan,
        defaultNominal,
        defaultTenor,
        error: null,
        success: null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  },

  // ─── User: POST Pengajuan ─────────────────────────────────────────
  submitPengajuan: async (req, res) => {
    const { nominal_pengajuan, tenor_bulan, keperluan } = req.body;
    try {
      const { rows: uRows } = await pool.query('SELECT gaji_bersih FROM users WHERE id = $1', [req.session.userId]);
      const gajiBersih = uRows[0]?.gaji_bersih ? parseFloat(uRows[0].gaji_bersih) : 6500000;

      const activeLoan = await PinjamanModel.findActiveLoanByUserId(req.session.userId);
      const semua = await PinjamanModel.findByUserId(req.session.userId);
      const pendingLoan = semua.find(p => p.status === 'PENDING') || null;

      if (pendingLoan) {
        return res.render('user/form-pengajuan', {
          title: 'Pengajuan Pinjaman',
          user: { nama: req.session.nama, gaji_bersih: gajiBersih },
          gajiBersih,
          activeLoan,
          pendingLoan,
          error: 'Anda sudah memiliki pengajuan pinjaman #' + pendingLoan.id + ' yang sedang menunggu persetujuan admin.',
          success: null,
        });
      }

      const cleanNominal = typeof nominal_pengajuan === 'string'
        ? nominal_pengajuan.replace(/[^0-9]/g, '')
        : nominal_pengajuan;
      const nominal = parseFloat(cleanNominal);
      const tenor   = parseInt(tenor_bulan);

      if (isNaN(nominal) || nominal < 100000 || isNaN(tenor) || tenor < 1 || tenor > 36) {
        return res.render('user/form-pengajuan', {
          title: 'Pengajuan Pinjaman',
          user: { nama: req.session.nama, gaji_bersih: gajiBersih },
          gajiBersih,
          activeLoan,
          pendingLoan: null,
          defaultNominal: nominal_pengajuan || '',
          defaultTenor: tenor_bulan || '',
          error: 'Nominal atau tenor tidak valid (maksimal tenor 36 bulan).',
          success: null,
        });
      }

      // Validasi Top-Up: Nominal baru harus lebih besar dari sisa pokok pinjaman aktif
      const isTopUp = !!activeLoan;
      const sisaPokokLama = isTopUp ? parseFloat(activeLoan.sisa_hutang_aktif || 0) : 0;
      if (isTopUp && nominal <= sisaPokokLama) {
        return res.render('user/form-pengajuan', {
          title: 'Pengajuan Pinjaman',
          user: { nama: req.session.nama, gaji_bersih: gajiBersih },
          gajiBersih,
          activeLoan,
          pendingLoan: null,
          defaultNominal: nominal_pengajuan || '',
          defaultTenor: tenor_bulan || '',
          error: `Untuk Top-Up Pinjaman, nominal pinjaman baru harus lebih besar dari sisa pokok pinjaman aktif Anda (Rp ${Math.round(sisaPokokLama).toLocaleString('id-ID')}).`,
          success: null,
        });
      }

      // Validasi Kemampuan Bayar (DSR - Debt Service Ratio terhadap Gaji Bersih)
      // Potongan bulan ke-1 = Pokok + Bunga Sliding 2% + Simpanan Wajib (Rp 100.000)
      const angsuranPokok = nominal / tenor;
      const bungaBln1     = 0.02 * nominal;
      const totalCicilan1 = angsuranPokok + bungaBln1;
      const simpananWajib = 100000;
      const totalPotongan1 = totalCicilan1 + simpananWajib;
      const dsrPct = Math.round((totalPotongan1 / gajiBersih) * 100);

      if (dsrPct > 50) {
        return res.render('user/form-pengajuan', {
          title: 'Pengajuan Pinjaman',
          user: { nama: req.session.nama, gaji_bersih: gajiBersih },
          gajiBersih,
          activeLoan,
          pendingLoan: null,
          defaultNominal: nominal_pengajuan || '',
          defaultTenor: tenor_bulan || '',
          error: `Kemampuan bayar tidak mencukupi! Estimasi potongan gaji bulan pertama (Rp ${Math.round(totalPotongan1).toLocaleString('id-ID')}) mencapai ${dsrPct}% dari gaji bersih Anda (Rp ${Math.round(gajiBersih).toLocaleString('id-ID')}), melebihi batas maksimal 50% gaji. Silakan perpanjang tenor atau turunkan nominal pinjaman agar pengajuan dapat diproses.`,
          success: null,
        });
      }

      const newLoan = await PinjamanModel.create({
        user_id: req.session.userId,
        nominal_pengajuan: nominal,
        tenor_bulan: tenor,
        keperluan,
        is_topup: isTopUp,
        topup_pinjaman_id: isTopUp ? activeLoan.id : null,
        pelunasan_pinjaman_lama: isTopUp ? sisaPokokLama : 0,
      });

      const jenisLabel = isTopUp ? 'Top-Up Pinjaman' : 'Pinjaman Baru';
      await logAuditReq(req, 'PENGAJUAN_SUBMIT', 'PINJAMAN', newLoan.id, `Pengajuan ${jenisLabel} sebesar Rp ${nominal.toLocaleString('id-ID')} diajukan oleh ${req.session.nama}`);

      res.redirect('/dashboard?success=pengajuan');
    } catch (err) {
      console.error(err);
      res.render('user/form-pengajuan', {
        title: 'Pengajuan Pinjaman',
        user: { nama: req.session.nama },
        gajiBersih: 6500000,
        activeLoan: null,
        defaultNominal: req.body.nominal_pengajuan || '',
        defaultTenor: req.body.tenor_bulan || '',
        error: 'Gagal mengajukan pinjaman. Coba lagi.',
        success: null,
      });
    }
  },

  // ─── User: Simulasi (GET) ─────────────────────────────────────────
  showSimulasi: (req, res) => {
    res.render('user/simulasi', {
      title: 'Simulasi Pinjaman - Koperasi BKN',
      user: { nama: req.session.nama },
      hasil: null,
      input: { plafon: '', tenor: '', rate: 2.0 },
      formatRp,
    });
  },

  // ─── User: Simulasi (POST) ────────────────────────────────────────
  postSimulasi: (req, res) => {
    const rawPlafon = typeof req.body.plafon === 'string'
      ? req.body.plafon.replace(/[^0-9]/g, '')
      : req.body.plafon;
    const plafon = parseFloat(rawPlafon) || 0;
    const tenor  = parseInt(req.body.tenor) || 1;
    const rate   = parseFloat(req.body.rate) || 2.0;

    let rows = [];
    if (plafon > 0 && tenor > 0) {
      rows = hitungSimulasi(plafon, tenor, rate);
    }

    const totalBunga   = rows.reduce((s, r) => s + r.bunga_angsuran, 0);
    const totalBayar   = plafon + totalBunga;
    const angsuranAwal = rows[0] ? rows[0].total_angsuran : 0;
    const angsuranAkhir= rows[rows.length - 1] ? rows[rows.length - 1].total_angsuran : 0;

    res.render('user/simulasi', {
      title: 'Simulasi Pinjaman - Koperasi BKN',
      user: { nama: req.session.nama },
      simulasi: rows,
      totalBunga,
      totalBayar,
      angsuranAwal,
      angsuranAkhir,
      hasil: {
        rows,
        totalBunga,
        totalBayar,
        angsuranAwal,
        angsuranAkhir,
      },
      input: { plafon, tenor, rate },
      formatRp,
    });
  },

  // ─── Admin: Dashboard ─────────────────────────────────────────────
  adminDashboard: async (req, res) => {
    try {
      const stats      = await PinjamanModel.countByStatus();
      const pendingList= await PinjamanModel.findAll('PENDING');

      const statusMap = { PENDING: 0, APPROVED: 0, REJECTED: 0, LUNAS: 0 };
      stats.forEach(r => { statusMap[r.status] = parseInt(r.total || r.jumlah || 0); });

      const { rows: sumRows } = await pool.query(
        "SELECT COALESCE(SUM(nominal_cair), 0) AS total_disalurkan FROM pengajuan_pinjaman WHERE status IN ('APPROVED', 'LUNAS')"
      );
      const totalDisalurkan = parseFloat(sumRows[0]?.total_disalurkan || 0);

      const { rows: angsuranRows } = await pool.query(
        `SELECT COALESCE(SUM(total_angsuran), 0) AS total 
         FROM cicilan_pinjaman 
         WHERE status_potong = 'SUDAH_DIPOTONG' 
           AND DATE_TRUNC('month', tanggal_potong) = DATE_TRUNC('month', CURRENT_DATE)`
      );
      const totalAngsuranBulan = parseFloat(angsuranRows[0]?.total || 0);

      const allPengajuan = await PinjamanModel.findAll();
      const recentPengajuan = allPengajuan.slice(0, 10);

      res.render('admin/dashboard', {
        title: 'Dashboard Admin - Koperasi BKN',
        user: { nama: req.session.nama },
        statusMap,
        totalDisalurkan,
        totalDana: totalDisalurkan,
        totalAngsuranBulan,
        pendingList,
        pengajuanPending: pendingList,
        recentPengajuan,
        formatRp,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  },

  // ─── Admin: Daftar pengajuan ──────────────────────────────────────
  adminListPengajuan: async (req, res) => {
    try {
      const status = req.query.status || null;
      const list   = await PinjamanModel.findAll(status);
      res.render('admin/list-pengajuan', {
        title: 'Daftar Pengajuan Pinjaman - Koperasi BKN',
        user: { nama: req.session.nama },
        list,
        filterStatus: status || '',
        formatRp,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  },

  // ─── Admin: Detail pengajuan & Analisis DSR ───────────────────────
  adminDetailPengajuan: async (req, res) => {
    try {
      const pinjaman = await PinjamanModel.findById(req.params.id);
      if (!pinjaman) return res.status(404).send('Data tidak ditemukan.');

      let jadwal = [];
      if (pinjaman.status === 'APPROVED' || pinjaman.status === 'LUNAS') {
        jadwal = await CicilanModel.findByPinjamanId(pinjaman.id);
      }

      const simulasi = hitungSimulasi(
        parseFloat(pinjaman.nominal_pengajuan),
        parseInt(pinjaman.tenor_bulan),
        parseFloat(pinjaman.suku_bunga_persen)
      );

      // Hitung Debt Service Ratio (DSR)
      const gajiBersih = pinjaman.gaji_bersih ? parseFloat(pinjaman.gaji_bersih) : 6500000;
      const angsuranBln1 = simulasi[0]?.total_angsuran || (pinjaman.nominal_pengajuan / pinjaman.tenor_bulan);
      const dsrPersen = Math.round((angsuranBln1 / gajiBersih) * 100);

      // Hitung info Pelunasan Dipercepat
      const { rows: sisaRow } = await pool.query(`
        SELECT 
          COALESCE(SUM(pokok_angsuran), 0) AS sisa_pokok,
          COALESCE(SUM(bunga_angsuran), 0) AS bunga_hemat,
          COUNT(*) AS sisa_bulan
        FROM cicilan_pinjaman
        WHERE pinjaman_id = $1 AND status_potong = 'BELUM_DIPOTONG'
      `, [pinjaman.id]);

      const earlySettlementInfo = {
        sisaPokok: parseFloat(sisaRow[0]?.sisa_pokok || 0),
        bungaHemat: parseFloat(sisaRow[0]?.bunga_hemat || 0),
        sisaBulan: parseInt(sisaRow[0]?.sisa_bulan || 0),
      };

      let topupPinjamanLama = null;
      if (pinjaman.is_topup && pinjaman.topup_pinjaman_id) {
        topupPinjamanLama = await PinjamanModel.findById(pinjaman.topup_pinjaman_id);
      }

      res.render('admin/detail-pengajuan', {
        title: 'Detail Pengajuan - Koperasi BKN',
        user: { nama: req.session.nama },
        pinjaman,
        topupPinjamanLama,
        jadwal,
        simulasi,
        gajiBersih,
        angsuranBln1,
        dsrPersen,
        earlySettlementInfo,
        formatRp,
        error: null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  },

  // ─── Admin: POST Approve (dengan transaksi DB) ────────────────────
  approvePengajuan: async (req, res) => {
    const pinjamanId = parseInt(req.params.id);
    const { biaya_admin_type, biaya_admin_nominal, biaya_admin_persen, catatan_admin } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const pinjaman = await PinjamanModel.findById(pinjamanId);
      if (!pinjaman || pinjaman.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.redirect(`/admin/pengajuan/${pinjamanId}?error=status_invalid`);
      }

      const plafon = parseFloat(pinjaman.nominal_pengajuan);
      const tenor  = parseInt(pinjaman.tenor_bulan);
      const rate   = parseFloat(pinjaman.suku_bunga_persen);

      // Biaya admin fix 1%
      let biayaAdmin = 0;
      if (biaya_admin_type === 'flat') {
        const cleanAdmin = typeof biaya_admin_nominal === 'string'
          ? biaya_admin_nominal.replace(/[^0-9]/g, '')
          : biaya_admin_nominal;
        biayaAdmin = parseFloat(cleanAdmin) || (0.01 * plafon);
      } else {
        biayaAdmin = ((parseFloat(biaya_admin_persen) || 1) / 100) * plafon;
      }

      // Proses pelunasan pinjaman lama jika pengajuan ini adalah TOP-UP
      let pelunasanLama = 0;
      if (pinjaman.is_topup && pinjaman.topup_pinjaman_id) {
        // Ambil sisa pokok pinjaman lama
        const { rows: oldRows } = await client.query(`
          SELECT p.id, COALESCE(SUM(c.pokok_angsuran) FILTER (WHERE c.status_potong = 'BELUM_DIPOTONG'), 0) AS sisa_pokok
          FROM pengajuan_pinjaman p
          LEFT JOIN cicilan_pinjaman c ON c.pinjaman_id = p.id
          WHERE p.id = $1
          GROUP BY p.id
        `, [pinjaman.topup_pinjaman_id]);

        pelunasanLama = oldRows[0] ? parseFloat(oldRows[0].sisa_pokok) : parseFloat(pinjaman.pelunasan_pinjaman_lama || 0);

        // Lunasi sisa cicilan pinjaman lama
        await client.query(`
          UPDATE cicilan_pinjaman
          SET status_potong = 'SUDAH_DIPOTONG', tanggal_potong = NOW()
          WHERE pinjaman_id = $1 AND status_potong = 'BELUM_DIPOTONG'
        `, [pinjaman.topup_pinjaman_id]);

        // Tandai pinjaman lama berstatus LUNAS
        await client.query(`
          UPDATE pengajuan_pinjaman
          SET status = 'LUNAS', 
              catatan_admin = COALESCE(catatan_admin, '') || ' [Dilunasi otomatis via Top-Up Pinjaman #' || $2 || ']'
          WHERE id = $1
        `, [pinjaman.topup_pinjaman_id, pinjamanId]);
      }

      const nominalCair = Math.max(0, plafon - biayaAdmin - pelunasanLama);

      // Update status pinjaman
      await client.query(
        `UPDATE pengajuan_pinjaman
         SET status='APPROVED', biaya_admin=$2, nominal_cair=$3,
             catatan_admin=$4, tanggal_persetujuan=NOW(),
             pelunasan_pinjaman_lama=$5
         WHERE id=$1 RETURNING *`,
        [pinjamanId, biayaAdmin, nominalCair, catatan_admin, pelunasanLama]
      );

      // Generate jadwal cicilan
      const simulasi = hitungSimulasi(plafon, tenor, rate);
      const periodes  = generatePeriodeTags(tenor);

      const cicilanData = simulasi.map((row, idx) => ({
        pinjaman_id:    pinjamanId,
        bulan_ke:       row.bulan_ke,
        periode_tagihan: periodes[idx],
        pokok_angsuran: row.pokok_angsuran,
        bunga_angsuran: row.bunga_angsuran,
        total_angsuran: row.total_angsuran,
        sisa_pokok:     row.sisa_pokok,
      }));

      await CicilanModel.bulkInsert(client, cicilanData);
      await client.query('COMMIT');

      const jenisText = pinjaman.is_topup ? 'TOP-UP ' : '';
      await logAuditReq(req, 'PINJAMAN_APPROVE', 'PINJAMAN', pinjamanId, `Menyetujui pinjaman ${jenisText}#${pinjamanId} untuk ${pinjaman.nama} (Plafon: Rp ${plafon.toLocaleString('id-ID')}, Pelunasan Lama: Rp ${pelunasanLama.toLocaleString('id-ID')}, Cair: Rp ${nominalCair.toLocaleString('id-ID')})`);

      res.redirect(`/admin/pengajuan/${pinjamanId}?success=approved`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Approve error:', err);
      res.redirect(`/admin/pengajuan/${pinjamanId}?error=server`);
    } finally {
      client.release();
    }
  },

  // ─── Admin: POST Reject ───────────────────────────────────────────
  rejectPengajuan: async (req, res) => {
    const { catatan_admin } = req.body;
    try {
      const pinjamanId = req.params.id;
      const pinjaman = await PinjamanModel.findById(pinjamanId);
      await PinjamanModel.reject(pinjamanId, catatan_admin);
      await logAuditReq(req, 'PINJAMAN_REJECT', 'PINJAMAN', pinjamanId, `Menolak pengajuan pinjaman #${pinjamanId} untuk ${pinjaman?.nama || 'Anggota'}. Alasan: ${catatan_admin}`);
      res.redirect(`/admin/pengajuan/${pinjamanId}?success=rejected`);
    } catch (err) {
      console.error(err);
      res.redirect(`/admin/pengajuan/${req.params.id}?error=server`);
    }
  },

  // ─── Admin: Pelunasan Dipercepat (Early Settlement) ───────────────
  pelunasanCepat: async (req, res) => {
    const pinjamanId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pinjaman = await PinjamanModel.findById(pinjamanId);
      if (!pinjaman || pinjaman.status !== 'APPROVED') {
        await client.query('ROLLBACK');
        return res.redirect(`/admin/pengajuan/${pinjamanId}?error=status_invalid`);
      }

      // Tandai seluruh sisa cicilan sebagai SUDAH_DIPOTONG (Pelunasan Dipercepat)
      await client.query(`
        UPDATE cicilan_pinjaman
        SET status_potong = 'SUDAH_DIPOTONG',
            tanggal_potong = CURRENT_DATE,
            updated_at = NOW()
        WHERE pinjaman_id = $1 AND status_potong = 'BELUM_DIPOTONG'
      `, [pinjamanId]);

      // Tandai pengajuan sebagai LUNAS
      await client.query(`
        UPDATE pengajuan_pinjaman
        SET status = 'LUNAS',
            catatan_admin = COALESCE(catatan_admin, '') || ' [Pelunasan Dipercepat disetujui Admin pada ' || TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') || ']'
        WHERE id = $1
      `, [pinjamanId]);

      await client.query('COMMIT');
      await logAuditReq(req, 'PELUNASAN_CEPAT', 'PINJAMAN', pinjamanId, `Pelunasan dipercepat untuk pinjaman #${pinjamanId} atas nama ${pinjaman.nama}`);

      res.redirect(`/admin/pengajuan/${pinjamanId}?success=pelunasan_cepat`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error pelunasanCepat:', err);
      res.redirect(`/admin/pengajuan/${pinjamanId}?error=` + encodeURIComponent(err.message));
    } finally {
      client.release();
    }
  },

  // ─── Cetak Surat Keterangan Lunas (SKL) ───────────────────────────
  cetakSuratLunas: async (req, res) => {
    try {
      const pinjamanId = parseInt(req.params.id);
      const pinjaman = await PinjamanModel.findById(pinjamanId);
      if (!pinjaman) return res.status(404).send('Pinjaman tidak ditemukan');

      res.render('admin/surat-lunas', {
        title: `Surat Keterangan Lunas #${pinjaman.id} — ${pinjaman.nama}`,
        pinjaman,
      });
    } catch (err) {
      console.error('Error cetakSuratLunas:', err);
      res.status(500).send('Gagal memuat Surat Keterangan Lunas: ' + err.message);
    }
  },

  // ─── Cetak Bukti Pencairan Pinjaman ───────────────────────────────
  cetakBuktiPencairan: async (req, res) => {
    try {
      const pinjamanId = parseInt(req.params.id);
      const pinjaman = await PinjamanModel.findById(pinjamanId);
      if (!pinjaman) return res.status(404).send('Pinjaman tidak ditemukan');

      const nominalCair = pinjaman.nominal_cair || (pinjaman.nominal_pengajuan - (pinjaman.biaya_admin || 0));
      const terbilang = terbilangRupiah(nominalCair);

      res.render('admin/bukti-pencairan', {
        title: `Bukti Pencairan #${pinjaman.id} — ${pinjaman.nama}`,
        pinjaman,
        terbilang,
      });
    } catch (err) {
      console.error('Error cetakBuktiPencairan:', err);
      res.status(500).send('Gagal memuat Bukti Pencairan: ' + err.message);
    }
  },

  // ─── Admin: Data Pinjaman (Menu Utama Pinjaman) ───────────────────
  adminDataPinjaman: async (req, res) => {
    try {
      const q = req.query.q ? req.query.q.trim() : '';
      let filterSql = '';
      const params = [];

      if (q) {
        filterSql = ` AND (u.nama ILIKE $1 OR u.nip ILIKE $1 OR u.nik ILIKE $1 OR p.id::text ILIKE $1)`;
        params.push(`%${q}%`);
      }

      const sql = `
        SELECT 
          p.*,
          u.nama, u.nip, u.nik, u.unit_kerja, u.no_hp, u.gaji_bersih,
          COALESCE((
            SELECT SUM(c.pokok_angsuran) FROM cicilan_pinjaman c 
            WHERE c.pinjaman_id = p.id AND c.status_potong = 'BELUM_DIPOTONG'
          ), p.nominal_pengajuan) AS sisa_hutang,
          COALESCE((
            SELECT SUM(c.pokok_angsuran) FROM cicilan_pinjaman c 
            WHERE c.pinjaman_id = p.id AND c.status_potong = 'SUDAH_DIPOTONG'
          ), 0) AS pokok_terbayar,
          (SELECT COUNT(*) FROM cicilan_pinjaman c WHERE c.pinjaman_id = p.id AND c.status_potong = 'SUDAH_DIPOTONG') AS cicilan_terbayar_count
        FROM pengajuan_pinjaman p
        JOIN users u ON u.id = p.user_id
        WHERE 1=1 ${filterSql}
        ORDER BY p.created_at DESC
      `;

      const { rows: pinjamanList } = await pool.query(sql, params);

      // Hitung ringkasan
      const totalPlafon = pinjamanList.reduce((acc, row) => acc + (row.status !== 'REJECTED' ? parseFloat(row.nominal_pengajuan) : 0), 0);
      const totalSisaHutang = pinjamanList.reduce((acc, row) => acc + (row.status === 'APPROVED' ? parseFloat(row.sisa_hutang) : 0), 0);

      const { rows: allUsers } = await pool.query("SELECT id, nip, nik, nama, unit_kerja, gaji_bersih FROM users WHERE role = 'user' ORDER BY nama ASC");

      res.render('admin/list-pinjaman', {
        title: 'Data Pinjaman Anggota — Koperasi BKN',
        pinjamanList,
        totalPlafon,
        totalSisaHutang,
        allUsers,
        q,
        success: req.query.success || null,
        error: req.query.error || null,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/pinjaman',
        formatRp,
      });
    } catch (err) {
      console.error('Error adminDataPinjaman:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: true, currentPath: '/admin/pinjaman' });
    }
  },

  // ─── Admin: Form Buat Pinjaman Baru ───────────────────────────────
  adminFormCreatePinjaman: async (req, res) => {
    try {
      const { rows: allUsers } = await pool.query("SELECT id, nip, nik, nama, unit_kerja, gaji_bersih FROM users WHERE role = 'user' ORDER BY nama ASC");
      res.render('admin/form-pinjaman', {
        title: 'Input Pinjaman Baru — Koperasi BKN',
        allUsers,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/pinjaman',
        error: null,
      });
    } catch (err) {
      console.error(err);
      res.redirect('/admin/pinjaman?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── Admin: POST Simpan Pinjaman Baru Langsung ───────────────────
  adminDirectCreatePinjaman: async (req, res) => {
    const { user_id, nominal_pengajuan, tenor_bulan, suku_bunga_persen, biaya_admin_type, biaya_admin_nominal, biaya_admin_persen, keperluan } = req.body;
    const client = await pool.connect();

    try {
      if (!user_id || !nominal_pengajuan || !tenor_bulan) {
        return res.redirect('/admin/pinjaman?error=' + encodeURIComponent('Anggota, nominal pinjaman, dan tenor wajib diisi!'));
      }

      const cleanPlafon = typeof nominal_pengajuan === 'string'
        ? nominal_pengajuan.replace(/[^0-9]/g, '')
        : nominal_pengajuan;
      const plafon = parseFloat(cleanPlafon);
      const tenor  = parseInt(tenor_bulan);
      const rate   = parseFloat(suku_bunga_persen) || 2.0;

      // Cek apakah anggota sudah punya pinjaman APPROVED aktif
      const { rows: activeCheck } = await client.query(
        "SELECT id FROM pengajuan_pinjaman WHERE user_id = $1 AND status = 'APPROVED'",
        [user_id]
      );

      if (activeCheck.length > 0) {
        return res.redirect('/admin/pinjaman?error=' + encodeURIComponent('Anggota tersebut masih memiliki pinjaman aktif yang belum lunas!'));
      }

      await client.query('BEGIN');

      let biayaAdmin = 0;
      if (biaya_admin_type === 'flat') {
        const cleanAdminNominal = typeof biaya_admin_nominal === 'string'
          ? biaya_admin_nominal.replace(/[^0-9]/g, '')
          : biaya_admin_nominal;
        biayaAdmin = parseFloat(cleanAdminNominal) || 0;
      } else {
        biayaAdmin = ((parseFloat(biaya_admin_persen) || 1) / 100) * plafon;
      }
      const nominalCair = plafon - biayaAdmin;

      // Insert pinjaman dengan status APPROVED
      const { rows: inserted } = await client.query(`
        INSERT INTO pengajuan_pinjaman 
          (user_id, nominal_pengajuan, tenor_bulan, suku_bunga_persen, keperluan, biaya_admin, nominal_cair, status, catatan_admin, tanggal_persetujuan)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, 'APPROVED', 'Disetujui langsung oleh Admin', CURRENT_DATE)
        RETURNING *
      `, [user_id, plafon, tenor, rate, keperluan || 'Pinjaman Anggota', biayaAdmin, nominalCair]);

      const pinjamanId = inserted[0].id;

      // Generate simulasi & cicilan
      const simulasi  = hitungSimulasi(plafon, tenor, rate);
      const periodes  = generatePeriodeTags(tenor);

      const cicilanData = simulasi.map((row, idx) => ({
        pinjaman_id:    pinjamanId,
        bulan_ke:       row.bulan_ke,
        periode_tagihan: periodes[idx],
        pokok_angsuran: row.pokok_angsuran,
        bunga_angsuran: row.bunga_angsuran,
        total_angsuran: row.total_angsuran,
        sisa_pokok:     row.sisa_pokok,
      }));

      await CicilanModel.bulkInsert(client, cicilanData);
      await client.query('COMMIT');

      const { rows: uRow } = await pool.query('SELECT nama FROM users WHERE id = $1', [user_id]);
      await logAuditReq(req, 'PINJAMAN_CREATE_DIRECT', 'PINJAMAN', pinjamanId, `Membuat pinjaman langsung untuk ${uRow[0]?.nama || 'Anggota'} (Plafon: Rp ${plafon.toLocaleString('id-ID')})`);

      res.redirect('/admin/pinjaman?success=' + encodeURIComponent('Pinjaman baru berhasil disimpan dan jadwal cicilan telah dibuat!'));
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error adminDirectCreatePinjaman:', err);
      res.redirect('/admin/pinjaman?error=' + encodeURIComponent(err.message));
    } finally {
      client.release();
    }
  },

  // ─── Admin: POST Hapus Pinjaman ──────────────────────────────────
  adminDeletePinjaman: async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM pengajuan_pinjaman WHERE id = $1', [id]);
      await logAuditReq(req, 'PINJAMAN_DELETE', 'PINJAMAN', id, `Menghapus data pinjaman #${id}`);
      res.redirect('/admin/pinjaman?success=' + encodeURIComponent('Data pinjaman dan seluruh jadwal cicilannya berhasil dihapus.'));
    } catch (err) {
      console.error('Error adminDeletePinjaman:', err);
      res.redirect('/admin/pinjaman?error=' + encodeURIComponent(err.message));
    }
  },
};

// ─── Helper format rupiah ───────────────────────────────────────────
function formatRp(nominal) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(nominal);
}

module.exports = PinjamanController;
