const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authenticateToken } = require('../auth');

// Rate-limit login in-memory: maksimal 10 percobaan gagal per 15 menit per IP+username
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function loginKey(req, username) {
  return `${req.ip}|${String(username).toLowerCase()}`;
}

function getFailureEntry(key) {
  const entry = loginFailures.get(key);
  if (entry && Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return null;
  }
  return entry;
}

function recordFailure(key) {
  const entry = getFailureEntry(key);
  if (entry) entry.count++;
  else loginFailures.set(key, { count: 1, firstAt: Date.now() });
}

// Bersihkan entri kedaluwarsa agar Map tidak tumbuh tanpa batas
setInterval(() => {
  for (const key of loginFailures.keys()) getFailureEntry(key);
}, LOGIN_WINDOW_MS).unref();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const key = loginKey(req, username);
  const failures = getFailureEntry(key);
  if (failures && failures.count >= LOGIN_MAX_FAILURES) {
    const retryAfterSec = Math.ceil((failures.firstAt + LOGIN_WINDOW_MS - Date.now()) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      code: 'TOO_MANY_ATTEMPTS',
      error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.ceil(retryAfterSec / 60)} menit.`,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  loginFailures.delete(key);

  let profile = { id: user.id, username: user.username, role: user.role };

  if (user.role === 'student' || user.role === 'mahasiswa') {
    const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    if (student) {
      profile.student = student;
      profile.name = student.name;
    }
  } else if (user.role === 'dosen') {
    const lecturer = db.prepare('SELECT * FROM lecturers WHERE user_id = ?').get(user.id);
    if (lecturer) {
      profile.lecturer = lecturer;
      profile.name = lecturer.name;
    }
  } else if (user.role === 'admin') {
    profile.name = 'Administrator Sistem';
  }

  const token = generateToken(profile);
  res.json({
    message: 'Login berhasil.',
    token,
    user: profile,
  });
});

router.get('/me', authenticateToken, (req, res) => {
  let profile = { id: req.user.id, username: req.user.username, role: req.user.role };

  if (req.user.role === 'mahasiswa' || req.user.role === 'student') {
    const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.user.id);
    profile.student = student;
    profile.name = student ? student.name : req.user.username;
  } else if (req.user.role === 'dosen') {
    const lecturer = db.prepare('SELECT * FROM lecturers WHERE user_id = ?').get(req.user.id);
    profile.lecturer = lecturer;
    profile.name = lecturer ? lecturer.name : req.user.username;
  } else {
    profile.name = 'Administrator Sistem';
  }

  res.json({ user: profile });
});

// Update Profile for current logged-in user
// Data identitas mahasiswa (nama, NIM, prodi) hanya boleh diubah admin.
router.put('/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;

  if (req.user.role !== 'dosen') {
    return res.status(403).json({
      code: 'FORBIDDEN',
      error: req.user.role === 'mahasiswa'
        ? 'Data identitas mahasiswa hanya dapat diubah oleh admin.'
        : 'Profil akun ini tidak dapat diubah.',
    });
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Nama wajib diisi.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Format email tidak valid.' });
  }

  try {
    db.prepare('UPDATE lecturers SET name = ?, email = ? WHERE user_id = ?').run(name, email, userId);
    res.json({ message: 'Profil berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui profil: ' + err.message });
  }
});

// Change Password for current logged-in user
router.put('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Password lama wajib diisi.' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Password lama tidak sesuai.' });
  }

  try {
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    res.json({ message: 'Password berhasil diubah. Gunakan password baru ini untuk login berikutnya.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengubah password: ' + err.message });
  }
});

module.exports = router;

