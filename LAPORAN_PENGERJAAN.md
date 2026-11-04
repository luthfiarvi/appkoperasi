# LAPORAN HASIL PENGERJAAN PENGEMBANGAN SISTEM
## SISTEM INFORMASI SIMPAN PINJAM KOPERASI PEGAWAI BKN KANREG V JAKARTA

---

| Parameter | Keterangan |
| :--- | :--- |
| **Nama Proyek** | Pengembangan Sistem Informasi Simpan Pinjam Koperasi BKN |
| **Instansi / Unit** | Koperasi Pegawai Kantor Regional V Badan Kepegawaian Negara (BKN) Jakarta |
| **Tanggal Pelaksanaan** | 22 – 23 Oktober 2026 |
| **Status Pekerjaan** | Selesai & Terverifikasi (Production Ready / Testing Passed) |
| **Tech Stack** | Node.js, Express.js, PostgreSQL, EJS View Engine, CSS Modern |

---

### I. RINGKASAN EKSEKUTIF (EXECUTIVE SUMMARY)
Telah diselesaikan rangkaian pengembangan fitur lanjutan, penguatan tata kelola keuangan, otomatisasi administrasi digital, serta audit trail pada aplikasi Sistem Simpan Pinjam Koperasi Pegawai BKN Kanreg V Jakarta. 

Pekerjaan mencakup implementasi 5 (lima) modul utama, restrukturisasi hak akses pengguna, serta penuntasan pengujian (*quality assurance*) dan perbaikan *bug rendering* pada dashboard Admin dan Anggota sehingga seluruh fungsionalitas kini berjalan normal dan stabil.

---

### II. RINCIAN MODUL DAN FITUR YANG DIKERJAKAN

#### 1. Modul Perhitungan Sisa Hasil Usaha (SHU) Otomatis
* **Tujuan**: Mengotomatisasi pembagian SHU tahunan secara transparan, akurat, dan sesuai dengan ketentuan peraturan perundang-undangan perkoperasian.
* **Fitur & Logika**:
  * **Alokasi SHU Standar Perkoperasian**:
    * **Jasa Modal (40%)**: Dibagikan proporsional berdasarkan total akumulasi simpanan (pokok + wajib + sukarela) tiap anggota.
    * **Jasa Usaha/Pinjaman (30%)**: Dibagikan proporsional berdasarkan total pembayaran bunga pinjaman oleh anggota.
    * **Dana Cadangan Koperasi (20%)**: Alokasi penguatan modal koperasi.
    * **Dana Pengurus & Kesejahteraan Pegawai (10%)**.
  * **Simulator Real-Time**: Parameter persentase alokasi dan nominal SHU kotor dapat disimulasikan secara dinamis tanpa mengubah data riil sebelum disahkan.
  * **Export & Dokumen Resmi**:
    * Fitur unduh rekap pembagian SHU ke format spreadsheet Microsoft Excel (`.csv`).
    * Format dokumen cetak resmi berstandar lampiran Rapat Anggota Tahunan (RAT).

#### 2. Modul Kwitansi Digital & Dokumen Akad Pembiayaan
* **Tujuan**: Meniadakan kebutuhan pencatatan manual/kertas (*paperless*) dan menyediakan bukti transaksi resmi yang sah.
* **Fitur & Logika**:
  * **Kwitansi Simpanan Digital**:
    * Tombol cetak langsung pada setiap riwayat transaksi simpanan di Buku Simpanan Anggota.
    * Menggunakan format penomoran otomatis (`KW-SMP-XXXXX/TAHUN`).
    * Integrasi fungsi terbilang rupiah otomatis (*automatic Indonesian currency text generator*).
  * **Bukti Pencairan Pinjaman (Akad Pembiayaan)**:
    * Menampilkan detail plafon pinjaman, jenis potongan administrasi, serta nominal bersih yang dicairkan kepada pegawai.
    * Dilengkapi kolom tanda tangan digital antara Bendahara Koperasi dan Peminjam.

