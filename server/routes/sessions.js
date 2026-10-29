const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');

// List sessions
router.get('/', authenticateToken, (req, res) => {
  const { class_id, status, sort } = req.query;
  let query = `
    SELECT s.*, c.code as class_code, c.name as class_name, l.name as lecturer_name,
      (SELECT room FROM schedules sc WHERE sc.class_id = c.id LIMIT 1) as room,
      (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = s.class_id) as total_students,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'PRESENT') as present_count,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'LATE') as late_count,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'ABSENT') as absent_count
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE 1=1
  `;
  const params = [];

  if (class_id) {
    query += ' AND s.class_id = ?';
    params.push(class_id);
  }
  if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  // If user is lecturer, only their classes
  if (req.user.role === 'dosen') {
    const lecturer = db.prepare('SELECT id FROM lecturers WHERE user_id = ?').get(req.user.id);
    if (lecturer) {
      query += ` AND c.lecturer_id = ?`;
      params.push(lecturer.id);
    }
  }

  if (sort === 'date_desc') {
    query += ' ORDER BY s.meeting_date DESC, s.meeting_number DESC, s.start_time DESC';
  } else if (sort === 'meeting_asc') {
    query += ' ORDER BY s.meeting_number ASC, s.meeting_date ASC, s.start_time ASC';
  } else {
    // Default: Chronological order by meeting_date ASC, meeting_number ASC, start_time ASC
    query += ' ORDER BY s.meeting_date ASC, s.meeting_number ASC, s.start_time ASC';
  }

  const sessions = db.prepare(query).all(...params);
  res.json(sessions);
});

// Single session detail with statistics & attendee list
router.get('/:id', authenticateToken, (req, res) => {
  const sessionId = req.params.id;
  const session = db.prepare(`
    SELECT s.*, c.code as class_code, c.name as class_name, l.name as lecturer_name, l.nip as lecturer_nip,
      (SELECT room FROM schedules sc WHERE sc.class_id = c.id LIMIT 1) as room
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE s.id = ?
  `).get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Attendance session tidak ditemukan.' });
  }

  // Get all enrolled students in class and their attendance status for this session
  const enrolledStudents = db.prepare(`
    SELECT 
      st.id as student_id,
      st.nim,
      st.name,
      st.major,
      st.permanent_qr_token,
      a.id as attendance_id,
      a.scan_time,
      a.status as attendance_status,
      a.remarks,
      a.score,
      a.score_feedback,
      a.recorded_at
    FROM class_students cs
    JOIN students st ON cs.student_id = st.id
    LEFT JOIN attendances a ON a.session_id = ? AND a.student_id = st.id
    WHERE cs.class_id = ?
    ORDER BY 
      CASE 
        WHEN a.status = 'PRESENT' THEN 1
        WHEN a.status = 'LATE' THEN 2
        WHEN a.status = 'ABSENT' THEN 3
        ELSE 4
      END,
      st.nim ASC
  `).all(sessionId, session.class_id);

  // Compute statistics
  const total = enrolledStudents.length;
  const present = enrolledStudents.filter(s => s.attendance_status === 'PRESENT').length;
  const late = enrolledStudents.filter(s => s.attendance_status === 'LATE').length;
  const absent = enrolledStudents.filter(s => s.attendance_status === 'ABSENT').length;
  const unrecorded = enrolledStudents.filter(s => !s.attendance_status).length;
  const attendanceRate = total > 0 ? (((present + late) / total) * 100).toFixed(1) : 0;

  res.json({
    session,
    stats: {
      total,
      present,
      late,
      absent,
      unrecorded,
      attendanceRate,
    },
    students: enrolledStudents,
  });
});

