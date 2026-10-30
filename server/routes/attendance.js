const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');

const { nowParts, normTime, isValidDate, isValidTime, computePhase } = require('../time');
const { canManageClass, isEnrolled, forbidden } = require('../access');

/**
 * Tentukan waktu scan. simulated_now ('YYYY-MM-DDTHH:MM[:SS]') atau
 * simulated_time ('HH:MM[:SS]', tanggal = meeting_date) hanya dipakai jika
 * ALLOW_SIMULATED_TIME=true; selain itu selalu jam server.
 * @returns {{date: string, time: string} | null} null jika input simulasi tidak valid
 */
function resolveScanNow(body, session) {
  if (process.env.ALLOW_SIMULATED_TIME !== 'true') return nowParts();

  const { simulated_now, simulated_time } = body;
  if (simulated_now) {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/.exec(String(simulated_now).trim());
    if (!m || !isValidDate(m[1]) || !isValidTime(m[2])) return null;
    return { date: m[1], time: normTime(m[2]) };
  }
  if (simulated_time) {
    if (!isValidTime(String(simulated_time))) return null;
    return { date: session.meeting_date, time: normTime(simulated_time) };
  }
  return nowParts();
}

/**
 * QR SCAN ENDPOINT
 * Pipeline: IDENTIFY -> VALIDATE -> CLASSIFY -> RECORD
 */