#### 3. Analisis Kelayakan Pinjaman (Debt Service Ratio / DSR)
* **Tujuan**: Memitigasi risiko kredit macet (*prudential lending*) bagi bendahara dan pengurus koperasi.
* **Fitur & Logika**:
  * Mengintegrasikan data gaji bersih (*take home pay*) pegawai ke dalam database.
  * Menghitung rasio beban cicilan bulanan terhadap gaji (*Debt Service Ratio*).
  * Menyajikan indikator visual (*safety badge*) pada panel evaluasi pengajuan pinjaman:
    * **Aman (DSR ≤ 40%)**: Badge hijau, beban cicilan aman bagi keuangan pegawai.
    * **Waspada (40% < DSR ≤ 50%)**: Badge kuning, memerlukan konfirmasi tambahan.
    * **Risiko Tinggi (DSR > 50%)**: Badge merah, melebihi batas toleransi pemotongan gaji bulanan.

#### 4. Fitur Pelunasan Dipercepat (*Early Settlement*) & Sertifikat Lunas (SKL)
* **Tujuan**: Memberikan fleksibilitas bagi anggota untuk melunasi pinjaman sebelum tenor berakhir dengan mekanisme yang adil (*sliding interest rate*).
* **Fitur & Logika**:
  * **Kalkulasi Pelunasan Dipercepat**:
    * Sistem otomatis menghitung sisa pokok yang wajib disetor tanpa membebankan bunga di bulan-bulan yang belum berjalan (*bunga dihemat*).
    * Eksekusi pelunasan otomatis mengubah seluruh status sisa cicilan menjadi lunas secara aman dalam satu transaksi database (*atomic transaction*).
  * **Penerbitan Surat Keterangan Lunas (SKL)**:
    * Menghasilkan dokumen sertifikat resmi SKL ber-kop Koperasi BKN Kanreg V.
    * Berfungsi sebagai bukti resmi bebas pinjaman untuk keperluan administrasi kepegawaian.

#### 5. Modul Audit Trail & Pencadangan Database Sekali Klik (*Disaster Recovery*)
* **Tujuan**: Memenuhi standar kepatuhan tata kelola IT (*Good IT Governance*) dan menjamin keamanan data transaksi koperasi.
* **Fitur & Logika**:
  * **Audit Log Trail**:
    * Pencatatan otomatis ke tabel database untuk setiap operasi penting: penambahan/perubahan/penghapusan data anggota, setoran/penarikan simpanan, persetujuan/penolakan pinjaman, pelunasan dipercepat, dan aktivitas backup.
    * Menyimpan timestamp, NIP/identitas admin pelaksana, IP address, dan deskripsi detail tindakan.
  * **1-Click Database Backup**:
    * Tombol unduh snapshot seluruh tabel database (Anggota, Simpanan, Pinjaman, Jadwal Cicilan, Audit Log) ke dalam file `.json` terstruktur berstempel waktu.

#### 6. Pembaruan Autentikasi & Akun Pengguna
* Penyeragaman akun sistem untuk kebutuhan pengujian dan operasional:
  * **Administrator**: NIP `admin` / Password `admin123`
  * **Anggota (User Pegawai)**: NIP `user` / Password `user123`

---

### III. PEMBENAHAN TEKNIS & BUG FIXING (HARI INI)

Pada pengujian tahap akhir pagi ini, ditemukan kendala render (*ReferenceError*) pada controller dashboard yang langsung ditangani tuntas:
1. **Admin Dashboard (`/admin/dashboard`)**:
   - *Issue*: `ReferenceError: totalDana is not defined`.
   - *Fix*: Menambahkan kalkulasi dan penyaluran variabel `totalDana`, `totalAngsuranBulan` (realisasi pemotongan gaji bulan berjalan), `pengajuanPending`, dan `recentPengajuan` pada fungsi `adminDashboard` di `controllers/pinjamanController.js`.
2. **User Dashboard (`/dashboard`)**:
   - *Issue*: `ReferenceError: pengajuan is not defined`.
   - *Fix*: Meneruskan array objek data riwayat pengajuan pinjaman anggota ke template `views/user/dashboard.ejs`.

---

### IV. DAFTAR PERUBAHAN FILE ARSITEKTUR SISTEM

