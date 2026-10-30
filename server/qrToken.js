const crypto = require('node:crypto');

/**
 * Token QR permanen mahasiswa: 'PQR-' + 128 bit acak (base64url).
 * Tidak diturunkan dari NIM sehingga tidak bisa ditebak.
 */
function generateQrToken() {
  return 'PQR-' + crypto.randomBytes(16).toString('base64url');
}

module.exports = { generateQrToken };
