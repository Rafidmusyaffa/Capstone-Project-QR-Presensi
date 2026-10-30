const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { hideQrToken } = require('../access');
const { generateQrToken } = require('../qrToken');

const MIN_PASSWORD_LENGTH = 6;

/** Trim field string pada body; nilai non-string menjadi ''. */
function pickTrimmed(body, fields) {
  const out = {};
  for (const f of fields) out[f] = typeof body[f] === 'string' ? body[f].trim() : '';
  return out;
}

/** Jalankan fn dalam satu transaksi; rollback jika gagal. */
function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Students list (token QR hanya untuk admin)
router.get('/students', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const students = db.prepare(`
    SELECT s.*, u.username
    FROM students s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.nim ASC
  `).all();
  res.json(hideQrToken(req.user, students));
});

// Create student
router.post('/students', authenticateToken, requireRole(['admin']), (req, res) => {
  const { username, nim, name, major } = pickTrimmed(req.body, ['username', 'nim', 'name', 'major']);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password || !nim || !name || !major) {
    return res.status(400).json({ error: 'Semua field mahasiswa wajib diisi.' });
  }
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }

  // Check unique username and NIM
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(409).json({ error: 'Username sudah digunakan.' });
  }

  const existingNim = db.prepare('SELECT id FROM students WHERE nim = ?').get(nim);
  if (existingNim) {
    return res.status(409).json({ error: 'NIM sudah terdaftar.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const permanentQrToken = generateQrToken();

  try {
    // Akun user dan profil mahasiswa dibuat bersamaan, atau tidak sama sekali
    const studentId = inTransaction(() => {
      const userRes = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'mahasiswa');
      const studentRes = db.prepare(`
        INSERT INTO students (user_id, nim, name, major, permanent_qr_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(userRes.lastInsertRowid, nim, name, major, permanentQrToken);
      return studentRes.lastInsertRowid;
    });

    res.status(201).json({
      message: 'Mahasiswa berhasil ditambahkan.',
      studentId,
      permanent_qr_token: permanentQrToken,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat mahasiswa: ' + err.message });
  }
});

// Lecturers list
router.get('/lecturers', authenticateToken, (req, res) => {
  const lecturers = db.prepare(`
    SELECT l.*, u.username 
    FROM lecturers l 
    JOIN users u ON l.user_id = u.id 
    ORDER BY l.name ASC
  `).all();
  res.json(lecturers);
});

// Create lecturer
router.post('/lecturers', authenticateToken, requireRole(['admin']), (req, res) => {
  const { username, nip, name, email } = pickTrimmed(req.body, ['username', 'nip', 'name', 'email']);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password || !nip || !name) {
    return res.status(400).json({ error: 'Field wajib dosen belum lengkap.' });
  }
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(409).json({ error: 'Username sudah digunakan.' });
  }

  const existingNip = db.prepare('SELECT id FROM lecturers WHERE nip = ?').get(nip);
  if (existingNip) {
    return res.status(409).json({ error: 'NIP sudah terdaftar.' });
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const lecturerId = inTransaction(() => {
      const userRes = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'dosen');
      const lectRes = db.prepare(`
        INSERT INTO lecturers (user_id, nip, name, email)
        VALUES (?, ?, ?, ?)
      `).run(userRes.lastInsertRowid, nip, name, email);
      return lectRes.lastInsertRowid;
    });

    res.status(201).json({
      message: 'Dosen berhasil ditambahkan.',
      lecturerId,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat dosen: ' + err.message });
  }
});

// Update student (Admin only)
router.put('/students/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const studentId = req.params.id;
  const { username, nim, name, major } = pickTrimmed(req.body, ['username', 'nim', 'name', 'major']);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !nim || !name || !major) {
    return res.status(400).json({ error: 'Username, NIM, Nama, dan Program Studi wajib diisi.' });
  }
  if (password.trim() && password.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  // Check unique username (exclude current user)
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, student.user_id);
  if (existingUser) {
    return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
  }

  // Check unique NIM (exclude current student)
  const existingNim = db.prepare('SELECT id FROM students WHERE nim = ? AND id != ?').get(nim, studentId);
  if (existingNim) {
    return res.status(409).json({ error: 'NIM sudah terdaftar pada mahasiswa lain.' });
  }

  try {
    inTransaction(() => {
      db.prepare(`
        UPDATE students
        SET nim = ?, name = ?, major = ?
        WHERE id = ?
      `).run(nim, name, major, studentId);

      if (password.trim()) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(username, hash, student.user_id);
      } else {
        db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, student.user_id);
      }
    });

    res.json({ message: 'Data mahasiswa berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui mahasiswa: ' + err.message });
  }
});

// Aktifkan / nonaktifkan mahasiswa (Admin only). Mahasiswa nonaktif tetap bisa
// login & melihat riwayat, tetapi scan QR-nya ditolak (BR-01).
router.patch('/students/:id/status', authenticateToken, requireRole(['admin']), (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'Field is_active wajib bernilai true atau false.' });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  db.prepare('UPDATE students SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, student.id);
  res.json({
    message: `Mahasiswa ${student.name} (${student.nim}) sekarang ${is_active ? 'AKTIF' : 'NONAKTIF'}.`,
    is_active,
  });
});

// Regenerate permanent QR token (Admin only) - QR lama langsung tidak berlaku
router.post('/students/:id/regenerate-qr', authenticateToken, requireRole(['admin']), (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  const permanentQrToken = generateQrToken();
  try {
    db.prepare('UPDATE students SET permanent_qr_token = ? WHERE id = ?').run(permanentQrToken, student.id);
    res.json({
      message: `QR Code mahasiswa ${student.name} (${student.nim}) berhasil dibuat ulang. QR lama tidak berlaku lagi.`,
      permanent_qr_token: permanentQrToken,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat ulang QR Code: ' + err.message });
  }
});

// Delete student (Admin only)
router.delete('/students/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const studentId = req.params.id;
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  try {
    // Delete the underlying user (ON DELETE CASCADE deletes student, attendances, enrollments)
    db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
    res.json({ message: `Mahasiswa ${student.name} (${student.nim}) berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus mahasiswa: ' + err.message });
  }
});

// Update lecturer (Admin only)
router.put('/lecturers/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const lecturerId = req.params.id;
  const { username, nip, name, email } = pickTrimmed(req.body, ['username', 'nip', 'name', 'email']);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !nip || !name) {
    return res.status(400).json({ error: 'Username, NIP, dan Nama Dosen wajib diisi.' });
  }
  if (password.trim() && password.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }

  const lecturer = db.prepare('SELECT * FROM lecturers WHERE id = ?').get(lecturerId);
  if (!lecturer) {
    return res.status(404).json({ error: 'Dosen tidak ditemukan.' });
  }

  // Check unique username (exclude current user)
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, lecturer.user_id);
  if (existingUser) {
    return res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
  }

  // Check unique NIP (exclude current lecturer)
  const existingNip = db.prepare('SELECT id FROM lecturers WHERE nip = ? AND id != ?').get(nip, lecturerId);
  if (existingNip) {
    return res.status(409).json({ error: 'NIP sudah terdaftar pada dosen lain.' });
  }

  try {
    inTransaction(() => {
      db.prepare(`
        UPDATE lecturers
        SET nip = ?, name = ?, email = ?
        WHERE id = ?
      `).run(nip, name, email, lecturerId);

      if (password.trim()) {
        const hash = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(username, hash, lecturer.user_id);
      } else {
        db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, lecturer.user_id);
      }
    });

    res.json({ message: 'Data dosen berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui dosen: ' + err.message });
  }
});

// Delete lecturer (Admin only)
router.delete('/lecturers/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const lecturerId = req.params.id;
  const lecturer = db.prepare('SELECT * FROM lecturers WHERE id = ?').get(lecturerId);
  if (!lecturer) {
    return res.status(404).json({ error: 'Dosen tidak ditemukan.' });
  }

  try {
    // Delete the underlying user (ON DELETE CASCADE)
    db.prepare('DELETE FROM users WHERE id = ?').run(lecturer.user_id);
    res.json({ message: `Dosen ${lecturer.name} berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus dosen: ' + err.message });
  }
});

module.exports = router;

