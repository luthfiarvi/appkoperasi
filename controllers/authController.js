const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');

const AuthController = {
  // ─── GET /login ──────────────────────────────────────────────────
  showLogin: (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.render('auth/login', { title: 'Login - Koperasi BKN', error: null });
  },

  // ─── POST /login ─────────────────────────────────────────────────
  login: async (req, res) => {
    const { nip, password } = req.body;
    try {
      const user = await UserModel.findByNip(nip.trim());
      if (!user) {
        return res.render('auth/login', {
          title: 'Login - Koperasi BKN',
          error: 'NIP tidak ditemukan.'
        });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.render('auth/login', {
          title: 'Login - Koperasi BKN',
          error: 'Password tidak sesuai.'
        });
      }

      req.session.userId = user.id;
      req.session.role   = user.role;
      req.session.nama   = user.nama;
      req.session.nip    = user.nip;
      req.session.user   = { id: user.id, nama: user.nama, nip: user.nip, role: user.role };

      if (user.role === 'admin') return res.redirect('/admin/dashboard');
      return res.redirect('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      res.render('auth/login', {
        title: 'Login - Koperasi BKN',
        error: 'Terjadi kesalahan server. Silakan coba lagi.'
      });
    }
  },

  // ─── POST /logout ────────────────────────────────────────────────
  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error('Logout error:', err);
      res.redirect('/login');
    });
  },
};

module.exports = AuthController;