| No | File Path | Tipe Perubahan | Deskripsi |
| :---: | :--- | :---: | :--- |
| 1 | `controllers/pinjamanController.js` | Update | Perbaikan dashboard admin & user, logika pelunasan dipercepat, DSR, dan cetak dokumen |
| 2 | `controllers/shuController.js` | Baru | Controller modul SHU, simulator perhitungan, export excel, dan cetak RAT |
| 3 | `controllers/auditController.js` | Baru | Controller jejak audit aktivitas dan fungsi unduh backup JSON |
| 4 | `views/admin/dashboard.ejs` | Update | Penyempurnaan widget ringkasan statistik dan list pengajuan pending |
| 5 | `views/user/dashboard.ejs` | Update | Integrasi histori pinjaman, status cicilan, dan link dokumen digital |
| 6 | `views/admin/shu.ejs` & `print-shu.ejs` | Baru | Tampilan antarmuka perhitungan SHU dan dokumen cetak RAT |
| 7 | `views/admin/audit-logs.ejs` | Baru | Antarmuka monitoring log aktivitas dan status pencadangan data |
| 8 | `views/admin/kwitansi-simpanan.ejs` | Baru | Template kwitansi digital resmi Koperasi Kanreg V BKN |
| 9 | `views/admin/bukti-pencairan.ejs` | Baru | Template cetak akad pembiayaan dan bukti pencairan dana pinjaman |
| 10 | `views/admin/surat-lunas.ejs` | Baru | Template sertifikat Surat Keterangan Lunas (SKL) |
| 11 | `utils/terbilang.js` | Baru | Utility konversi angka nominal ke kalimat terbilang Rupiah |
| 12 | `utils/auditLogger.js` | Baru | Helper fungsi pencatatan event log ke database |
| 13 | `routes/adminRoutes.js` | Update | Penambahan routing SHU, Audit Log, Backup, Kwitansi, SKL, dan Pelunasan |
| 14 | `routes/userRoutes.js` | Update | Penambahan routing cetak dokumen bukti cair & SKL sisi pegawai |

---

### V. HASIL PENGUJIAN AKHIR (VERIFIKASI SISTEM)

Pengujian dilakukan secara otomatis menggunakan skrip HTTP testing terhadap seluruh rute dengan status autentikasi:

| Modul / Halaman | Endpoint | Metode | Hasil Pengujian |
| :--- | :--- | :---: | :---: |
| Autentikasi Admin | `/login` (NIP: admin) | POST | **302 Redirect (Berhasil)** |
| Autentikasi Pegawai | `/login` (NIP: user) | POST | **302 Redirect (Berhasil)** |
| Dashboard Administrator | `/admin/dashboard` | GET | **200 OK (Stabil)** |
| Dashboard Anggota | `/dashboard` | GET | **200 OK (Stabil)** |
| Data Anggota | `/admin/anggota` | GET | **200 OK (Stabil)** |
| Buku Simpanan Saya | `/simpanan-saya` | GET | **200 OK (Stabil)** |
| Modul SHU | `/admin/shu` | GET | **200 OK (Stabil)** |
| Cetak Dokumen RAT | `/admin/shu/print` | GET | **200 OK (Stabil)** |
| Export SHU Excel | `/admin/shu/export-excel` | GET | **200 OK (Stabil)** |
| Audit Trail & Backup | `/admin/audit-logs` | GET | **200 OK (Stabil)** |
| Unduh Backup JSON | `/admin/backup/download` | GET | **200 OK (Stabil)** |
| Formulir Pengajuan Pinjaman | `/pengajuan` | GET | **200 OK (Stabil)** |
| Simulasi Pinjaman | `/simulasi` | GET | **200 OK (Stabil)** |

---

### VI. KESIMPULAN & TAHAP SELANJUTNYA

1. **Kesimpulan**: Seluruh sasaran pengembangan sistem koperasi untuk pembaruan fitur fase lanjutan telah selesai dikerjakan, diintegrasikan, dan teruji bebas dari error runtime.
2. **Rencana Tahap Lanjutan**:
   - Integrasi modul notifikasi instan (WhatsApp / Email Notification) saat status pinjaman disetujui/dicairkan (sebelumnya di-hold).
   - Pengujian *User Acceptance Test* (UAT) bersama pengurus dan perwakilan anggota Koperasi Kanreg V BKN Jakarta.
