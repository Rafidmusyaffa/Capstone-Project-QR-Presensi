// Penanganan error JavaScript global.
// "Script error." tanpa file/baris berasal dari skrip lintas-origin (mis. disisipkan browser bawaan
// aplikasi chat atau ekstensi), bukan dari aplikasi ini: cukup dicatat di console, tidak ditampilkan.
// Error asli dari aplikasi diteruskan sebagai event agar DialogProvider menampilkan toast singkat.
export const APP_ERROR_EVENT = 'app:error';

const TOAST_COOLDOWN_MS = 10_000;
let lastReportedAt = 0;

function isFromThisApp(source) {
  return typeof source === 'string' && source.includes(window.location.origin);
}

function report(error) {
  console.error('[Aplikasi] Error tidak tertangani:', error);
  const now = Date.now();
  if (now - lastReportedAt < TOAST_COOLDOWN_MS) return;
  lastReportedAt = now;
  window.dispatchEvent(new CustomEvent(APP_ERROR_EVENT));
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    if (!isFromThisApp(event.filename)) {
      console.warn('[Aplikasi] Error dari skrip luar diabaikan:', event.message);
      return;
    }
    report(event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!isFromThisApp(event.reason?.stack)) {
      console.warn('[Aplikasi] Promise ditolak dari luar aplikasi diabaikan:', event.reason);
      return;
    }
    report(event.reason);
  });
}