router.post('/scan', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const { session_id, qr_data } = req.body;

  if (!session_id || !qr_data || typeof qr_data !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_DATA',
      message: 'Session ID dan Data QR Code wajib disertakan.',
    });
  }

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

  if (!canManageClass(req.user, session.class_id)) {
    return forbidden(res);
  }

  const scanNow = resolveScanNow(req.body, session);
  if (!scanNow) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_SIMULATED_TIME',
      message: 'Format waktu simulasi tidak valid (gunakan YYYY-MM-DDTHH:MM:SS atau HH:MM:SS).',
    });
  }
  const scanTime = scanNow.time;

  // BR-03/BR-08: Sesi yang sudah ditutup/difinalisasi tidak menerima scan
  if (session.status === 'CLOSED' || session.status === 'FINALIZED') {
    return res.status(400).json({
      success: false,
      code: 'SESSION_CLOSED',
      message: 'SESSION CLOSED: Sesi presensi ini telah ditutup.',
    });
  }

  // BR-01: QR hanya identitas, dicocokkan ke permanent_qr_token
  let searchToken = qr_data.trim();
  try {
    const parsed = JSON.parse(qr_data);
    if (parsed && typeof parsed.permanent_qr_token === 'string') searchToken = parsed.permanent_qr_token.trim();
  } catch (e) {
    // Keep raw string token
  }

  const student = db.prepare(`
    SELECT s.*, u.username
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.permanent_qr_token = ?
  `).get(searchToken);

  if (!student) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_QR_CODE',
      message: 'INVALID QR CODE: QR Code tidak dikenali dalam sistem mahasiswa.',
    });
  }

  // BR-01: Mahasiswa harus berstatus aktif
  if (!student.is_active) {
    return res.status(400).json({
      success: false,
      code: 'STUDENT_INACTIVE',
      student: { name: student.name, nim: student.nim },
      message: `STUDENT INACTIVE: ${student.name} (${student.nim}) berstatus nonaktif dan tidak dapat melakukan presensi.`,
    });
  }

  // BR-02: Mahasiswa harus terdaftar di kelas sesi ini
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

  // BR-03/BR-06: Validasi tanggal & jam terhadap fase sesi
  const phase = computePhase(session, scanNow);
  const scanLabel = `${scanNow.date} ${scanTime}`;

  if (phase === 'SCHEDULED') {
    return res.status(400).json({
      success: false,
      code: 'SESSION_NOT_STARTED',
      student: { name: student.name, nim: student.nim },
      scan_time: scanTime,
      start_time: session.start_time,
      message: `SESSION NOT STARTED: Presensi belum dimulai (Mulai: ${session.meeting_date} ${normTime(session.start_time)}, Waktu Scan: ${scanLabel}).`,
    });
  }

  if (phase === 'ATTENDANCE_CLOSED') {
    return res.status(400).json({
      success: false,
      code: 'ATTENDANCE_PERIOD_CLOSED',
      student: { name: student.name, nim: student.nim },
      scan_time: scanTime,
      late_until: session.late_until,
      message: `ATTENDANCE PERIOD CLOSED: Batas akhir waktu presensi telah berakhir (${normTime(session.late_until)}). Waktu scan: ${scanLabel}.`,
    });
  }

  if (phase === 'CLOSED') {
    return res.status(400).json({
      success: false,
      code: 'SESSION_CLOSED',
      message: `SESSION CLOSED: Sesi presensi ini telah berakhir (Selesai: ${session.meeting_date} ${normTime(session.end_time)}).`,
    });
  }

  // BR-07: Tidak boleh presensi dua kali
  const alreadyAttended = (existing) => res.status(409).json({
    success: false,
    code: 'ALREADY_ATTENDED',
    student: { name: student.name, nim: student.nim },
    recorded_time: existing?.scan_time,
    current_status: existing?.status,
    message: `ALREADY ATTENDED: Mahasiswa ${student.name} (${student.nim}) sudah melakukan presensi sebelumnya` +
      (existing ? ` dengan status ${existing.status} pada ${existing.scan_time}.` : '.'),
  });

  const existingAttendance = db.prepare(`
    SELECT * FROM attendances
    WHERE session_id = ? AND student_id = ?
  `).get(session.id, student.id);

  if (existingAttendance) {
    return alreadyAttended(existingAttendance);
  }

  // BR-04/BR-05: Klasifikasi PRESENT vs LATE dengan presisi detik
  const presentUntil = normTime(session.present_until);
  const lateUntil = normTime(session.late_until);
  let status;
  let remarks;

  if (scanTime <= presentUntil) {
    status = 'PRESENT';
    remarks = `Tepat waktu (${scanTime} ≤ ${presentUntil})`;
  } else {
    status = 'LATE';
    remarks = `Terlambat (${presentUntil} < ${scanTime} ≤ ${lateUntil})`;
  }

  // RECORD ATTENDANCE
  try {
    const insertRes = db.prepare(`
      INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, student.id, scanTime, status, remarks);

    return res.status(200).json({
      success: true,
      code: 'ATTENDANCE_RECORDED',
      attendance_id: insertRes.lastInsertRowid,
      status: status,
      scan_time: scanTime,
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
      message: `Presensi Berhasil: ${student.name} tercatat ${status} (${scanTime}).`,
    });
  } catch (err) {
    // Scan bersamaan: constraint UNIQUE(session_id, student_id) yang menolak
    if (/UNIQUE constraint failed/i.test(err.message)) {
      const existing = db.prepare('SELECT * FROM attendances WHERE session_id = ? AND student_id = ?').get(session.id, student.id);
      return alreadyAttended(existing);
    }
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
 * Validasi bersama untuk /score dan /manual: sesi ada, pemanggil mengelola kelasnya,
 * mahasiswa ada dan terdaftar di kelas (tanpa auto-enroll).
 * Mengirim respons error dan mengembalikan null jika gagal.
 */
function loadSessionAndStudent(req, res, sessionId, studentId) {
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session tidak ditemukan.' });
    return null;
  }

  if (!canManageClass(req.user, session.class_id)) {
    forbidden(res);
    return null;
  }

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) {
    res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
    return null;
  }

  if (!isEnrolled(session.class_id, student.id)) {
    res.status(400).json({
      success: false,
      code: 'STUDENT_NOT_REGISTERED',
      error: `${student.name} (${student.nim}) tidak terdaftar di kelas sesi ini.`,
    });
    return null;
  }

  return { session, student };
}

// Rekap sesi FINALIZED bersifat final: status presensi tidak boleh diubah/dihapus lagi
function sessionFinalized(res) {
  return res.status(409).json({
    success: false,
    code: 'SESSION_FINALIZED',
    error: 'Sesi sudah difinalisasi. Status presensi tidak dapat diubah lagi.',
  });
}

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

  const check = loadSessionAndStudent(req, res, session_id, student_id);
  if (!check) return;
  const { student } = check;

  // Nilai hanya untuk record presensi yang sudah ada; tidak membuat status presensi baru
  const existing = db.prepare('SELECT id, status FROM attendances WHERE session_id = ? AND student_id = ?').get(session_id, student_id);
  if (!existing) {
    return res.status(404).json({
      success: false,
      code: 'ATTENDANCE_NOT_FOUND',
      error: `Mahasiswa ${student.name} belum memiliki record presensi pada sesi ini. Catat presensinya terlebih dahulu.`,
    });
  }

  try {
    db.prepare(`
      UPDATE attendances
      SET score = ?, score_feedback = ?
      WHERE id = ?
    `).run(parsedScore, score_feedback || null, existing.id);

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

  const check = loadSessionAndStudent(req, res, session_id, student_id);
  if (!check) return;
  const { session, student } = check;

  if (session.status === 'FINALIZED') return sessionFinalized(res);

  const existing = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?').get(session_id, student_id);
  // ABSENT tidak punya waktu scan; disamakan dengan pencatatan ABSENT oleh scheduler
  const scanTime = status === 'ABSENT' ? '-' : nowParts().time;

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
    if (/UNIQUE constraint failed/i.test(err.message)) {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_ATTENDED',
        error: `Presensi ${student.name} baru saja tercatat oleh proses lain. Muat ulang lalu coba lagi.`,
      });
    }
    res.status(500).json({ error: 'Gagal menyimpan presensi manual: ' + err.message });
  }
});

/**
 * Delete / Reset Attendance Record
 */
router.delete('/:id', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const attendance = db.prepare(`
    SELECT a.id, s.class_id, s.status as session_status
    FROM attendances a
    JOIN attendance_sessions s ON a.session_id = s.id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!attendance) {
    return res.status(404).json({ error: 'Record presensi tidak ditemukan.' });
  }

  if (!canManageClass(req.user, attendance.class_id)) {
    return forbidden(res);
  }

  if (attendance.session_status === 'FINALIZED') return sessionFinalized(res);

  db.prepare('DELETE FROM attendances WHERE id = ?').run(attendance.id);
  res.json({ message: 'Record presensi berhasil direset/dihapus.' });
});

module.exports = router;

