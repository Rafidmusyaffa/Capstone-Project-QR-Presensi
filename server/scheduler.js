const db = require('./db');
const { nowParts, computePhase } = require('./time');

// Urutan siklus hidup sesi; status hanya boleh bergerak maju.
const STATUS_RANK = {
  SCHEDULED: 0,
  ACTIVE: 1,
  ATTENDANCE_CLOSED: 2,
  CLOSED: 3,
  FINALIZED: 4,
};

/**
 * Tutup sesi, catat ABSENT untuk mahasiswa yang belum tercatat, lalu FINALIZED.
 * Semua langkah dalam satu transaksi.
 * @returns {number} jumlah mahasiswa yang dicatat ABSENT
 */
function finalizeSession(sessionId, now = nowParts(), remarks = 'Finalisasi otomatis: Mahasiswa tidak melakukan presensi.') {
  db.exec('BEGIN');
  try {
    const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId);
    if (!session || session.status === 'FINALIZED') {
      db.exec('COMMIT');
      return 0;
    }

    db.prepare("UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = ?").run(sessionId);

    const result = db.prepare(`
      INSERT INTO attendances (session_id, student_id, scan_time, status, remarks)
      SELECT ?, cs.student_id, '-', 'ABSENT', ?
      FROM class_students cs
      WHERE cs.class_id = ?
        AND cs.student_id NOT IN (SELECT student_id FROM attendances WHERE session_id = ?)
    `).run(sessionId, remarks, session.class_id, sessionId);

    db.prepare("UPDATE attendance_sessions SET status = 'FINALIZED', finalized_at = ? WHERE id = ?")
      .run(`${now.date} ${now.time}`, sessionId);

    db.exec('COMMIT');
    return Number(result.changes);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Sinkronkan status semua sesi non-FINALIZED dengan fase waktunya.
 * Sesi yang fasenya CLOSED langsung difinalisasi.
 */
function syncSessionStatuses(now = nowParts()) {
  const sessions = db.prepare("SELECT * FROM attendance_sessions WHERE status != 'FINALIZED'").all();
  const updateStatus = db.prepare('UPDATE attendance_sessions SET status = ? WHERE id = ?');

  for (const session of sessions) {
    const phase = computePhase(session, now);

    if (phase === 'CLOSED' || session.status === 'CLOSED') {
      const absentCount = finalizeSession(session.id, now);
      console.log(`[Automatic Session Closing] Sesi ${session.session_code} FINALIZED. ${absentCount} mahasiswa dicatat ABSENT.`);
    } else if (STATUS_RANK[phase] > STATUS_RANK[session.status]) {
      updateStatus.run(phase, session.id);
    }
  }
}

function safeSync() {
  try {
    syncSessionStatuses();
  } catch (err) {
    console.error('[Automatic Session Closing] Error saat sinkronisasi status sesi:', err.message);
  }
}

/**
 * Middleware: sinkronkan status sebelum melayani request, karena server
 * (mis. Render free) bisa tidur sehingga interval tidak berjalan.
 */
function syncOnRequest(req, res, next) {
  safeSync();
  next();
}

function startScheduler(intervalMs = 15000) {
  console.log(`Automatic Session Closing scheduler aktif (interval: ${intervalMs / 1000} detik).`);
  safeSync();
  return setInterval(safeSync, intervalMs);
}

module.exports = {
  finalizeSession,
  syncSessionStatuses,
  syncOnRequest,
  startScheduler,
};
