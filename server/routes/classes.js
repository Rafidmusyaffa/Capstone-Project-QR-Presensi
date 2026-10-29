const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// List classes
router.get('/', authenticateToken, (req, res) => {
  let query = `
    SELECT c.*, l.name as lecturer_name, l.nip as lecturer_nip,
      (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) as student_count
    FROM classes c
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
  `;

  // If user is lecturer, optionally filter or show their classes, but let's allow all or tagged
  if (req.user.role === 'dosen') {
    const lecturer = db.prepare('SELECT id FROM lecturers WHERE user_id = ?').get(req.user.id);
    if (lecturer) {
      query += ` WHERE c.lecturer_id = ${lecturer.id}`;
    }
  } else if (req.user.role === 'mahasiswa') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user.id);
    if (student) {
      query += ` WHERE c.id IN (SELECT class_id FROM class_students WHERE student_id = ${student.id})`;
    }
  }

  query += ` ORDER BY c.code ASC`;
  const classes = db.prepare(query).all();

  // Attach schedules for each class
  const getSchedules = db.prepare('SELECT * FROM schedules WHERE class_id = ?');
  const enriched = classes.map(c => ({
    ...c,
    schedules: getSchedules.all(c.id),
  }));

  res.json(enriched);
});

// Single class detail
router.get('/:id', authenticateToken, (req, res) => {
  const classId = req.params.id;
  const cls = db.prepare(`
    SELECT c.*, l.name as lecturer_name, l.nip as lecturer_nip
    FROM classes c
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE c.id = ?
  `).get(classId);

  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  const schedules = db.prepare('SELECT * FROM schedules WHERE class_id = ?').all(classId);
  const students = db.prepare(`
    SELECT s.*, cs.id as enrollment_id
    FROM students s
    JOIN class_students cs ON s.id = cs.student_id
    WHERE cs.class_id = ?
    ORDER BY s.nim ASC
  `).all(classId);

  const sessions = db.prepare(`
    SELECT * FROM attendance_sessions 
    WHERE class_id = ? 
    ORDER BY meeting_number DESC
  `).all(classId);

  res.json({
    ...cls,
    schedules,
    students,
    sessions,
  });
});

// Create class (Admin only)
router.post('/', authenticateToken, requireRole(['admin']), (req, res) => {
  const { code, name, lecturer_id, academic_year, semester, schedule } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Kode dan nama kelas wajib diisi.' });
  }

  const existing = db.prepare('SELECT id FROM classes WHERE code = ?').get(code);
  if (existing) {
    return res.status(400).json({ error: 'Kode kelas sudah digunakan.' });
  }

  try {
    const classRes = db.prepare(`
      INSERT INTO classes (code, name, lecturer_id, academic_year, semester)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      code,
      name,
      lecturer_id || null,
      academic_year || '2026/2027',
      semester || 'Ganjil'
    );

    const classId = classRes.lastInsertRowid;

    if (schedule && schedule.day_of_week && schedule.start_time && schedule.end_time) {
      db.prepare(`
        INSERT INTO schedules (class_id, day_of_week, start_time, end_time, room)
        VALUES (?, ?, ?, ?, ?)
      `).run(classId, schedule.day_of_week, schedule.start_time, schedule.end_time, schedule.room || 'Ruang Kuliah');
    }

    res.status(201).json({ message: 'Kelas berhasil dibuat.', classId });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat kelas: ' + err.message });
  }
});

// Get student roster with enrollment status for a class
router.get('/:id/students-roster', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const classId = req.params.id;

  try {
    const students = db.prepare(`
      SELECT 
        s.id, 
        s.nim, 
        s.name, 
        s.major, 
        s.permanent_qr_token,
        CASE WHEN cs.id IS NOT NULL THEN 1 ELSE 0 END AS is_enrolled
      FROM students s
      LEFT JOIN class_students cs ON s.id = cs.student_id AND cs.class_id = ?
      ORDER BY is_enrolled DESC, s.name ASC
    `).all(classId);

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat daftar mahasiswa: ' + err.message });
  }
});

// Enroll student in class
router.post('/:id/students', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const classId = req.params.id;
  const { student_id } = req.body;

  if (!student_id) {
    return res.status(400).json({ error: 'Student ID wajib ditentukan.' });
  }

  try {
    db.prepare(`
      INSERT INTO class_students (class_id, student_id)
      VALUES (?, ?)
    `).run(classId, student_id);

    res.json({ message: 'Mahasiswa berhasil didaftarkan ke kelas.' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Mahasiswa sudah terdaftar di kelas ini.' });
    }
    res.status(500).json({ error: 'Gagal mendaftarkan mahasiswa: ' + err.message });
  }
});

// Remove student from class
router.delete('/:id/students/:studentId', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const { id: classId, studentId } = req.params;

  db.prepare('DELETE FROM class_students WHERE class_id = ? AND student_id = ?').run(classId, studentId);
  res.json({ message: 'Mahasiswa berhasil dihapus dari kelas.' });
});

// Update class (Admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const classId = req.params.id;
  const { code, name, lecturer_id, academic_year, semester, schedule } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Kode dan nama kelas wajib diisi.' });
  }

  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  const existing = db.prepare('SELECT id FROM classes WHERE code = ? AND id != ?').get(code, classId);
  if (existing) {
    return res.status(400).json({ error: 'Kode kelas sudah digunakan pada kelas lain.' });
  }

  try {
    db.prepare(`
      UPDATE classes 
      SET code = ?, name = ?, lecturer_id = ?, academic_year = ?, semester = ?
      WHERE id = ?
    `).run(code, name, lecturer_id || null, academic_year || '2026/2027', semester || 'Ganjil', classId);

    if (schedule && schedule.day_of_week && schedule.start_time && schedule.end_time) {
      const existingSched = db.prepare('SELECT id FROM schedules WHERE class_id = ?').get(classId);
      if (existingSched) {
        db.prepare(`
          UPDATE schedules 
          SET day_of_week = ?, start_time = ?, end_time = ?, room = ? 
          WHERE id = ?
        `).run(schedule.day_of_week, schedule.start_time, schedule.end_time, schedule.room || 'Ruang Kuliah', existingSched.id);
      } else {
        db.prepare(`
          INSERT INTO schedules (class_id, day_of_week, start_time, end_time, room)
          VALUES (?, ?, ?, ?, ?)
        `).run(classId, schedule.day_of_week, schedule.start_time, schedule.end_time, schedule.room || 'Ruang Kuliah');
      }
    }

    res.json({ message: 'Data kelas berhasil diperbarui.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui kelas: ' + err.message });
  }
});

// Delete class (Admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), (req, res) => {
  const classId = req.params.id;
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  try {
    db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
    res.json({ message: `Kelas ${cls.name} (${cls.code}) berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus kelas: ' + err.message });
  }
});

module.exports = router;


