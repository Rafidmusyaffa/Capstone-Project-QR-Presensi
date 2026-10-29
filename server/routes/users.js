const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// Students list
router.get('/students', authenticateToken, (req, res) => {
  const students = db.prepare(`
    SELECT s.*, u.username 
    FROM students s 
    JOIN users u ON s.user_id = u.id 
    ORDER BY s.nim ASC
  `).all();
  res.json(students);
});

// Create student
router.post('/students', authenticateToken, requireRole(['admin']), (req, res) => {
  const { username, password, nim, name, major } = req.body;

  if (!username || !password || !nim || !name || !major) {
    return res.status(400).json({ error: 'Semua field mahasiswa wajib diisi.' });
  }

  // Check unique username and NIM
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(400).json({ error: 'Username sudah digunakan.' });
  }

  const existingNim = db.prepare('SELECT id FROM students WHERE nim = ?').get(nim);
  if (existingNim) {
    return res.status(400).json({ error: 'NIM sudah terdaftar.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const permanentQrToken = `QR-STD-${nim}-${randomSuffix}`;

  try {
    const userRes = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'mahasiswa');
    const studentRes = db.prepare(`
      INSERT INTO students (user_id, nim, name, major, permanent_qr_token) 
      VALUES (?, ?, ?, ?, ?)
    `).run(userRes.lastInsertRowid, nim, name, major, permanentQrToken);

    res.status(201).json({
      message: 'Mahasiswa berhasil ditambahkan.',
      studentId: studentRes.lastInsertRowid,
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
  const { username, password, nip, name, email } = req.body;

  if (!username || !password || !nip || !name) {
    return res.status(400).json({ error: 'Field wajib dosen belum lengkap.' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(400).json({ error: 'Username sudah digunakan.' });
  }

  const existingNip = db.prepare('SELECT id FROM lecturers WHERE nip = ?').get(nip);
  if (existingNip) {
    return res.status(400).json({ error: 'NIP sudah terdaftar.' });
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const userRes = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'dosen');
    const lectRes = db.prepare(`
      INSERT INTO lecturers (user_id, nip, name, email) 
      VALUES (?, ?, ?, ?)
    `).run(userRes.lastInsertRowid, nip, name, email || '');

    res.status(201).json({
      message: 'Dosen berhasil ditambahkan.',
      lecturerId: lectRes.lastInsertRowid,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat dosen: ' + err.message });
  }
});

// Update student (Admin only)
router.put('/students/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const studentId = req.params.id;
  const { username, password, nim, name, major } = req.body;

  if (!username || !nim || !name || !major) {
    return res.status(400).json({ error: 'Username, NIM, Nama, dan Program Studi wajib diisi.' });
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  // Check unique username (exclude current user)
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, student.user_id);
  if (existingUser) {
    return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain.' });
  }

  // Check unique NIM (exclude current student)
  const existingNim = db.prepare('SELECT id FROM students WHERE nim = ? AND id != ?').get(nim, studentId);
  if (existingNim) {
    return res.status(400).json({ error: 'NIM sudah terdaftar pada mahasiswa lain.' });
  }

  try {
    // Update student info
    db.prepare(`
      UPDATE students 
      SET nim = ?, name = ?, major = ? 
      WHERE id = ?
    `).run(nim, name, major, studentId);

    // Update user info
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`
        UPDATE users 
        SET username = ?, password_hash = ? 
        WHERE id = ?
      `).run(username, hash, student.user_id);
    } else {
      db.prepare(`
        UPDATE users 
        SET username = ? 
        WHERE id = ?
      `).run(username, student.user_id);
    }

    res.json({ message: 'Data mahasiswa berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui mahasiswa: ' + err.message });
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
  const { username, password, nip, name, email } = req.body;

  if (!username || !nip || !name) {
    return res.status(400).json({ error: 'Username, NIP, dan Nama Dosen wajib diisi.' });
  }

  const lecturer = db.prepare('SELECT * FROM lecturers WHERE id = ?').get(lecturerId);
  if (!lecturer) {
    return res.status(404).json({ error: 'Dosen tidak ditemukan.' });
  }

  // Check unique username (exclude current user)
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, lecturer.user_id);
  if (existingUser) {
    return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain.' });
  }

  // Check unique NIP (exclude current lecturer)
  const existingNip = db.prepare('SELECT id FROM lecturers WHERE nip = ? AND id != ?').get(nip, lecturerId);
  if (existingNip) {
    return res.status(400).json({ error: 'NIP sudah terdaftar pada dosen lain.' });
  }

  try {
    // Update lecturer info
    db.prepare(`
      UPDATE lecturers 
      SET nip = ?, name = ?, email = ? 
      WHERE id = ?
    `).run(nip, name, email || '', lecturerId);

    // Update user info
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare(`
        UPDATE users 
        SET username = ?, password_hash = ? 
        WHERE id = ?
      `).run(username, hash, lecturer.user_id);
    } else {
      db.prepare(`
        UPDATE users 
        SET username = ? 
        WHERE id = ?
      `).run(username, lecturer.user_id);
    }

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

