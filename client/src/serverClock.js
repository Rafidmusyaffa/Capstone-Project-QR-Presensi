// Jam resmi aplikasi = jam server dalam zona Asia/Jakarta (WIB), bukan jam perangkat.
// Selisih jam perangkat vs server disimpan sebagai offset dan diperbarui berkala.

const TIMEZONE = 'Asia/Jakarta';
let offsetMs = 0;

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export async function syncServerClock() {
  try {
    const sentAt = Date.now();
    const res = await fetch('/api/time');
    if (!res.ok) return;
    const { epoch_ms } = await res.json();
    const receivedAt = Date.now();
    // Perkiraan waktu server saat respons diterima = epoch_ms + setengah round-trip
    offsetMs = epoch_ms + (receivedAt - sentAt) / 2 - receivedAt;
  } catch {
    // Server tidak terjangkau: tetap pakai offset terakhir
  }
}

/** Tanggal & jam server saat ini -> { date: 'YYYY-MM-DD', time: 'HH:MM:SS' } (WIB) */
export function serverNowParts() {
  const p = {};
  for (const { type, value } of formatter.formatToParts(new Date(Date.now() + offsetMs))) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}