// Create attendance session (Admin / Dosen)
router.post('/', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const {
    class_id,
    meeting_number,
    meeting_date,
    start_time,
    present_until,
    late_until,
    end_time,
  } = req.body;

  if (!class_id || !meeting_number || !meeting_date || !start_time || !present_until || !late_until || !end_time) {
    return res.status(400).json({ error: 'Semua informasi sesi dan aturan waktu wajib diisi.' });
  }

  // Validate time logic: start <= present_until <= late_until <= end_time
  if (start_time > present_until || present_until > late_until || late_until > end_time) {
    return res.status(400).json({
      error: 'Urutan aturan waktu tidak valid. Harus memenuhi: Start Time ≤ Present Until ≤ Late Until ≤ End Time.',
    });
  }

  // Generate unique session code
  const cls = db.prepare('SELECT code FROM classes WHERE id = ?').get(class_id);
  const classCodeClean = (cls ? cls.code : 'CLS').replace(/[^a-zA-Z0-9]/g, '');
  const sessionCode = `SES-${classCodeClean}-M${String(meeting_number).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

  try {
    const result = db.prepare(`
      INSERT INTO attendance_sessions
      (session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(
      sessionCode,
      class_id,
      meeting_number,
      meeting_date,
      start_time,
      present_until,
      late_until,
      end_time,
      req.user.id
    );

    res.status(201).json({
      message: 'Attendance Session berhasil dibuat dan berstatus ACTIVE.',
      sessionId: result.lastInsertRowid,
      sessionCode,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat session: ' + err.message });
  }
});

// Toggle / update status (e.g. manually close or activate)
router.patch('/:id/status', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const sessionId = req.params.id;
  const { status } = req.body;

  if (!['ACTIVE', 'CLOSED'].includes(status)) {
    return res.status(400).json({ error: 'Status harus ACTIVE atau CLOSED.' });
  }

  db.prepare('UPDATE attendance_sessions SET status = ? WHERE id = ?').run(status, sessionId);
  res.json({ message: `Status session berhasil diubah menjadi ${status}.` });
});

// Finalize session (Rule: unrecorded enrolled students become ABSENT)
router.post('/:id/finalize', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const sessionId = req.params.id;
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session tidak ditemukan.' });
  }

  // Find enrolled students who have NO attendance record
  const unrecorded = db.prepare(`
    SELECT cs.student_id 
    FROM class_students cs
    WHERE cs.class_id = ? 
      AND cs.student_id NOT IN (
        SELECT student_id FROM attendances WHERE session_id = ?
      )
  `).all(session.class_id, sessionId);

  const insertAbsent = db.prepare(`
    INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
    VALUES (?, ?, ?, 'ABSENT', 'Finalisasi otomatis: Mahasiswa tidak melakukan presensi.')
  `);

  let count = 0;
  for (const s of unrecorded) {
    insertAbsent.run(sessionId, s.student_id, '-');
    count++;
  }

  // Also close session if not already closed
  db.prepare("UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = ?").run(sessionId);

  res.json({
    message: `Finalisasi selesai. ${count} mahasiswa ditetapkan sebagai ABSENT, dan sesi telah berstatus CLOSED.`,
    finalizedCount: count,
  });
});

// Delete attendance session (Admin or Dosen)
router.delete('/:id', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const sessionId = req.params.id;

  try {
    const session = db.prepare(`
      SELECT s.*, c.lecturer_id, c.name as class_name, c.code as class_code
      FROM attendance_sessions s 
      JOIN classes c ON s.class_id = c.id 
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Sesi perkuliahan tidak ditemukan.' });
    }

    // Authorization check for dosen role
    if (req.user.role === 'dosen') {
      const lecturer = db.prepare('SELECT id FROM lecturers WHERE user_id = ?').get(req.user.id);
      if (!lecturer || (session.lecturer_id !== lecturer.id && session.created_by !== req.user.id)) {
        return res.status(403).json({ error: 'Anda tidak memiliki wewenang untuk menghapus sesi pada kelas ini.' });
      }
    }

    // Delete attendance records and the session
    db.prepare('DELETE FROM attendances WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM attendance_sessions WHERE id = ?').run(sessionId);

    res.json({
      message: `Sesi ${session.class_name} (${session.class_code}) Pertemuan #${session.meeting_number} (${session.session_code}) berhasil dihapus.`,
      sessionId: Number(sessionId),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus sesi perkuliahan: ' + err.message });
  }
});

module.exports = router;
