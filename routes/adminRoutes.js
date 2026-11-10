const express   = require('express');
const router    = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const PinjamanController = require('../controllers/pinjamanController');
const PayrollController  = require('../controllers/payrollController');
const AnggotaController  = require('../controllers/anggotaController');
const SimpananController = require('../controllers/simpananController');
const LaporanController  = require('../controllers/laporanController');
const ShuController      = require('../controllers/shuController');
const AuditController    = require('../controllers/auditController');
const PensiunController  = require('../controllers/pensiunController');

// ─── Admin: Dashboard ───────────────────────────────────────────
router.get('/admin/dashboard', isAuthenticated, isAdmin, PinjamanController.adminDashboard);

// ─── 1 & 2. Data Anggota & Tambah Anggota ──────────────────────
router.get('/admin/anggota',           isAuthenticated, isAdmin, AnggotaController.listAnggota);
router.get('/admin/anggota/tambah',    isAuthenticated, isAdmin, AnggotaController.formTambahAnggota);
router.get('/admin/anggota/edit/:id',  isAuthenticated, isAdmin, AnggotaController.formEditAnggota);
router.get('/admin/anggota/cari',      isAuthenticated, isAdmin, AnggotaController.apiCariAnggota);
router.post('/admin/anggota/simpan',   isAuthenticated, isAdmin, AnggotaController.saveAnggota);
router.post('/admin/anggota/hapus/:id',isAuthenticated, isAdmin, AnggotaController.deleteAnggota);

// ─── 3. Data Simpanan (Pokok, Wajib, Sukarela, Total) & Kwitansi ─
router.get('/admin/simpanan',                         isAuthenticated, isAdmin, SimpananController.listSimpanan);
router.get('/admin/simpanan/anggota/:userId',          isAuthenticated, isAdmin, SimpananController.detailSimpananAnggota);
router.post('/admin/simpanan/transaksi',              isAuthenticated, isAdmin, SimpananController.simpanTransaksi);
router.post('/admin/simpanan/transaksi/hapus/:id',    isAuthenticated, isAdmin, SimpananController.hapusTransaksi);
router.get('/admin/simpanan/transaksi/:id/kwitansi',  isAuthenticated, isAdmin, SimpananController.cetakKwitansiSimpanan);

// ─── 3b. Dana Pensiun & Tutup Keanggotaan ───────────────────────
router.get('/admin/pensiun',               isAuthenticated, isAdmin, PensiunController.listPensiun);
router.get('/admin/pensiun/proses/:userId', isAuthenticated, isAdmin, PensiunController.showFormPensiun);
router.post('/admin/pensiun/proses',       isAuthenticated, isAdmin, PensiunController.postProsesPensiun);
router.get('/admin/pensiun/bukti/:id',     isAuthenticated, isAdmin, PensiunController.cetakBuktiPensiun);

// ─── 4. Data Pinjaman (Pinjaman + Bunga + Tenor + Angsuran Otomatis)
router.get('/admin/pinjaman',           isAuthenticated, isAdmin, PinjamanController.adminDataPinjaman);
router.get('/admin/pinjaman/baru',      isAuthenticated, isAdmin, PinjamanController.adminFormCreatePinjaman);
router.post('/admin/pinjaman/buat',     isAuthenticated, isAdmin, PinjamanController.adminDirectCreatePinjaman);
router.post('/admin/pinjaman/hapus/:id',isAuthenticated, isAdmin, PinjamanController.adminDeletePinjaman);

// Admin: Cetak Formulir Permohonan, Bukti Pencairan & Surat Keterangan Lunas (SKL)
router.get('/admin/pinjaman/:id/formulir',     isAuthenticated, isAdmin, PinjamanController.cetakFormulirPinjaman);
router.get('/admin/pinjaman/:id/bukti-cair',   isAuthenticated, isAdmin, PinjamanController.cetakBuktiPencairan);
router.get('/admin/pinjaman/:id/surat-lunas',  isAuthenticated, isAdmin, PinjamanController.cetakSuratLunas);
router.post('/admin/pinjaman/:id/pelunasan-cepat', isAuthenticated, isAdmin, PinjamanController.pelunasanCepat);

// Admin: Daftar & detail pengajuan pinjaman online
router.get('/admin/pengajuan',       isAuthenticated, isAdmin, PinjamanController.adminListPengajuan);
router.get('/admin/pengajuan/:id',   isAuthenticated, isAdmin, PinjamanController.adminDetailPengajuan);
router.post('/admin/pengajuan/:id/approve', isAuthenticated, isAdmin, PinjamanController.approvePengajuan);
router.post('/admin/pengajuan/:id/reject',  isAuthenticated, isAdmin, PinjamanController.rejectPengajuan);

// Admin: Tagihan Payroll Potongan Gaji
router.get('/admin/payroll',  isAuthenticated, isAdmin, PayrollController.showTagihan);
router.post('/admin/payroll/konfirmasi', isAuthenticated, isAdmin, PayrollController.konfirmasiPelunasan);
router.get('/admin/payroll/export-excel', isAuthenticated, isAdmin, PayrollController.exportExcel);
router.get('/admin/payroll/print',        isAuthenticated, isAdmin, PayrollController.printPDF);

// Admin: Laporan Keuangan
router.get('/admin/laporan',              isAuthenticated, isAdmin, LaporanController.showLaporanKeuangan);
router.get('/admin/laporan/export-excel', isAuthenticated, isAdmin, LaporanController.exportExcel);
router.get('/admin/laporan/print',        isAuthenticated, isAdmin, LaporanController.printLaporan);

// Admin: Modul SHU (Sisa Hasil Usaha)
router.get('/admin/shu',              isAuthenticated, isAdmin, ShuController.showSHU);
router.get('/admin/shu/print',        isAuthenticated, isAdmin, ShuController.printSHU);
router.get('/admin/shu/export-excel', isAuthenticated, isAdmin, ShuController.exportExcel);

// Admin: Audit Log & Backup Database
router.get('/admin/audit-logs',       isAuthenticated, isAdmin, AuditController.listAuditLogs);
router.get('/admin/backup/download',  isAuthenticated, isAdmin, AuditController.downloadBackup);

module.exports = router;
