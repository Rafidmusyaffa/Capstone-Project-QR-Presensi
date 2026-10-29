const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');

/**
 * Helper to get current HH:MM:SS or HH:MM in local time
 */
function getCurrentTimeFormatted() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * QR SCAN ENDPOINT
 * Pipeline: IDENTIFY -> VALIDATE -> CLASSIFY -> RECORD
 */
router.post('/scan', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const { session_id, qr_data, simulated_time } = req.body;

  if (!session_id || !qr_data) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_DATA',
      message: 'Session ID dan Data QR Code wajib disertakan.',
    });
  }

  // Determine scan time (allows simulated_time for testing specific Capstone test cases)
  const fullScanTime = simulated_time ? (simulated_time.length === 5 ? `${simulated_time}:00` : simulated_time) : getCurrentTimeFormatted();
  const scanTimeShort = fullScanTime.slice(0, 5); // HH:MM

  // Fetch Attendance Session
  const session = db.prepare(`
    SELECT s.*, c.code as class_code, c.name as class_name
    FROM attendance_sessions s
    JOIN classes c ON s.class_id = c.id
    WHERE s.id = ?
  `).get(session_id);

  if (!session) {
    return res.status(404).json({
      success: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Attendance Session tidak ditemukan.',
    });
  }

  // RULE 6: Session CLOSED tidak menerima scan
  if (session.status === 'CLOSED') {
    return res.status(400).json({
      success: false,
      code: 'SESSION_CLOSED',
      message: 'SESSION CLOSED: Sesi presensi ini telah ditutup.',
    });
  }

  // RULE 1: QR Code Harus Terdaftar (IDENTIFY Mahasiswa)
  // Accept exact permanent_qr_token or NIM or parsed JSON
  let searchToken = qr_data.trim();
  try {
    const parsed = JSON.parse(qr_data);
    if (parsed.permanent_qr_token) searchToken = parsed.permanent_qr_token;
    else if (parsed.nim) searchToken = parsed.nim;
  } catch (e) {
    // Keep raw string token
  }

  const student = db.prepare(`
    SELECT s.*, u.username 
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.permanent_qr_token = ? OR s.nim = ?
  `).get(searchToken, searchToken);

  if (!student) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_QR_CODE',
      message: 'INVALID QR CODE: QR Code tidak dikenali dalam sistem mahasiswa.',
    });
  }

  // RULE 2: Mahasiswa Harus Terdaftar di Kelas Ini (CLASS VALIDATION)
  const enrollment = db.prepare(`
    SELECT id FROM class_students 
    WHERE class_id = ? AND student_id = ?
  `).get(session.class_id, student.id);

  if (!enrollment) {
    return res.status(400).json({
      success: false,
      code: 'STUDENT_NOT_REGISTERED',
      student: { name: student.name, nim: student.nim },
      message: `STUDENT NOT REGISTERED IN THIS CLASS: ${student.name} (${student.nim}) tidak terdaftar di kelas ${session.class_name} (${session.class_code}).`,
    });
  }

  // RULE 3: Session Harus Aktif & Waktu Tidak Sebelum Start Time (TIME VALIDATION - BEFORE START)
  if (scanTimeShort < session.start_time) {
    return res.status(400).json({
      success: false,
      code: 'ATTENDANCE_SESSION_NOT_STARTED',
      student: { name: student.name, nim: student.nim },
      scan_time: fullScanTime,
      start_time: session.start_time,
      message: `ATTENDANCE SESSION NOT STARTED: Presensi belum dimulai (Mulai: ${session.start_time}, Waktu Scan: ${fullScanTime}).`,
    });
  }

  // Check if scan time has exceeded Late Until
  if (scanTimeShort > session.late_until) {
    return res.status(400).json({
      success: false,
      code: 'ATTENDANCE_PERIOD_CLOSED',
      student: { name: student.name, nim: student.nim },
      scan_time: fullScanTime,
      late_until: session.late_until,
      message: `ATTENDANCE PERIOD CLOSED: Batas akhir waktu presensi telah berakhir (${session.late_until}). Waktu scan: ${fullScanTime}.`,
    });
  }

  // RULE 5: Tidak Boleh Presensi Dua Kali (DUPLICATE CHECK)
  const existingAttendance = db.prepare(`
    SELECT * FROM attendances 
    WHERE session_id = ? AND student_id = ?
  `).get(session.id, student.id);

  if (existingAttendance) {
    return res.status(400).json({
      success: false,
      code: 'ALREADY_ATTENDED',
      student: { name: student.name, nim: student.nim },
      recorded_time: existingAttendance.scan_time,
      current_status: existingAttendance.status,
      message: `ALREADY ATTENDED: Mahasiswa ${student.name} (${student.nim}) sudah melakukan presensi sebelumnya dengan status ${existingAttendance.status} pada ${existingAttendance.scan_time}.`,
    });
  }

  // RULE 4: Waktu Menentukan Status (CLASSIFY: PRESENT vs LATE)
  let status = 'PRESENT';
  let remarks = 'Hadir tepat waktu';

  if (scanTimeShort <= session.present_until) {
    status = 'PRESENT';
    remarks = `Tepat waktu (${fullScanTime} ≤ ${session.present_until})`;
  } else if (scanTimeShort <= session.late_until) {
    status = 'LATE';
    remarks = `Terlambat (${session.present_until} < ${fullScanTime} ≤ ${session.late_until})`;
  }

  // RECORD ATTENDANCE
  try {
    const insertRes = db.prepare(`
      INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, student.id, fullScanTime, status, remarks);

    return res.status(200).json({
      success: true,
      code: 'ATTENDANCE_RECORDED',
      attendance_id: insertRes.lastInsertRowid,
      status: status,
      scan_time: fullScanTime,
      student: {
        id: student.id,
        name: student.name,
        nim: student.nim,
        major: student.major,
      },
      session: {
        code: session.session_code,
        meeting_number: session.meeting_number,
        class_name: session.class_name,
      },
      message: `Presensi Berhasil: ${student.name} tercatat ${status} (${fullScanTime}).`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      message: 'Gagal mencatat presensi: ' + err.message,
    });
  }
});

/**
 * Student Attendance History (Mahasiswa Dashboard)
 */
router.get('/my-history', authenticateToken, (req, res) => {
  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user.id);
  if (!student) {
    return res.status(404).json({ error: 'Profil mahasiswa tidak ditemukan.' });
  }

  const history = db.prepare(`
    SELECT 
      a.id as attendance_id,
      a.scan_time,
      a.status,
      a.remarks,
      a.score,
      a.score_feedback,
      a.recorded_at,
      s.session_code,
      s.meeting_number,
      s.meeting_date,
      s.start_time,
      s.present_until,
      s.late_until,
      s.end_time,
      c.code as class_code,
      c.name as class_name,
      l.name as lecturer_name
    FROM attendances a
    JOIN attendance_sessions s ON a.session_id = s.id
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE a.student_id = ?
    ORDER BY s.meeting_date DESC, a.recorded_at DESC
  `).all(student.id);

  // Statistics calculation for student
  const total = history.length;
  const present = history.filter(h => h.status === 'PRESENT').length;
  const late = history.filter(h => h.status === 'LATE').length;
  const absent = history.filter(h => h.status === 'ABSENT').length;
  const attendanceRate = total > 0 ? (((present + late) / total) * 100).toFixed(1) : 0;

  // Grade statistics
  const scoredRecords = history.filter(h => h.score !== null && h.score !== undefined);
  const gradedCount = scoredRecords.length;
  const averageScore = gradedCount > 0 
    ? (scoredRecords.reduce((sum, h) => sum + Number(h.score), 0) / gradedCount).toFixed(1) 
    : null;

  res.json({
    summary: {
      total,
      present,
      late,
      absent,
      attendanceRate,
      gradedCount,
      averageScore,
    },
    records: history,
  });
});

/**
 * Score / Grade Student Attendance Session
 * Allows Lecturer or Admin to grade a student for a specific session
 */
router.post('/score', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const { session_id, student_id, score, score_feedback } = req.body;

  if (!session_id || !student_id) {
    return res.status(400).json({ error: 'Session ID dan Student ID wajib diisi.' });
  }

  let parsedScore = null;
  if (score !== undefined && score !== null && score !== '') {
    parsedScore = parseFloat(score);
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      return res.status(400).json({ error: 'Nilai harus berupa angka antara 0 sampai 100.' });
    }
  }

  // Ensure session exists
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session tidak ditemukan.' });
  }

  // Ensure student exists
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  // Ensure student is enrolled in class (auto-enroll if not yet enrolled)
  const enrollment = db.prepare('SELECT id FROM class_students WHERE class_id = ? AND student_id = ?').get(session.class_id, student_id);
  if (!enrollment) {
    db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)').run(session.class_id, student_id);
  }

  const existing = db.prepare('SELECT id, status FROM attendances WHERE session_id = ? AND student_id = ?').get(session_id, student_id);

  try {
    if (existing) {
      db.prepare(`
        UPDATE attendances 
        SET score = ?, score_feedback = ?
        WHERE id = ?
      `).run(parsedScore, score_feedback || null, existing.id);
    } else {
      // If attendance doesn't exist yet, insert with PRESENT status by default
      const scanTime = getCurrentTimeFormatted();
      db.prepare(`
        INSERT INTO attendances (session_id, student_id, scan_time, status, remarks, score, score_feedback)
        VALUES (?, ?, ?, 'PRESENT', 'Dinilai langsung oleh Dosen/Admin', ?, ?)
      `).run(session_id, student_id, scanTime, parsedScore, score_feedback || null);
    }

    res.json({
      success: true,
      message: `Nilai sesi untuk mahasiswa ${student.name} berhasil disimpan (${parsedScore !== null ? parsedScore : 'Dihapus'}).`,
      score: parsedScore,
      score_feedback: score_feedback || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan nilai sesi: ' + err.message });
  }
});

/**
 * Manual Attendance Entry / Status Override by Lecturer or Admin
 */
router.post('/manual', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const { session_id, student_id, status, remarks } = req.body;

  if (!session_id || !student_id || !status) {
    return res.status(400).json({ error: 'Session ID, Student ID, dan Status wajib diisi.' });
  }

  if (!['PRESENT', 'LATE', 'ABSENT'].includes(status)) {
    return res.status(400).json({ error: 'Status harus bernilai PRESENT, LATE, atau ABSENT.' });
  }

  // Ensure session exists
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(session_id);
  if (!session) {
    return res.status(404).json({ error: 'Session tidak ditemukan.' });
  }

  // Ensure student exists
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  if (!student) {
    return res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
  }

  // Ensure student is enrolled in class (auto-enroll if not yet enrolled)
  const enrollment = db.prepare('SELECT id FROM class_students WHERE class_id = ? AND student_id = ?').get(session.class_id, student_id);
  if (!enrollment) {
    db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)').run(session.class_id, student_id);
  }

  const existing = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?').get(session_id, student_id);
  const scanTime = getCurrentTimeFormatted();

  try {
    if (existing) {
      db.prepare(`
        UPDATE attendances 
        SET status = ?, remarks = ?, scan_time = ?
        WHERE id = ?
      `).run(status, remarks || 'Diperbarui secara manual oleh Dosen', scanTime, existing.id);
    } else {
      db.prepare(`
        INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
        VALUES (?, ?, ?, ?, ?)
      `).run(session_id, student_id, scanTime, status, remarks || 'Dicatat manual oleh Dosen');
    }

    res.json({
      message: `Presensi mahasiswa ${student.name} berhasil disimpan sebagai ${status}.`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan presensi manual: ' + err.message });
  }
});

/**
 * Delete / Reset Attendance Record
 */
router.delete('/:id', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const attendanceId = req.params.id;
  db.prepare('DELETE FROM attendances WHERE id = ?').run(attendanceId);
  res.json({ message: 'Record presensi berhasil direset/dihapus.' });
});

module.exports = router;

