const ExcelJS  = require('exceljs');
const pool      = require('../config/database');
const CicilanModel  = require('../models/cicilanModel');
const PinjamanModel = require('../models/pinjamanModel');

function formatRp(nominal) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(nominal || 0);
}

const PayrollController = {
  // ─── Admin: Halaman Tagihan Gaji ─────────────────────────────────
  showTagihan: async (req, res) => {
    const periode = req.query.periode || new Date().toISOString().slice(0, 7);
    try {
      const tagihan = await CicilanModel.findPendingByPeriode(periode);
      const semua   = await CicilanModel.findByPeriode(periode);

      const totalTagihan    = tagihan.reduce((s, r) => s + parseFloat(r.total_angsuran), 0);
      const totalSudahPotong = semua.filter(r => r.status_potong === 'SUDAH_DIPOTONG')
                                    .reduce((s, r) => s + parseFloat(r.total_angsuran), 0);

      // Hitung ringkasan potongan simpanan wajib (@ Rp 100.000) & cicilan pokok periode ini
      const { rows: memberStats } = await pool.query(`
        SELECT 
          COUNT(u.id) as total_anggota,
          COALESCE(SUM(CASE WHEN u.skema_simpanan_pokok = 'cicil' AND 
            COALESCE((SELECT SUM(CASE WHEN ts.tipe_transaksi='setor' THEN ts.nominal ELSE -ts.nominal END) 
                      FROM transaksi_simpanan ts WHERE ts.user_id = u.id AND ts.jenis_simpanan='pokok'), 0) < 1005000 
            THEN COALESCE(u.nominal_cicilan_pokok, ROUND(1005000 / NULLIF(u.tenor_simpanan_pokok, 0))) ELSE 0 END), 0) as total_cicilan_pokok
        FROM users u WHERE u.role = 'user' AND (u.status_keanggotaan IS NULL OR u.status_keanggotaan = 'AKTIF')
      `);

      const totalAnggota = parseInt(memberStats[0]?.total_anggota || 0);
      const totalSimpananWajib = totalAnggota * 100000;
      const totalCicilanPokok = parseFloat(memberStats[0]?.total_cicilan_pokok || 0);
      const grandTotalPayroll = Math.round(totalTagihan + totalSimpananWajib + totalCicilanPokok);

      res.render('admin/tagihan-payroll', {
        title: 'Tagihan Potongan Gaji - Koperasi BKN',
        user: { nama: req.session.nama },
        tagihan,
        semua,
        periode,
        totalTagihan: Math.round(totalTagihan),
        totalSudahPotong: Math.round(totalSudahPotong),
        totalAnggota,
        totalSimpananWajib,
        totalCicilanPokok,
        grandTotalPayroll,
        formatRp,
        success: req.query.success || null,
        error: req.query.error || null,
      });
    } catch (err) {
      console.error('showTagihan error:', err);
      res.status(500).send('Server Error');
    }
  },

  // ─── Admin: Konfirmasi Pelunasan (Rekonsiliasi Checklist) ─────────
  konfirmasiPelunasan: async (req, res) => {
    const { cicilan_ids, periode } = req.body;
    const adminId = req.session.userId;
    const client  = await pool.connect();

    try {
      // cicilan_ids bisa berupa string (satu) atau array (banyak)
      const ids = Array.isArray(cicilan_ids)
        ? cicilan_ids.map(Number)
        : cicilan_ids
          ? [Number(cicilan_ids)]
          : [];

      if (ids.length === 0) {
        return res.redirect(`/admin/payroll?periode=${periode}&error=no_selection`);
      }

      await client.query('BEGIN');

      // Map untuk melacak pinjaman yang perlu dicek status lunas
      const pinjamanIds = new Set();

      for (const cicilanId of ids) {
        const cicilan = await CicilanModel.markPaid(client, cicilanId, adminId);
        if (cicilan) pinjamanIds.add(cicilan.pinjaman_id);
      }

      // Cek apakah masing-masing pinjaman sudah lunas
      for (const pinjamanId of pinjamanIds) {
        const sisa = await CicilanModel.getSisaPokok(client, pinjamanId);
        if (sisa === 0) {
          await PinjamanModel.markLunas(client, pinjamanId);
        }
      }

      await client.query('COMMIT');
      res.redirect(`/admin/payroll?periode=${periode}&success=rekonsiliasi_ok`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('konfirmasiPelunasan error:', err);
      res.redirect(`/admin/payroll?periode=${periode}&error=server`);
    } finally {
      client.release();
    }
  },

  // ─── Admin: Export Excel ─────────────────────────────────────────
  exportExcel: async (req, res) => {
    const periode = req.query.periode || new Date().toISOString().slice(0, 7);
    try {
      const tagihan = await CicilanModel.findByPeriode(periode);

      const workbook  = new ExcelJS.Workbook();
      workbook.creator = 'Koperasi Pegawai BKN Kanreg V Jakarta';

      const sheet = workbook.addWorksheet(`Tagihan ${periode}`);

      // Header instansi
      sheet.mergeCells('A1:H1');
      sheet.getCell('A1').value = 'KOPERASI PEGAWAI BKN KANREG V JAKARTA';
      sheet.getCell('A1').font  = { bold: true, size: 14 };
      sheet.getCell('A1').alignment = { horizontal: 'center' };

      sheet.mergeCells('A2:H2');
      sheet.getCell('A2').value = `DAFTAR POTONGAN GAJI BULAN ${formatPeriodeLabel(periode)}`;
      sheet.getCell('A2').font  = { bold: true, size: 11 };
      sheet.getCell('A2').alignment = { horizontal: 'center' };

      sheet.addRow([]);

      // Kolom header tabel
      const headerRow = sheet.addRow([
        'No', 'NIP', 'Nama Pegawai', 'Jabatan',
        'Angsuran Pokok (Rp)', 'Bunga (Rp)', 'Total Potongan (Rp)', 'Status'
      ]);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      };
      headerRow.alignment = { horizontal: 'center' };

      // Set column widths
      sheet.columns = [
        { key: 'no',     width: 5  },
        { key: 'nip',    width: 22 },
        { key: 'nama',   width: 28 },
        { key: 'jabatan',width: 30 },
        { key: 'pokok',  width: 22 },
        { key: 'bunga',  width: 18 },
        { key: 'total',  width: 22 },
        { key: 'status', width: 18 },
      ];

      let no = 1;
      let grandTotal = 0;
      tagihan.forEach(t => {
        const row = sheet.addRow([
          no++,
          t.nip,
          t.nama,
          t.jabatan,
          parseFloat(t.pokok_angsuran),
          parseFloat(t.bunga_angsuran),
          parseFloat(t.total_angsuran),
          t.status_potong === 'SUDAH_DIPOTONG' ? 'Sudah Dipotong' : 'Belum Dipotong',
        ]);
        // Format angka sebagai currency
        ['E', 'F', 'G'].forEach(col => {
          const cell = row.getCell(col);
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right' };
        });
        // Warna status
        const statusCell = row.getCell('H');
        statusCell.alignment = { horizontal: 'center' };
        if (t.status_potong === 'SUDAH_DIPOTONG') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          statusCell.font = { color: { argb: 'FF065F46' } };
        } else {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          statusCell.font = { color: { argb: 'FF92400E' } };
        }

        grandTotal += parseFloat(t.total_angsuran);
      });

      // Row total
      sheet.addRow([]);
      const totalRow = sheet.addRow(['', '', '', 'TOTAL', '', '', grandTotal, '']);
      totalRow.font = { bold: true };
      totalRow.getCell('G').numFmt = '#,##0';
      totalRow.getCell('G').alignment = { horizontal: 'right' };

      // Footer tanda tangan
      sheet.addRow([]);
      sheet.addRow([]);
      sheet.addRow(['', '', '', '', '', '', `Jakarta, ${formatTanggal(new Date())}`, '']);
      sheet.addRow(['', '', '', '', '', '', 'Ketua Koperasi,', '']);
      sheet.addRow([]);
      sheet.addRow([]);
      sheet.addRow(['', '', '', '', '', '', '(................................)', '']);
      sheet.addRow(['', '', '', '', '', '', 'NIP.', '']);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Tagihan_Gaji_${periode}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('exportExcel error:', err);
      res.status(500).send('Gagal mengekspor Excel.');
    }
  },

  // ─── Admin: Tampilan Cetak PDF ────────────────────────────────────
  printPDF: async (req, res) => {
    const periode = req.query.periode || new Date().toISOString().slice(0, 7);
    try {
      const tagihan = await CicilanModel.findByPeriode(periode);
      const totalTagihan = tagihan.reduce((s, r) => s + parseFloat(r.total_angsuran), 0);
      res.render('admin/print-tagihan', {
        title: `Rekap Tagihan ${periode}`,
        tagihan,
        periode,
        periodeLabel: formatPeriodeLabel(periode),
        totalTagihan: Math.round(totalTagihan),
        tanggalCetak: formatTanggal(new Date()),
        formatRp,
      });
    } catch (err) {
      console.error('printPDF error:', err);
      res.status(500).send('Server Error');
    }
  },
};

// ─── Helpers ────────────────────────────────────────────────────────
function formatPeriodeLabel(periodeStr) {
  const [y, m] = periodeStr.split('-');
  const months = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI',
                  'JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function formatTanggal(d) {
  const months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

module.exports = PayrollController;
