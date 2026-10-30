/**
 * Helper waktu server. Semua logika presensi memakai zona APP_TIMEZONE
 * (default Asia/Jakarta), bukan jam lokal mesin atau UTC.
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Tanggal & jam saat ini di APP_TIMEZONE -> { date: 'YYYY-MM-DD', time: 'HH:MM:SS' }
 */
function nowParts(at = new Date()) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(at)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}

/**
 * 'HH:MM' -> 'HH:MM:00', 'HH:MM:SS' dibiarkan.
 */
function normTime(t) {
  const s = String(t).trim();
  return s.length === 5 ? `${s}:00` : s;
}

function isValidDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

function isValidTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t.trim());
}

/**
 * Fase sesi berdasarkan meeting_date dan aturan waktu (presisi detik).
 * @param {object} session - baris attendance_sessions
 * @param {{date: string, time: string}} now - hasil nowParts()
 * @returns {'SCHEDULED'|'ACTIVE'|'ATTENDANCE_CLOSED'|'CLOSED'}
 */
function computePhase(session, now) {
  if (now.date < session.meeting_date) return 'SCHEDULED';
  if (now.date > session.meeting_date) return 'CLOSED';

  const t = normTime(now.time);
  if (t < normTime(session.start_time)) return 'SCHEDULED';
  if (t <= normTime(session.late_until)) return 'ACTIVE';
  if (t <= normTime(session.end_time)) return 'ATTENDANCE_CLOSED';
  return 'CLOSED';
}

module.exports = {
  APP_TIMEZONE,
  nowParts,
  normTime,
  isValidDate,
  isValidTime,
  computePhase,
};
