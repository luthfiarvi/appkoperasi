/**
 * utils/terbilang.js
 * Konversi angka rupiah ke teks bahasa Indonesia (Terbilang)
 * Contoh: 1500000 -> "Satu Juta Lima Ratus Ribu Rupiah"
 */

function terbilangAngka(angka) {
  const bilangan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];

  angka = Math.floor(Math.abs(Number(angka) || 0));

  if (angka < 12) {
    return bilangan[angka];
  } else if (angka < 20) {
    return terbilangAngka(angka - 10) + ' Belas';
  } else if (angka < 100) {
    return terbilangAngka(Math.floor(angka / 10)) + ' Puluh ' + terbilangAngka(angka % 10);
  } else if (angka < 200) {
    return 'Seratus ' + terbilangAngka(angka - 100);
  } else if (angka < 1000) {
    return terbilangAngka(Math.floor(angka / 100)) + ' Ratus ' + terbilangAngka(angka % 100);
  } else if (angka < 2000) {
    return 'Seribu ' + terbilangAngka(angka - 1000);
  } else if (angka < 1000000) {
    return terbilangAngka(Math.floor(angka / 1000)) + ' Ribu ' + terbilangAngka(angka % 1000);
  } else if (angka < 1000000000) {
    return terbilangAngka(Math.floor(angka / 1000000)) + ' Juta ' + terbilangAngka(angka % 1000000);
  } else if (angka < 1000000000000) {
    return terbilangAngka(Math.floor(angka / 1000000000)) + ' Miliar ' + terbilangAngka(angka % 1000000000);
  } else {
    return 'Jumlah Terlalu Besar';
  }
}

function terbilangRupiah(nominal) {
  const n = Math.floor(Math.abs(Number(nominal) || 0));
  if (n === 0) return 'Nol Rupiah';
  const hasil = terbilangAngka(n).replace(/\s+/g, ' ').trim();
  return hasil + ' Rupiah';
}

module.exports = {
  terbilangAngka,
  terbilangRupiah
};
