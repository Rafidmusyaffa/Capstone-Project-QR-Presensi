const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'presensi-secret-capstone-key-2026';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Token autentikasi tidak ditemukan.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token kadaluarsa atau tidak valid.' });
    }
    req.user = user;
    next();
  });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Akses terlarang: Peran '${req.user ? req.user.role : 'Guest'}' tidak memiliki izin untuk tindakan ini.`,
      });
    }
    next();
  };
}

module.exports = {
  generateToken,
  authenticateToken,
  requireRole,
};
