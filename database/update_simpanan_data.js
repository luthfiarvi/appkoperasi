const pool = require('../config/database');

async function updateData() {
  try {
    console.log('Mengupdate data transaksi simpanan sesuai revisi:');
    console.log('- Simpanan Pokok: Rp 1.005.000 (1x di awal)');
    console.log('- Simpanan Wajib: Rp 100.000 / bulan');

    // 1. Update Simpanan Pokok Budi Santoso (user login) menjadi Rp 1.005.000
    await pool.query(`
      UPDATE transaksi_simpanan
      SET nominal = 1005000, keterangan = 'Setoran Lunas Simpanan Pokok Awal Keanggotaan (Rp 1.005.000)'
      WHERE user_id = 2 AND jenis_simpanan = 'pokok';
    `);

    // Update preferensi user Budi Santoso
    await pool.query(`
      UPDATE users
      SET skema_simpanan_pokok = 'lunas', tenor_simpanan_pokok = 1, nominal_cicilan_pokok = 0
      WHERE id = 2;
    `);

    // 2. Update Simpanan Wajib (semua setoran wajib yang sebelumnya 50.000 diubah menjadi 100.000)
    await pool.query(`
      UPDATE transaksi_simpanan
      SET nominal = 100000
      WHERE jenis_simpanan = 'wajib' AND nominal = 50000;
    `);

    // 3. Untuk user 3 (Siti Rahayu) atau user 5 (user2), kita buat contoh skema cicilan pokok 12 bulan
    // Simpanan pokok cicilan ke-1: Rp 83.750
    await pool.query(`
      UPDATE users
      SET skema_simpanan_pokok = 'cicil', tenor_simpanan_pokok = 12, nominal_cicilan_pokok = 83750
      WHERE id = 5;
    `);

    await pool.query(`
      UPDATE transaksi_simpanan
      SET nominal = 83750, keterangan = 'Setoran Cicilan Simpanan Pokok Bulan ke-1 (Tenor 12 Bulan)'
      WHERE user_id = 5 AND jenis_simpanan = 'pokok';
    `);

    console.log('✅ Data berhasil diperbarui!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal memperbarui data:', err);
    process.exit(1);
  }
}

updateData();
