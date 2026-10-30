const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Tanpa JWT_SECRET: secret acak per proses (token lama tidak berlaku setelah restart)
  if (process.env.NODE_ENV === 'production') {
    console.warn('[PERINGATAN] JWT_SECRET WAJIB diisi di production! Memakai secret acak sementara; semua sesi login hilang saat server restart.');
  } else {
    console.warn('[PERINGATAN] JWT_SECRET tidak diisi. Memakai secret acak sementara untuk proses ini.');
  }
  return crypto.randomBytes(48).toString('base64url');
}

const JWT_SECRET = resolveJwtSecret();

// Payload JWT hanya identitas minimum; data profil diambil dari DB saat dibutuhkan
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Akses ditolak: Token autentikasi tidak ditemukan.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    // 401 (bukan 403) agar client tahu harus login ulang
    if (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        error: expired
          ? 'Sesi login Anda telah berakhir. Silakan login ulang.'
          : 'Sesi login tidak valid. Silakan login ulang.',
      });
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
