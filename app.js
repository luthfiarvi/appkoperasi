require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const pgSession      = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path           = require('path');
const pool           = require('./config/database');

// ─── Routes ────────────────────────────────────────────────────
const authRoutes  = require('./routes/authRoutes');
const userRoutes  = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── View Engine ────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ─────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session ────────────────────────────────────────────────────
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret:            process.env.SESSION_SECRET || 'koperasi-bkn-secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,       // set true if using HTTPS
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8 jam
  },
}));

// ─── Global Template Locals ────────────────────────────────────
app.use((req, res, next) => {
  if (req.session?.userId && !req.session.user) {
    req.session.user = {
      id:   req.session.userId,
      nama: req.session.nama,
      nip:  req.session.nip,
      role: req.session.role,
    };
  }
  res.locals.user        = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.isAdmin     = req.session?.role === 'admin';
  res.locals.session     = req.session;
  res.locals.query       = req.query;
  res.locals.req         = req;
  next();
});

// ─── EJS Layout Helper ─────────────────────────────────────────
// Lightweight layout rendering without extra package
const fs = require('fs');

app.use((req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = function (viewName, options = {}, callback) {
    // Views that use full standalone HTML (no layout)
    const noLayoutViews = [
      'auth/login', 
      'admin/print-tagihan', 
      'admin/print-laporan', 
      'admin/print-shu',
      'admin/kwitansi-simpanan',
      'admin/bukti-pencairan',
      'admin/surat-lunas',
      'errors/403', 
      'errors/500'
    ];
    if (noLayoutViews.includes(viewName)) {
      return originalRender(viewName, options, callback);
    }

    // Render the inner view first, then wrap in layout
    originalRender(viewName, options, (err, bodyHtml) => {
      if (err) return next(err);
      originalRender('layouts/main', { ...options, body: bodyHtml }, callback || ((err2, html) => {
        if (err2) return next(err2);
        res.send(html);
      }));
    });
  };
  next();
});

// ─── Standalone Infografis (Cetak Langsung Tanpa Auth/DB) ────────
app.get('/infografis', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'infografis.html'));
});

// ─── Routes ─────────────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', adminRoutes);

// ─── 404 Handler ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#f1f5f9">
    <h1>404 — Halaman Tidak Ditemukan</h1>
    <p><a href="/" style="color:#3b82f6">← Kembali ke Beranda</a></p>
    </body></html>
  `);
});

// ─── Error Handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).send(`
    <html><body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#f1f5f9">
    <h1>500 — Kesalahan Server</h1>
    <pre style="background:#1e293b;padding:16px;border-radius:8px;overflow:auto">${err.message}</pre>
    <a href="/" style="color:#3b82f6">← Kembali</a>
    </body></html>
  `);
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   🏦 Koperasi Pegawai BKN Kanreg V Jakarta            ║');
  console.log('║   Sistem Simpan Pinjam — Modul Pembiayaan Anggota     ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║   Server: http://localhost:${PORT}                        ║`);
  console.log('║   Mode  : Development                                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
