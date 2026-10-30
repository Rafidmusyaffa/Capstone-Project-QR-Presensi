/**
 * Helper otorisasi berbasis kepemilikan kelas.
 */
const db = require('./db');

/**
 * Admin selalu boleh; dosen hanya untuk kelas dengan lecturer_id miliknya.
 */
function canManageClass(user, classId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'dosen') return false;

  const row = db.prepare(`
    SELECT 1 FROM classes c
    JOIN lecturers l ON c.lecturer_id = l.id
    WHERE c.id = ? AND l.user_id = ?
  `).get(classId, user.id);
  return !!row;
}

/**
 * Pengelola kelas, atau mahasiswa yang terdaftar di kelas tersebut.
 */
function canViewClass(user, classId) {
  if (canManageClass(user, classId)) return true;
  if (!user || user.role !== 'mahasiswa') return false;

  const row = db.prepare(`
    SELECT 1 FROM class_students cs
    JOIN students s ON cs.student_id = s.id
    WHERE cs.class_id = ? AND s.user_id = ?
  `).get(classId, user.id);
  return !!row;
}

function isEnrolled(classId, studentId) {
  return !!db.prepare('SELECT 1 FROM class_students WHERE class_id = ? AND student_id = ?').get(classId, studentId);
}

/**
 * Hapus permanent_qr_token dari baris mahasiswa kecuali untuk admin.
 * (Pemilik QR melihat tokennya sendiri lewat /api/auth/me.)
 */
function hideQrToken(user, rows) {
  if (user && user.role === 'admin') return rows;
  const strip = ({ permanent_qr_token, ...rest }) => rest;
  return Array.isArray(rows) ? rows.map(strip) : strip(rows);
}

function forbidden(res, message = 'Akses terlarang: Anda tidak mengelola kelas ini.') {
  return res.status(403).json({ success: false, code: 'FORBIDDEN', error: message, message });
}

module.exports = {
  canManageClass,
  canViewClass,
  isEnrolled,
  hideQrToken,
  forbidden,
};
