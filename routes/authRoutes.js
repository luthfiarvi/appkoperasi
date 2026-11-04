const express = require('express');
const router  = express.Router();
const AuthController = require('../controllers/authController');

router.get('/login',  AuthController.showLogin);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

// Root → redirect
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/dashboard');
  }
  res.redirect('/login');
});

module.exports = router;
