// Middleware: Cek apakah user sudah login
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

// Middleware: Hanya untuk role admin
function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).render('errors/403', {
    title: 'Akses Ditolak',
    user: { nama: req.session?.nama || '' },
  });
}

// Middleware: Hanya untuk role user
function isUser(req, res, next) {
  if (req.session && req.session.role === 'user') return next();
  if (req.session && req.session.role === 'admin') return res.redirect('/admin/dashboard');
  res.status(403).render('errors/403', {
    title: 'Akses Ditolak',
    user: { nama: req.session?.nama || '' },
  });
}

module.exports = { isAuthenticated, isAdmin, isUser };
