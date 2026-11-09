/**
 * controllers/anggotaController.js
 * Manajemen Data Anggota Koperasi BKN Kanreg V Jakarta
 * Sesuai spesifikasi: Tambah Anggota (input NIK, Cari, Simpan, Hapus, Selesai)
 * & Data Anggota (Nama, NIP, Unit Kerja, Alamat, No HP, Tambah, Edit, Hapus, Gaji Bersih)
 */
const pool   = require('../config/database');
const bcrypt = require('bcryptjs');
const { logAuditReq } = require('../utils/auditLogger');

module.exports = {
  // ─── 1. Daftar Data Anggota ────────────────────────────────────
  listAnggota: async (req, res) => {
    try {
      const q = req.query.q ? req.query.q.trim() : '';
      let sql = `
        SELECT u.id, u.nip, u.nik, u.nama, u.unit_kerja, u.jabatan, u.alamat, u.no_hp, u.email, u.gaji_bersih, u.status_keanggotaan, u.created_at,
               (SELECT COUNT(*) FROM pengajuan_pinjaman p WHERE p.user_id = u.id AND p.status = 'APPROVED') as active_loans_count
        FROM users u
        WHERE u.role = 'user'
      `;
      const params = [];

      if (q) {
        sql += ` AND (u.nama ILIKE $1 OR u.nip ILIKE $1 OR u.jabatan ILIKE $1 OR u.unit_kerja ILIKE $1)`;
        params.push(`%${q}%`);
      }

      sql += ` ORDER BY u.nama ASC`;

      const { rows: anggota } = await pool.query(sql, params);

      res.render('admin/list-anggota', {
        title: 'Data Anggota — Koperasi BKN Kanreg V',
        anggota,
        q,
        success: req.query.success || null,
        error: req.query.error || null,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/anggota',
      });
    } catch (err) {
      console.error('Error listAnggota:', err);
      res.status(500).render('errors/500', { title: 'Terjadi Kesalahan', message: err.message, user: req.session.user, isAdmin: true, currentPath: '/admin/anggota' });
    }
  },

  // ─── 2. Form Tambah Anggota ────────────────────────────────────
  formTambahAnggota: (req, res) => {
    res.render('admin/form-anggota', {
      title: 'Tambah Anggota Baru — Koperasi BKN Kanreg V',
      anggota: null,
      error: null,
      user: req.session.user,
      isAdmin: true,
      currentPath: '/admin/anggota',
    });
  },

  // ─── 3. Form Edit Anggota ──────────────────────────────────────
  formEditAnggota: async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT u.id, u.nip, u.nik, u.nama, u.unit_kerja, u.jabatan, u.alamat, u.no_hp, u.email, u.gaji_bersih,
                u.skema_simpanan_pokok, u.tenor_simpanan_pokok, u.nominal_cicilan_pokok,
                COALESCE((SELECT SUM(CASE WHEN tipe_transaksi='setor' THEN nominal ELSE -nominal END) 
                          FROM transaksi_simpanan WHERE user_id = u.id AND jenis_simpanan = 'pokok'), 0) AS total_pokok_terbayar
         FROM users u WHERE u.id = $1 AND u.role = $2`,
        [id, 'user']
      );

      if (rows.length === 0) {
        return res.redirect('/admin/anggota?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
      }

      res.render('admin/form-anggota', {
        title: `Edit Anggota — ${rows[0].nama}`,
        anggota: rows[0],
        error: null,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/anggota',
      });
    } catch (err) {
      console.error('Error formEditAnggota:', err);
      res.redirect('/admin/anggota?error=' + encodeURIComponent(err.message));
    }
  },

  // ─── 4. API Cari Anggota by NIP / NIK (AJAX untuk tombol Cari) ──
  apiCariAnggota: async (req, res) => {
    try {
      const { nip, nik } = req.query;
      let query = '';
      let param = '';

      if (nip) {
        query = 'SELECT id, nip, nik, nama, unit_kerja, jabatan, alamat, no_hp, email, gaji_bersih, skema_simpanan_pokok, tenor_simpanan_pokok FROM users WHERE nip = $1 LIMIT 1';
        param = nip.trim();
      } else if (nik) {
        query = 'SELECT id, nip, nik, nama, unit_kerja, jabatan, alamat, no_hp, email, gaji_bersih, skema_simpanan_pokok, tenor_simpanan_pokok FROM users WHERE nik = $1 LIMIT 1';
        param = nik.trim();
      } else {
        return res.json({ success: false, message: 'Masukkan NIP untuk pencarian' });
      }

      const { rows } = await pool.query(query, [param]);
      if (rows.length > 0) {
        return res.json({ success: true, exists: true, data: rows[0] });
      } else {
        return res.json({ success: true, exists: false, message: 'Data belum terdaftar, Anda dapat mengisi data baru.' });
      }
    } catch (err) {
      console.error('Error apiCariAnggota:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // ─── 5. Simpan Anggota (Insert / Update) ────────────────────────
  saveAnggota: async (req, res) => {
    try {
      const { 
        id, nik, nip, nama, unit_kerja, jabatan, alamat, no_hp, email, password, gaji_bersih,
        skema_simpanan_pokok, tenor_simpanan_pokok, setor_pokok_sekarang, nominal_setor_sekarang
      } = req.body;

      if (!nama || !nip) {
        return res.render('admin/form-anggota', {
          title: id ? 'Edit Anggota' : 'Tambah Anggota Baru',
          anggota: req.body,
          error: 'Nama dan NIP wajib diisi.',
          user: req.session.user,
          isAdmin: true,
          currentPath: '/admin/anggota',
        });
      }

      const cleanGaji = typeof gaji_bersih === 'string' ? gaji_bersih.replace(/[^0-9]/g, '') : gaji_bersih;
      const parsedGaji = cleanGaji ? parseFloat(cleanGaji) : 6500000;

      // Konfigurasi simpanan pokok: Rp 1.005.000 (1x di awal, bisa dicicil s/d 12 bulan)
      const TOTAL_SIMPANAN_POKOK = 1005000;
      const skemaPokok = skema_simpanan_pokok === 'cicil' ? 'cicil' : 'lunas';
      let tenorPokok = parseInt(tenor_simpanan_pokok) || (skemaPokok === 'cicil' ? 12 : 1);
      if (tenorPokok < 1) tenorPokok = 1;
      if (tenorPokok > 12) tenorPokok = 12;
      const nominalCicilanPokok = skemaPokok === 'cicil' ? Math.round(TOTAL_SIMPANAN_POKOK / tenorPokok) : 0;

      if (id) {
        // Mode Update
        // Cek duplikasi NIP / NIK pada user lain
        const { rows: dupNip } = await pool.query('SELECT id FROM users WHERE nip = $1 AND id != $2', [nip.trim(), id]);
        if (dupNip.length > 0) {
          return res.render('admin/form-anggota', {
            title: 'Edit Anggota',
            anggota: req.body,
            error: 'NIP sudah digunakan oleh anggota lain.',
            user: req.session.user,
            isAdmin: true,
            currentPath: '/admin/anggota',
          });
        }

        if (nik && nik.trim()) {
          const { rows: dupNik } = await pool.query('SELECT id FROM users WHERE nik = $1 AND id != $2', [nik.trim(), id]);
          if (dupNik.length > 0) {
            return res.render('admin/form-anggota', {
              title: 'Edit Anggota',
              anggota: req.body,
              error: 'NIK sudah digunakan oleh anggota lain.',
              user: req.session.user,
              isAdmin: true,
              currentPath: '/admin/anggota',
            });
          }
        }

        let updateSql = `
          UPDATE users SET
            nik = $1,
            nip = $2,
            nama = $3,
            unit_kerja = $4,
            jabatan = $5,
            alamat = $6,
            no_hp = $7,
            email = $8,
            gaji_bersih = $9,
            skema_simpanan_pokok = $10,
            tenor_simpanan_pokok = $11,
            nominal_cicilan_pokok = $12
        `;
        const params = [
          nik ? nik.trim() : null,
          nip.trim(),
          nama.trim(),
          unit_kerja ? unit_kerja.trim() : null,
          jabatan ? jabatan.trim() : 'Pegawai',
          alamat ? alamat.trim() : null,
          no_hp ? no_hp.trim() : null,
          email && email.trim() ? email.trim() : `${nip.trim()}@koperasi-bkn.go.id`,
          parsedGaji,
          skemaPokok,
          tenorPokok,
          nominalCicilanPokok,
        ];

        if (password && password.trim()) {
          const hash = await bcrypt.hash(password.trim(), 12);
          updateSql += `, password_hash = $13 WHERE id = $14`;
          params.push(hash, id);
        } else {
          updateSql += ` WHERE id = $13`;
          params.push(id);
        }

        await pool.query(updateSql, params);
        await logAuditReq(req, 'MEMBER_UPDATE', 'USERS', id, `Memperbarui data anggota ${nama.trim()} (NIP: ${nip.trim()})`);
        return res.redirect('/admin/anggota?success=' + encodeURIComponent('Data anggota berhasil diperbarui.'));

      } else {
        // Mode Insert Baru
        // Cek apakah NIP sudah ada
        const { rows: dupNip } = await pool.query('SELECT id FROM users WHERE nip = $1', [nip.trim()]);
        if (dupNip.length > 0) {
          return res.render('admin/form-anggota', {
            title: 'Tambah Anggota Baru',
            anggota: req.body,
            error: 'NIP sudah terdaftar dalam sistem.',
            user: req.session.user,
            isAdmin: true,
            currentPath: '/admin/anggota',
          });
        }

        if (nik && nik.trim()) {
          const { rows: dupNik } = await pool.query('SELECT id FROM users WHERE nik = $1', [nik.trim()]);
          if (dupNik.length > 0) {
            return res.render('admin/form-anggota', {
              title: 'Tambah Anggota Baru',
              anggota: req.body,
              error: 'NIK sudah terdaftar dalam sistem.',
              user: req.session.user,
              isAdmin: true,
              currentPath: '/admin/anggota',
            });
          }
        }

        const rawPassword = (password && password.trim()) ? password.trim() : 'pegawai123';
        const passwordHash = await bcrypt.hash(rawPassword, 12);
        const finalEmail = (email && email.trim()) ? email.trim() : `${nip.trim()}@koperasi-bkn.go.id`;

        const insertSql = `
          INSERT INTO users (
            nik, nip, nama, unit_kerja, jabatan, alamat, no_hp, email, password_hash, role, gaji_bersih,
            skema_simpanan_pokok, tenor_simpanan_pokok, nominal_cicilan_pokok
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', $10, $11, $12, $13)
          RETURNING id
        `;
        const { rows: newUser } = await pool.query(insertSql, [
          nik ? nik.trim() : null,
          nip.trim(),
          nama.trim(),
          unit_kerja ? unit_kerja.trim() : null,
          jabatan ? jabatan.trim() : 'Pegawai',
          alamat ? alamat.trim() : null,
          no_hp ? no_hp.trim() : null,
          finalEmail,
          passwordHash,
          parsedGaji,
          skemaPokok,
          tenorPokok,
          nominalCicilanPokok,
        ]);

        const newId = newUser[0].id;

        // Proses setoran awal simpanan pokok saat pendaftaran jika dicentang atau diisi
        const shouldSetorPokok = setor_pokok_sekarang === '1' || setor_pokok_sekarang === 'on' || Boolean(req.body.setoran_pokok_awal);
        if (shouldSetorPokok) {
          let nominalSetorAwal = 0;
          if (nominal_setor_sekarang) {
            const cleanNominal = String(nominal_setor_sekarang).replace(/[^0-9]/g, '');
            nominalSetorAwal = parseFloat(cleanNominal) || 0;
          } else if (req.body.setoran_pokok_awal) {
            nominalSetorAwal = parseFloat(String(req.body.setoran_pokok_awal).replace(/[^0-9]/g, '')) || 0;
          } else {
            nominalSetorAwal = skemaPokok === 'lunas' ? TOTAL_SIMPANAN_POKOK : nominalCicilanPokok;
          }

          if (nominalSetorAwal > 0) {
            const ketSetoran = skemaPokok === 'lunas'
              ? 'Setoran Lunas Simpanan Pokok Pendaftaran Anggota (Rp 1.005.000)'
              : `Setoran Cicilan Simpanan Pokok Bulan ke-1 (Tenor ${tenorPokok} Bulan)`;

            await pool.query(`
              INSERT INTO transaksi_simpanan (user_id, jenis_simpanan, tipe_transaksi, nominal, tanggal, keterangan, admin_id)
              VALUES ($1, 'pokok', 'setor', $2, CURRENT_DATE, $3, $4)
            `, [newId, nominalSetorAwal, ketSetoran, req.session.userId || req.session.user?.id || null]);
          }
        }

        await logAuditReq(req, 'MEMBER_ADD', 'USERS', newId, `Mendaftarkan anggota baru ${nama.trim()} (NIP: ${nip.trim()}) dengan skema simpanan pokok: ${skemaPokok} (${skemaPokok === 'cicil' ? tenorPokok + ' bulan' : '1x lunas'})`);
        return res.redirect('/admin/anggota?success=' + encodeURIComponent('Anggota baru berhasil ditambahkan!'));
      }
    } catch (err) {
      console.error('Error saveAnggota:', err);
      res.render('admin/form-anggota', {
        title: req.body.id ? 'Edit Anggota' : 'Tambah Anggota Baru',
        anggota: req.body,
        error: 'Terjadi kesalahan sistem: ' + err.message,
        user: req.session.user,
        isAdmin: true,
        currentPath: '/admin/anggota',
      });
    }
  },

  // ─── 6. Hapus Anggota ──────────────────────────────────────────
  deleteAnggota: async (req, res) => {
    try {
      const { id } = req.params;

      // Cek apakah anggota memiliki pinjaman aktif (APPROVED)
      const { rows: activeLoans } = await pool.query(
        "SELECT id, nominal_pengajuan FROM pengajuan_pinjaman WHERE user_id = $1 AND status = 'APPROVED'",
        [id]
      );

      if (activeLoans.length > 0) {
        return res.redirect('/admin/anggota?error=' + encodeURIComponent('Anggota tidak dapat dihapus karena masih memiliki pinjaman aktif! Harap lunasi pinjaman terlebih dahulu.'));
      }

      const { rows: userRow } = await pool.query('SELECT nama, nip FROM users WHERE id = $1', [id]);
      const deletedNama = userRow.length > 0 ? `${userRow[0].nama} (${userRow[0].nip})` : `ID ${id}`;

      await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [id, 'user']);
      await logAuditReq(req, 'MEMBER_DELETE', 'USERS', id, `Menghapus anggota ${deletedNama}`);

      res.redirect('/admin/anggota?success=' + encodeURIComponent('Data anggota berhasil dihapus.'));
    } catch (err) {
      console.error('Error deleteAnggota:', err);
      res.redirect('/admin/anggota?error=' + encodeURIComponent(err.message));
    }
  },
};
