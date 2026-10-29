const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authenticateToken } = require('../auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

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
router.put('/profile', authenticateToken, (req, res) => {
  const { name, email, major } = req.body;
  const userId = req.user.id;

  try {
    if (req.user.role === 'dosen') {
      db.prepare('UPDATE lecturers SET name = ?, email = ? WHERE user_id = ?').run(name, email || '', userId);
    } else if (req.user.role === 'mahasiswa' || req.user.role === 'student') {
      db.prepare('UPDATE students SET name = ?, major = ? WHERE user_id = ?').run(name, major || '', userId);
    }

    res.json({ message: 'Profil berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui profil: ' + err.message });
  }
});

// Change Password for current logged-in user
router.put('/change-password', authenticateToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }

  // If current password provided, check it
  if (currentPassword) {
    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password lama tidak sesuai.' });
    }
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

