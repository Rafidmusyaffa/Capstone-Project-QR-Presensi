const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('../auth');
const { canManageClass, forbidden } = require('../access');

// Dashboard Overview. Admin: seluruh data; dosen: hanya kelas yang diampu.
router.get('/dashboard', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const isLecturer = req.user.role === 'dosen';
  // Subquery id kelas yang boleh dilihat; untuk admin tanpa batasan
  const classScope = isLecturer
    ? 'SELECT c.id FROM classes c JOIN lecturers l ON c.lecturer_id = l.id WHERE l.user_id = ?'
    : 'SELECT id FROM classes';
  const scopeParams = isLecturer ? [req.user.id] : [];

  const totalStudents = isLecturer
    ? db.prepare(`SELECT COUNT(DISTINCT student_id) as count FROM class_students WHERE class_id IN (${classScope})`).get(...scopeParams).count
    : db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const totalLecturers = db.prepare('SELECT COUNT(*) as count FROM lecturers').get().count;
  const totalClasses = db.prepare(`SELECT COUNT(*) as count FROM classes WHERE id IN (${classScope})`).get(...scopeParams).count;
  const activeSessions = db.prepare(`
    SELECT COUNT(*) as count FROM attendance_sessions
    WHERE status = 'ACTIVE' AND class_id IN (${classScope})
  `).get(...scopeParams).count;

  // Total attendance counts
  const attendanceStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as late,
      SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent,
      COUNT(*) as total
    FROM attendances a
    JOIN attendance_sessions ses ON a.session_id = ses.id
    WHERE ses.class_id IN (${classScope})
  `).get(...scopeParams);

  // Recent attendance scans
  const recentAttendances = db.prepare(`
    SELECT 
      a.id, a.scan_time, a.status, a.recorded_at,
      s.name as student_name, s.nim as student_nim,
      c.code as class_code, c.name as class_name,
      ses.meeting_number
    FROM attendances a
    JOIN students s ON a.student_id = s.id
    JOIN attendance_sessions ses ON a.session_id = ses.id
    JOIN classes c ON ses.class_id = c.id
    WHERE ses.class_id IN (${classScope})
    ORDER BY a.id DESC
    LIMIT 10
  `).all(...scopeParams);

  res.json({
    metrics: {
      totalStudents,
      totalLecturers,
      totalClasses,
      activeSessions,
      present: attendanceStats.present || 0,
      late: attendanceStats.late || 0,
      absent: attendanceStats.absent || 0,
      totalAttendanceLogs: attendanceStats.total || 0,
    },
    recentAttendances,
  });
});

// Comprehensive Class Attendance Recap Report
router.get('/class/:classId', authenticateToken, requireRole(['admin', 'dosen']), (req, res) => {
  const classId = req.params.classId;
  const cls = db.prepare(`
    SELECT c.*, l.name as lecturer_name, l.nip as lecturer_nip
    FROM classes c
    LEFT JOIN lecturers l ON c.lecturer_id = l.id
    WHERE c.id = ?
  `).get(classId);

  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  if (!canManageClass(req.user, classId)) {
    return forbidden(res);
  }

  // Get all sessions for this class
  const sessions = db.prepare(`
    SELECT id, meeting_number, meeting_date, status 
    FROM attendance_sessions 
    WHERE class_id = ? 
    ORDER BY meeting_number ASC
  `).all(classId);

  // Get all enrolled students
  const students = db.prepare(`
    SELECT s.id, s.nim, s.name, s.major
    FROM students s
    JOIN class_students cs ON s.id = cs.student_id
    WHERE cs.class_id = ?
    ORDER BY s.nim ASC
  `).all(classId);

  // Semua presensi kelas diambil sekali (bukan satu query per mahasiswa per sesi)
  const attendanceByKey = new Map();
  db.prepare(`
    SELECT a.session_id, a.student_id, a.status, a.scan_time, a.score, a.score_feedback
    FROM attendances a
    JOIN attendance_sessions ses ON a.session_id = ses.id
    WHERE ses.class_id = ?
  `).all(classId).forEach((att) => attendanceByKey.set(`${att.session_id}:${att.student_id}`, att));

  // For each student, get attendance matrix for each session
  const recap = students.map(st => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let totalScore = 0;
    let scoredCount = 0;

    const sessionAttendance = sessions.map(ses => {
      const att = attendanceByKey.get(`${ses.id}:${st.id}`);

      if (att) {
        if (att.status === 'PRESENT') presentCount++;
        else if (att.status === 'LATE') lateCount++;
        else if (att.status === 'ABSENT') absentCount++;
        if (att.score !== null && att.score !== undefined) {
          totalScore += Number(att.score);
          scoredCount++;
        }
        return { 
          sessionId: ses.id, 
          meeting_number: ses.meeting_number, 
          status: att.status, 
          scan_time: att.scan_time,
          score: att.score,
          score_feedback: att.score_feedback
        };
      } else {
        return { 
          sessionId: ses.id, 
          meeting_number: ses.meeting_number, 
          status: 'NOT_RECORDED', 
          scan_time: '-',
          score: null,
          score_feedback: null
        };
      }
    });

    const totalSessions = sessions.length;
    const rate = totalSessions > 0 ? (((presentCount + lateCount) / totalSessions) * 100).toFixed(1) : 0;
    const averageScore = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : null;

    return {
      student: st,
      presentCount,
      lateCount,
      absentCount,
      attendanceRate: rate,
      totalScore,
      scoredCount,
      averageScore,
      sessions: sessionAttendance,
    };
  });

  res.json({
    classInfo: cls,
    sessions,
    recap,
  });
});

module.exports = router;
