/**
 * controllers/laporanController.js
 * Modul Laporan Keuangan Koperasi Pegawai BKN Kanreg V Jakarta
 * Menghasilkan:
 * 1. Neraca Keuangan (Aktiva vs Pasiva Berimbang)
 * 2. Laporan Rugi Laba / Perhitungan Hasil Usaha (PHU)
 * 3. Laporan Arus Kas (Cash Flow) & Posisi Likuiditas
 * 4. Rekapitulasi Pembiayaan, Simpanan & Premi Pinjaman
 */
const pool    = require('../config/database');
const ExcelJS = require('exceljs');

module.exports = {
  // ─── 1. Tampilkan Laporan Keuangan Lengkap ───────────────────────
  showLaporanKeuangan: async (req, res) => {
    try {
      // 1. Simpanan
      const { rows: simpananRows } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS pokok,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS wajib,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS sukarela,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal
                            WHEN tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS total,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal ELSE 0 END), 0) AS total_setor,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'tarik' THEN nominal ELSE 0 END), 0) AS total_tarik
        FROM transaksi_simpanan
      `);

      const simpanan = {
        pokok: parseFloat(simpananRows[0].pokok),
        wajib: parseFloat(simpananRows[0].wajib),
        sukarela: parseFloat(simpananRows[0].sukarela),
        total: parseFloat(simpananRows[0].total),
        totalSetor: parseFloat(simpananRows[0].total_setor),
        totalTarik: parseFloat(simpananRows[0].total_tarik),
      };

      // 2. Pinjaman & Angsuran
      const { rows: loanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(nominal_pengajuan), 0) as total_plafon,
          COALESCE(SUM(biaya_admin), 0) as total_premi,
          COALESCE(SUM(nominal_cair), 0) as total_cair,
          COUNT(*) as total_transaksi
        FROM pengajuan_pinjaman
        WHERE status IN ('APPROVED', 'LUNAS')
      `);

      const { rows: cicilanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as pokok_terbayar,
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN bunga_angsuran ELSE 0 END), 0) as bunga_pendapatan,
          COALESCE(SUM(CASE WHEN status_potong = 'BELUM_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as sisa_piutang
        FROM cicilan_pinjaman
      `);

      const totalPlafon     = parseFloat(loanStats[0].total_plafon);
      const totalPremi      = parseFloat(loanStats[0].total_premi); // Premi / Biaya Admin (1%)
      const pokokTerbayar   = parseFloat(cicilanStats[0].pokok_terbayar);
      const bungaPendapatan = parseFloat(cicilanStats[0].bunga_pendapatan);
      const sisaPiutang     = parseFloat(cicilanStats[0].sisa_piutang);
      const totalPendapatan = bungaPendapatan + totalPremi;
      const bebanOperasional = 0; // Cadangan beban operasional
      const shuBersih       = totalPendapatan - bebanOperasional;

      // 3. Arus Kas (Cash Flow)
      const kasMasuk  = simpanan.totalSetor + pokokTerbayar + totalPendapatan;
      const kasKeluar = totalPlafon + simpanan.totalTarik;
      const saldoKas  = kasMasuk - kasKeluar;

      // 4. Struktur Neraca Koperasi (Aktiva vs Pasiva)
      const neraca = {
        aktiva: {
          kas: saldoKas,
          piutang: sisaPiutang,
          total: saldoKas + sisaPiutang,
        },
        pasiva: {
          kewajiban: {
            simpananSukarela: simpanan.sukarela,
            total: simpanan.sukarela,
          },
          ekuitas: {
            simpananPokok: simpanan.pokok,
            simpananWajib: simpanan.wajib,
            cadangan: 0,
            shuBerjalan: shuBersih,
            total: simpanan.pokok + simpanan.wajib + shuBersih,
          },
          total: simpanan.sukarela + (simpanan.pokok + simpanan.wajib + shuBersih),
        },
      };
      neraca.isBalance = Math.abs(neraca.aktiva.total - neraca.pasiva.total) < 0.01;

      // 5. Struktur Laporan Rugi Laba (PHU)
      const rugiLaba = {
        pendapatanBunga: bungaPendapatan,
        pendapatanPremi: totalPremi,
        totalPendapatan,
        bebanOperasional,
        shuBersih,
      };

      // 6. Struktur Arus Kas
      const arusKas = {
        masuk: {
          simpanan: simpanan.totalSetor,
          pokokAngsuran: pokokTerbayar,
          bunga: bungaPendapatan,
          premi: totalPremi,
          total: kasMasuk,
        },
        keluar: {
          pencairanPinjaman: totalPlafon,
          penarikanSukarela: simpanan.totalTarik,
          total: kasKeluar,
        },
        saldoKas,
      };

      // Rekap per unit kerja
      const { rows: perUnit } = await pool.query(`
        SELECT 
          COALESCE(u.unit_kerja, 'Belum Diatur') as unit_kerja,
          COUNT(DISTINCT u.id) as jml_anggota,
          COALESCE(SUM(CASE WHEN ts.tipe_transaksi = 'setor' THEN ts.nominal
                            WHEN ts.tipe_transaksi = 'tarik' THEN -ts.nominal ELSE 0 END), 0) as total_simpanan,
          COALESCE((
            SELECT SUM(p.nominal_pengajuan) 
            FROM pengajuan_pinjaman p 
            WHERE p.user_id = u.id AND p.status IN ('APPROVED','LUNAS')
          ), 0) as total_pinjaman
        FROM users u
        LEFT JOIN transaksi_simpanan ts ON u.id = ts.user_id
        WHERE u.role = 'user'
        GROUP BY u.unit_kerja, u.id
        ORDER BY unit_kerja ASC
      `);

      // Daftar pinjaman aktif saat ini
      const { rows: pinjamanAktif } = await pool.query(`
        SELECT p.id, p.nominal_pengajuan, p.tenor_bulan, p.suku_bunga_persen, p.status, p.created_at,
               u.nama, u.nip, u.unit_kerja,
               COALESCE((
                 SELECT SUM(c.pokok_angsuran) FROM cicilan_pinjaman c 
                 WHERE c.pinjaman_id = p.id AND c.status_potong = 'BELUM_DIPOTONG'
               ), p.nominal_pengajuan) as sisa_hutang
        FROM pengajuan_pinjaman p
        JOIN users u ON u.id = p.user_id
        WHERE p.status IN ('APPROVED')
        ORDER BY p.tanggal_persetujuan DESC
      `);

      res.render('admin/laporan-keuangan', {
        title: 'Laporan Keuangan & Neraca — Koperasi BKN Kanreg V',
        simpanan,
        pinjaman: {
          totalPlafon,
          totalAdmin: totalPremi,
          totalPremi,
          pokokTerbayar,
          bungaPendapatan,
          sisaPiutang,
          labaOperasional: totalPendapatan,
        },
        kas: {
          masuk: kasMasuk,
          keluar: kasKeluar,
          saldo: saldoKas,
        },
        neraca,
        rugiLaba,
        arusKas,
        perUnit,
        pinjamanAktif,
        formatRp,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/laporan',
      });
    } catch (err) {
      console.error('Error showLaporanKeuangan:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: true, currentPath: '/admin/laporan' });
    }
  },

  // ─── 2. Ekspor Laporan Keuangan ke Excel (.xlsx) ───────────────
  exportExcel: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Koperasi Pegawai BKN Kanreg V Jakarta';
      workbook.created = new Date();

      // Query data
      const { rows: simpananRows } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS pokok,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS wajib,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS sukarela,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal
                            WHEN tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS total,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal ELSE 0 END), 0) AS total_setor,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'tarik' THEN nominal ELSE 0 END), 0) AS total_tarik
        FROM transaksi_simpanan
      `);

      const { rows: loanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(nominal_pengajuan), 0) as total_plafon,
          COALESCE(SUM(biaya_admin), 0) as total_premi
        FROM pengajuan_pinjaman WHERE status IN ('APPROVED', 'LUNAS')
      `);

      const { rows: cicilanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as pokok_terbayar,
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN bunga_angsuran ELSE 0 END), 0) as bunga_pendapatan,
          COALESCE(SUM(CASE WHEN status_potong = 'BELUM_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as sisa_piutang
        FROM cicilan_pinjaman
      `);

      const pokokSimpanan = parseFloat(simpananRows[0].pokok);
      const wajibSimpanan = parseFloat(simpananRows[0].wajib);
      const sukarelaSimpanan = parseFloat(simpananRows[0].sukarela);
      const totalSetor = parseFloat(simpananRows[0].total_setor);
      const totalTarik = parseFloat(simpananRows[0].total_tarik);

      const plafon = parseFloat(loanStats[0].total_plafon);
      const premi  = parseFloat(loanStats[0].total_premi);
      const pokok  = parseFloat(cicilanStats[0].pokok_terbayar);
      const bunga  = parseFloat(cicilanStats[0].bunga_pendapatan);
      const sisa   = parseFloat(cicilanStats[0].sisa_piutang);
      const shu    = bunga + premi;

      const kasMasuk  = totalSetor + pokok + shu;
      const kasKeluar = plafon + totalTarik;
      const saldoKas  = kasMasuk - kasKeluar;

      // ── SHEET 1: NERACA KOPERASI ──
      const wsNeraca = workbook.addWorksheet('1. Neraca Koperasi');
      wsNeraca.mergeCells('A1:D1');
      wsNeraca.getCell('A1').value = 'KOPERASI PEGAWAI BKN KANREG V JAKARTA';
      wsNeraca.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
      wsNeraca.getCell('A1').alignment = { horizontal: 'center' };

      wsNeraca.mergeCells('A2:D2');
      wsNeraca.getCell('A2').value = 'LAPORAN NERACA KEUANGAN (BALANCE SHEET)';
      wsNeraca.getCell('A2').font = { bold: true, size: 11 };
      wsNeraca.getCell('A2').alignment = { horizontal: 'center' };

      wsNeraca.addRow([]);
      wsNeraca.addRow(['AKTIVA (ASET)', 'JUMLAH (RP)', 'PASIVA (KEWAJIBAN & MODAL)', 'JUMLAH (RP)']);
      wsNeraca.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wsNeraca.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

      wsNeraca.addRow(['I. Aset Lancar', '', 'I. Kewajiban Jangka Pendek', '']);
      wsNeraca.addRow(['  - Kas & Bank Koperasi', saldoKas, '  - Simpanan Sukarela Anggota', sukarelaSimpanan]);
      wsNeraca.addRow(['  - Piutang Pinjaman Anggota', sisa, 'II. Ekuitas / Modal Sendiri', '']);
      wsNeraca.addRow(['', '', '  - Simpanan Pokok Anggota', pokokSimpanan]);
      wsNeraca.addRow(['', '', '  - Simpanan Wajib Anggota', wajibSimpanan]);
      wsNeraca.addRow(['', '', '  - SHU / Laba Berjalan', shu]);
      
      const rowTot = wsNeraca.addRow(['TOTAL AKTIVA', saldoKas + sisa, 'TOTAL PASIVA', sukarelaSimpanan + pokokSimpanan + wajibSimpanan + shu]);
      rowTot.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      rowTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

      ['B', 'D'].forEach(col => {
        for (let i = 5; i <= 11; i++) {
          const c = wsNeraca.getCell(`${col}${i}`);
          if (c.value) c.numFmt = '#,##0';
        }
      });
      wsNeraca.columns = [{ width: 35 }, { width: 22 }, { width: 35 }, { width: 22 }];

      // ── SHEET 2: RUGI LABA (PHU) ──
      const wsRL = workbook.addWorksheet('2. Laba Rugi (PHU)');
      wsRL.mergeCells('A1:C1');
      wsRL.getCell('A1').value = 'LAPORAN RUGI LABA / PERHITUNGAN HASIL USAHA (PHU)';
      wsRL.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

      wsRL.addRow([]);
      wsRL.addRow(['No', 'Komponen Pendapatan & Beban', 'Jumlah (Rp)']);
      wsRL.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wsRL.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

      wsRL.addRow(['I', 'PENDAPATAN OPERASIONAL', '']);
      wsRL.addRow(['1', 'Pendapatan Bunga Pinjaman (2% Sliding Rate)', bunga]);
      wsRL.addRow(['2', 'Pendapatan Premi Pinjaman / Biaya Admin (1%)', premi]);
      wsRL.addRow(['', 'TOTAL PENDAPATAN OPERASIONAL', shu]);
      wsRL.getRow(7).font = { bold: true };

      wsRL.addRow(['II', 'BEBAN OPERASIONAL', '']);
      wsRL.addRow(['1', 'Beban Operasional & Kantor', 0]);
      wsRL.addRow(['', 'TOTAL BEBAN OPERASIONAL', 0]);

      const rowSHU = wsRL.addRow(['', 'SISA HASIL USAHA (SHU BERSIH)', shu]);
      rowSHU.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      rowSHU.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };

      for (let i = 4; i <= 11; i++) {
        const c = wsRL.getCell(`C${i}`);
        if (c.value !== undefined && c.value !== '') c.numFmt = '#,##0';
      }
      wsRL.columns = [{ width: 6 }, { width: 45 }, { width: 22 }];

      // ── SHEET 3: ARUS KAS (CASH FLOW) ──
      const wsKas = workbook.addWorksheet('3. Arus Kas');
      wsKas.mergeCells('A1:C1');
      wsKas.getCell('A1').value = 'LAPORAN ARUS KAS KOPERASI (CASH FLOW)';
      wsKas.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };

      wsKas.addRow([]);
      wsKas.addRow(['No', 'Arus Transaksi Kas', 'Jumlah (Rp)']);
      wsKas.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      wsKas.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      wsKas.addRow(['I', 'ARUS KAS MASUK (PENERIMAAN)', '']);
      wsKas.addRow(['1', 'Penerimaan Setoran Simpanan Anggota', totalSetor]);
      wsKas.addRow(['2', 'Penerimaan Angsuran Pokok Pinjaman', pokok]);
      wsKas.addRow(['3', 'Penerimaan Bunga Pinjaman', bunga]);
      wsKas.addRow(['4', 'Penerimaan Premi Pinjaman (1%)', premi]);
      wsKas.addRow(['', 'TOTAL ARUS KAS MASUK', kasMasuk]);
      wsKas.getRow(8).font = { bold: true };

      wsKas.addRow(['II', 'ARUS KAS KELUAR (PENGELUARAN)', '']);
      wsKas.addRow(['1', 'Pencairan Dana Pinjaman Anggota (Plafon)', plafon]);
      wsKas.addRow(['2', 'Penarikan Simpanan Sukarela Anggota', totalTarik]);
      wsKas.addRow(['', 'TOTAL ARUS KAS KELUAR', kasKeluar]);
      wsKas.getRow(12).font = { bold: true };

      const rowKasFinal = wsKas.addRow(['', 'SALDO AKHIR KAS KOPERASI', saldoKas]);
      rowKasFinal.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      rowKasFinal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

      for (let i = 4; i <= 13; i++) {
        const c = wsKas.getCell(`C${i}`);
        if (c.value !== undefined && c.value !== '') c.numFmt = '#,##0';
      }
      wsKas.columns = [{ width: 6 }, { width: 45 }, { width: 22 }];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Laporan_Keuangan_Koperasi_BKN_${new Date().toISOString().slice(0, 10)}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('Error exportExcel:', err);
      res.status(500).send('Gagal mengekspor laporan Excel.');
    }
  },

  // ─── 3. Print Laporan Keuangan Lengkap PDF ───────────────────────
  printLaporan: async (req, res) => {
    try {
      const { rows: simpananRows } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'pokok' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS pokok,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'wajib' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS wajib,
          COALESCE(SUM(CASE WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'setor' THEN nominal
                            WHEN jenis_simpanan = 'sukarela' AND tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS sukarela,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal
                            WHEN tipe_transaksi = 'tarik' THEN -nominal ELSE 0 END), 0) AS total,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'setor' THEN nominal ELSE 0 END), 0) AS total_setor,
          COALESCE(SUM(CASE WHEN tipe_transaksi = 'tarik' THEN nominal ELSE 0 END), 0) AS total_tarik
        FROM transaksi_simpanan
      `);

      const { rows: loanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(nominal_pengajuan), 0) as total_plafon,
          COALESCE(SUM(biaya_admin), 0) as total_premi
        FROM pengajuan_pinjaman WHERE status IN ('APPROVED', 'LUNAS')
      `);

      const { rows: cicilanStats } = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as pokok_terbayar,
          COALESCE(SUM(CASE WHEN status_potong = 'SUDAH_DIPOTONG' THEN bunga_angsuran ELSE 0 END), 0) as bunga_pendapatan,
          COALESCE(SUM(CASE WHEN status_potong = 'BELUM_DIPOTONG' THEN pokok_angsuran ELSE 0 END), 0) as sisa_piutang
        FROM cicilan_pinjaman
      `);

      const simpanan = {
        pokok: parseFloat(simpananRows[0].pokok),
        wajib: parseFloat(simpananRows[0].wajib),
        sukarela: parseFloat(simpananRows[0].sukarela),
        total: parseFloat(simpananRows[0].total),
        totalSetor: parseFloat(simpananRows[0].total_setor),
        totalTarik: parseFloat(simpananRows[0].total_tarik),
      };

      const plafon = parseFloat(loanStats[0].total_plafon);
      const premi  = parseFloat(loanStats[0].total_premi);
      const pokok  = parseFloat(cicilanStats[0].pokok_terbayar);
      const bunga  = parseFloat(cicilanStats[0].bunga_pendapatan);
      const sisa   = parseFloat(cicilanStats[0].sisa_piutang);
      const shu    = bunga + premi;

      const kasMasuk  = simpanan.totalSetor + pokok + shu;
      const kasKeluar = plafon + simpanan.totalTarik;
      const saldoKas  = kasMasuk - kasKeluar;

      const neraca = {
        aktiva: {
          kas: saldoKas,
          piutang: sisa,
          total: saldoKas + sisa,
        },
        pasiva: {
          kewajiban: {
            simpananSukarela: simpanan.sukarela,
            total: simpanan.sukarela,
          },
          ekuitas: {
            simpananPokok: simpanan.pokok,
            simpananWajib: simpanan.wajib,
            cadangan: 0,
            shuBerjalan: shu,
            total: simpanan.pokok + simpanan.wajib + shu,
          },
          total: simpanan.sukarela + (simpanan.pokok + simpanan.wajib + shu),
        },
      };

      const rugiLaba = {
        pendapatanBunga: bunga,
        pendapatanPremi: premi,
        totalPendapatan: shu,
        bebanOperasional: 0,
        shuBersih: shu,
      };

      const arusKas = {
        masuk: {
          simpanan: simpanan.totalSetor,
          pokokAngsuran: pokok,
          bunga,
          premi,
          total: kasMasuk,
        },
        keluar: {
          pencairanPinjaman: plafon,
          penarikanSukarela: simpanan.totalTarik,
          total: kasKeluar,
        },
        saldoKas,
      };

      res.render('admin/print-laporan', {
        title: 'Cetak Laporan Keuangan & Neraca — Koperasi BKN',
        simpanan,
        pinjaman: {
          totalPlafon: plafon,
          totalAdmin: premi,
          totalPremi: premi,
          pokokTerbayar: pokok,
          bungaPendapatan: bunga,
          sisaPiutang: sisa,
          labaOperasional: shu,
        },
        neraca,
        rugiLaba,
        arusKas,
        formatRp,
        dateStr: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' }),
      });
    } catch (err) {
      console.error('Error printLaporan:', err);
      res.status(500).send('Gagal menampilkan halaman cetak laporan.');
    }
  },
};

function formatRp(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
}
