// main.js — Global UI interactions for Koperasi BKN

// ─── Rupiah Number Formatting & Terbilang Helpers ─────────────
function formatRibuan(angka) {
  if (!angka && angka !== 0) return '';
  const clean = String(angka).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('id-ID').format(clean);
}

function terbilangRupiahSederhana(nominal) {
  const bilangan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];
  const n = Math.floor(Math.abs(Number(nominal) || 0));
  if (n === 0) return 'Nol Rupiah';

  function hitung(angka) {
    if (angka < 12) return bilangan[angka];
    if (angka < 20) return hitung(angka - 10) + ' Belas';
    if (angka < 100) return hitung(Math.floor(angka / 10)) + ' Puluh ' + hitung(angka % 10);
    if (angka < 200) return 'Seratus ' + hitung(angka - 100);
    if (angka < 1000) return hitung(Math.floor(angka / 100)) + ' Ratus ' + hitung(angka % 100);
    if (angka < 2000) return 'Seribu ' + hitung(angka - 1000);
    if (angka < 1000000) return hitung(Math.floor(angka / 1000)) + ' Ribu ' + hitung(angka % 1000);
    if (angka < 1000000000) return hitung(Math.floor(angka / 1000000)) + ' Juta ' + hitung(angka % 1000000);
    if (angka < 1000000000000) return hitung(Math.floor(angka / 1000000000)) + ' Miliar ' + hitung(angka % 1000000000);
    if (angka < 1000000000000000) return hitung(Math.floor(angka / 1000000000000)) + ' Triliun ' + hitung(angka % 1000000000000);
    return 'Jumlah Sangat Besar';
  }

  return hitung(n).replace(/\s+/g, ' ').trim() + ' Rupiah';
}

function initInputRupiah() {
  // Selector target seluruh input uang rupiah
  const selector = '.input-rupiah, [data-type="rupiah"], input[name="plafon"], input[name="nominal_pengajuan"], input[name="nominal"], input[name="gaji_bersih"], input[name="biaya_admin_nominal"]';
  const inputs = document.querySelectorAll(selector);

  inputs.forEach((input) => {
    // Ubah type="number" menjadi type="text" agar mendukung pemisah ribuan titik (.)
    if (input.type === 'number') {
      input.type = 'text';
    }
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');

    // Buat atau temukan elemen badge live preview rupiah
    const container = input.closest('.form-group') || input.parentElement;
    let badge = container ? container.querySelector('.rupiah-live-badge') : null;
    
    if (!badge && container) {
      badge = document.createElement('div');
      badge.className = 'rupiah-live-badge';
      badge.style.display = 'none';

      // Selipkan setelah input-wrapper atau input
      const wrapper = input.closest('.input-wrapper') || input;
      if (wrapper.nextSibling) {
        wrapper.parentNode.insertBefore(badge, wrapper.nextSibling);
      } else {
        wrapper.parentNode.appendChild(badge);
      }
    }

    function updateFormatting(isInitial = false) {
      const start = input.selectionStart;
      const oldLen = input.value.length;
      let val = input.value;

      // Jika saat load awal nilai mengandung pecahan desimal JavaScript (misal 1532222.222)
      if (isInitial && val && typeof val === 'string' && val.includes('.') && !val.includes(',')) {
        const floatVal = parseFloat(val);
        if (!isNaN(floatVal)) {
          val = String(Math.round(floatVal));
        }
      }

      const raw = val.replace(/[^0-9]/g, '');

      if (raw) {
        const formatted = formatRibuan(raw);
        input.value = formatted;

        // Pertahankan kursor
        const newLen = formatted.length;
        const newPos = Math.max(0, start + (newLen - oldLen));
        if (input === document.activeElement) {
          input.setSelectionRange(newPos, newPos);
        }

        if (badge) {
          const num = parseInt(raw, 10);
          badge.innerHTML = `<i class="bi bi-cash-stack"></i> <span class="rupiah-badge-nominal">Rp ${formatted}</span> <span class="rupiah-badge-dot">&bull;</span> <span class="rupiah-badge-terbilang">${terbilangRupiahSederhana(num)}</span>`;
          badge.style.display = 'inline-flex';
        }
      } else {
        input.value = '';
        if (badge) badge.style.display = 'none';
      }
    }

    // Format nilai awal saat load
    if (input.value) {
      updateFormatting(true);
    }

    // Pasang listener input
    input.addEventListener('input', updateFormatting);

    // Saat form di-submit, bersihkan titik agar server menerima angka bersih
    const form = input.closest('form');
    if (form && !form.dataset.rupiahBound) {
      form.dataset.rupiahBound = 'true';
      form.addEventListener('submit', function () {
        form.querySelectorAll(selector).forEach((inp) => {
          inp.value = inp.value.replace(/[^0-9]/g, '');
        });
      });
    }
  });
}

// ─── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Inisialisasi otomatis pemformat rupiah
  initInputRupiah();

  // ─── Auto-dismiss alerts ──────────────────────────────────────
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach((alert) => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      alert.style.opacity    = '0';
      alert.style.transform  = 'translateY(-8px)';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });

  // ─── Number formatting display ──────────────────────────────
  document.querySelectorAll('[data-format-rp]').forEach((el) => {
    const val = parseFloat(el.dataset.formatRp);
    if (!isNaN(val)) {
      el.textContent = new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0
      }).format(val);
    }
  });

  // ─── Input number: format on blur ──────────────────────────
  document.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  });

  // ─── Active nav link highlight ─────────────────────────────
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && href !== '#' && currentPath.startsWith(href)) {
      link.classList.add('active');
    }
  });
});
