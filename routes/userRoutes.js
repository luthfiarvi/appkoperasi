const express   = require('express');
const router    = express.Router();
const { isAuthenticated, isUser } = require('../middleware/auth');
const PinjamanController = require('../controllers/pinjamanController');
const SimpananController = require('../controllers/simpananController');
const PensiunController  = require('../controllers/pensiunController');

// Dashboard user
router.get('/dashboard', isAuthenticated, isUser, PinjamanController.userDashboard);

// Simpanan saya & Kwitansi
router.get('/simpanan-saya', isAuthenticated, isUser, SimpananController.simpananSaya);
router.get('/simpanan/transaksi/:id/kwitansi', isAuthenticated, isUser, SimpananController.cetakKwitansiSimpanan);

// Simulasi pinjaman
router.get('/simulasi',  isAuthenticated, isUser, PinjamanController.showSimulasi);
router.post('/simulasi', isAuthenticated, isUser, PinjamanController.postSimulasi);

// Pengajuan pinjaman
router.get('/pengajuan',  isAuthenticated, isUser, PinjamanController.showFormPengajuan);
router.post('/pengajuan', isAuthenticated, isUser, PinjamanController.submitPengajuan);

// Dokumen Digital User: Bukti Pencairan & Surat Lunas (SKL) & Bukti Pensiun
router.get('/pinjaman/:id/bukti-cair',  isAuthenticated, isUser, PinjamanController.cetakBuktiPencairan);
router.get('/pinjaman/:id/surat-lunas', isAuthenticated, isUser, PinjamanController.cetakSuratLunas);
router.get('/pensiun/bukti/:id',        isAuthenticated, isUser, PensiunController.cetakBuktiPensiun);

module.exports = router;
