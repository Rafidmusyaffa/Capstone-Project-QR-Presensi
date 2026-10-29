const db = require('./db');

/**
 * Checks all active attendance sessions and automatically closes them
 * if current time has passed the session's end_time, then auto-finalizes ABSENT students.
 */
function checkAndCloseExpiredSessions() {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    // Find active sessions that should be closed:
    // (meeting_date < today) OR (meeting_date = today AND end_time <= currentTimeStr)
    const expiredSessions = db.prepare(`
      SELECT * FROM attendance_sessions 
      WHERE status = 'ACTIVE' 
        AND (meeting_date < ? OR (meeting_date = ? AND end_time <= ?))
    `).all(today, today, currentTimeStr);

    for (const session of expiredSessions) {
      console.log(`[Automatic Session Closing] Menutup sesi ${session.session_code} (End Time: ${session.end_time}, Waktu sekarang: ${currentTimeStr})...`);

      // 1. Mark session as CLOSED
      db.prepare("UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = ?").run(session.id);

      // 2. Finalize unrecorded students as ABSENT
      const unrecorded = db.prepare(`
        SELECT cs.student_id 
        FROM class_students cs
        WHERE cs.class_id = ? 
          AND cs.student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
      `).all(session.class_id, session.id);

      const insertAbsent = db.prepare(`
        INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
        VALUES (?, ?, '-', 'ABSENT', 'Automatic Closing: Difinalisasi sebagai ABSENT karena tidak melakukan scan.')
      `);

      for (const s of unrecorded) {
        insertAbsent.run(session.id, s.student_id);
      }

      console.log(`[Automatic Session Closing] Sesi ${session.session_code} CLOSED. ${unrecorded.length} mahasiswa difinalisasi sebagai ABSENT.`);
    }
  } catch (err) {
    console.error('[Automatic Session Closing] Error saat pengecekan otomatis:', err.message);
  }
}

function startScheduler(intervalMs = 10000) {
  console.log(`Automatic Session Closing scheduler aktif (interval: ${intervalMs / 1000} detik).`);
  // Run immediate initial check
  checkAndCloseExpiredSessions();
  // Set repeating interval
  return setInterval(checkAndCloseExpiredSessions, intervalMs);
}

module.exports = {
  checkAndCloseExpiredSessions,
  startScheduler,
};
