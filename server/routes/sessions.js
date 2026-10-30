const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { nowParts, normTime, isValidDate, isValidTime, computePhase } = require('../time');
const { finalizeSession } = require('../scheduler');
const { canManageClass, hideQrToken, forbidden } = require('../access');

// List sessions
router.get('/', authenticateToken, (req, res) => {
  const { class_id, status, sort } = req.query;
  const isStudent = req.user.role === 'mahasiswa';
  const params = [];

  // Mahasiswa juga menerima status presensinya sendiri per sesi (untuk "Sesi Hari Ini")
  const ownAttendanceColumns = isStudent
    ? `,
      (SELECT a.status FROM attendances a JOIN students st ON a.student_id = st.id
        WHERE a.session_id = s.id AND st.user_id = ?) as my_status,
      (SELECT a.scan_time FROM attendances a JOIN students st ON a.student_id = st.id
        WHERE a.session_id = s.id AND st.user_id = ?) as my_scan_time`
    : '';
  if (isStudent) params.push(req.user.id, req.user.id);

  let query = `
    SELECT s.*, c.code as class_code, c.name as class_name, l.name as lecturer_name,
      (SELECT room FROM schedules sc WHERE sc.class_id = c.id LIMIT 1) as room,
      (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = s.class_id) as total_students,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'PRESENT') as present_count,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'LATE') as late_count,
      (SELECT COUNT(*) FROM attendances a WHERE a.session_id = s.id AND a.status = 'ABSENT') as absent_count${ownAttendanceColumns}
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE 1=1
  `;

  // date=today memakai tanggal server (WIB), bukan tanggal perangkat klien
  if (req.query.date) {
    const date = req.query.date === 'today' ? nowParts().date : req.query.date;
    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD atau today).' });
    }
    query += ' AND s.meeting_date = ?';
    params.push(date);
  }

  if (class_id) {
    query += ' AND s.class_id = ?';
    params.push(class_id);
  }
  if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  // Dosen: hanya kelas yang diampu; mahasiswa: hanya kelas yang diikuti
  if (req.user.role === 'dosen') {
    query += ' AND l.user_id = ?';
    params.push(req.user.id);
  } else if (isStudent) {
    query += ` AND s.class_id IN (
      SELECT cs.class_id FROM class_students cs
      JOIN students st ON cs.student_id = st.id
      WHERE st.user_id = ?
    )`;
    params.push(req.user.id);
  } else if (req.user.role !== 'admin') {
    return res.json([]);
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
router.get('/:id', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
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

  if (!canManageClass(req.user, session.class_id)) {
    return forbidden(res);
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
    students: hideQrToken(req.user, enrolledStudents),
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

  const meetingNumber = Number(meeting_number);
  if (!Number.isInteger(meetingNumber) || meetingNumber < 1) {
    return res.status(400).json({ error: 'Nomor pertemuan harus berupa bilangan bulat positif.' });
  }

  if (!isValidDate(meeting_date)) {
    return res.status(400).json({ error: 'Format tanggal pertemuan tidak valid (gunakan YYYY-MM-DD).' });
  }

  const times = { start_time, present_until, late_until, end_time };
  for (const [field, value] of Object.entries(times)) {
    if (!isValidTime(value)) {
      return res.status(400).json({ error: `Format jam ${field} tidak valid (gunakan HH:MM atau HH:MM:SS).` });
    }
  }

  // Validate time logic: start <= present_until <= late_until <= end_time (presisi detik)
  const [tStart, tPresent, tLate, tEnd] = [start_time, present_until, late_until, end_time].map(normTime);
  if (tStart > tPresent || tPresent > tLate || tLate > tEnd) {
    return res.status(400).json({
      error: 'Urutan aturan waktu tidak valid. Harus memenuhi: Start Time ≤ Present Until ≤ Late Until ≤ End Time.',
    });
  }

  const cls = db.prepare('SELECT code FROM classes WHERE id = ?').get(class_id);
  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  if (!canManageClass(req.user, class_id)) {
    return forbidden(res);
  }

  const duplicate = db.prepare('SELECT id FROM attendance_sessions WHERE class_id = ? AND meeting_number = ?').get(class_id, meetingNumber);
  if (duplicate) {
    return res.status(409).json({ error: `Pertemuan #${meetingNumber} sudah ada di kelas ini.` });
  }

  const newSession = {
    meeting_date,
    start_time: start_time.trim(),
    present_until: present_until.trim(),
    late_until: late_until.trim(),
    end_time: end_time.trim(),
  };
  const status = computePhase(newSession, nowParts());
  if (status === 'CLOSED') {
    return res.status(400).json({ error: 'Waktu sesi sudah berakhir. Tanggal dan End Time harus di masa mendatang.' });
  }

  // Generate unique session code
  const classCodeClean = cls.code.replace(/[^a-zA-Z0-9]/g, '');
  const sessionCode = `SES-${classCodeClean}-M${String(meetingNumber).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

  try {
    const result = db.prepare(`
      INSERT INTO attendance_sessions
      (session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionCode,
      class_id,
      meetingNumber,
      newSession.meeting_date,
      newSession.start_time,
      newSession.present_until,
      newSession.late_until,
      newSession.end_time,
      status,
      req.user.id
    );

    res.status(201).json({
      message: `Attendance Session berhasil dibuat dan berstatus ${status}.`,
      sessionId: result.lastInsertRowid,
      sessionCode,
      status,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membuat session: ' + err.message });
  }
});

// Tutup & finalisasi sekarang (unrecorded enrolled students become ABSENT, status FINALIZED)
router.post('/:id/finalize', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const sessionId = req.params.id;
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session tidak ditemukan.' });
  }

  if (!canManageClass(req.user, session.class_id)) {
    return forbidden(res);
  }

  if (session.status === 'FINALIZED') {
    return res.status(409).json({ error: 'Sesi ini sudah difinalisasi.' });
  }

  try {
    const count = finalizeSession(session.id, nowParts(), 'Finalisasi manual: Mahasiswa tidak melakukan presensi.');
    res.json({
      message: `Finalisasi selesai. ${count} mahasiswa ditetapkan sebagai ABSENT, dan sesi telah berstatus FINALIZED.`,
      finalizedCount: count,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memfinalisasi sesi: ' + err.message });
  }
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

    if (!canManageClass(req.user, session.class_id)) {
      return forbidden(res, 'Anda tidak memiliki wewenang untuk menghapus sesi pada kelas ini.');
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
