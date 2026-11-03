require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const { startScheduler, syncOnRequest } = require('./scheduler');
const { nowParts, APP_TIMEZONE } = require('./time');

// Ensure db initializes
require('./db');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const classesRoutes = require('./routes/classes');
const sessionsRoutes = require('./routes/sessions');
const attendanceRoutes = require('./routes/attendance');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

// req.ip diambil dari X-Forwarded-For hanya jika dikirim proxy tepercaya:
// di Render 1 reverse proxy, di lokal hanya cloudflared/proxy di mesin yang sama (loopback),
// sehingga pengunjung dari jaringan lain tidak bisa memalsukan IP lewat header.
app.set('trust proxy', process.env.RENDER ? 1 : 'loopback');
app.disable('x-powered-by');

// Header keamanan dasar
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  });
  if (isProduction) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS hanya aktif jika CORS_ORIGIN diisi (daftar origin dipisah koma).
// Client produksi dilayani dari origin yang sama, dan Vite dev memakai proxy.
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
}

app.use(express.json({ limit: '100kb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/sessions', syncOnRequest, sessionsRoutes);
app.use('/api/attendance', syncOnRequest, attendanceRoutes);
app.use('/api/reports', reportsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend Sistem Presensi Mahasiswa Berbasis QR Code aktif',
    timestamp: new Date().toISOString(),
  });
});

// Jam resmi server (WIB) untuk sinkronisasi jam di client
app.get('/api/time', (req, res) => {
  const now = nowParts();
  res.json({ ...now, timezone: APP_TIMEZONE, epoch_ms: Date.now() });
});

// Serve client in production build if exists
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// Fallback for SPA routing in Express 5
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  }
  const indexHtml = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  next();
});

// Error handler global: semua error API dibalas JSON berbahasa Indonesia
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON', error: 'Format data yang dikirim tidak valid (JSON rusak).' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', error: 'Ukuran data yang dikirim terlalu besar.' });
  }
  console.error('[Error]', req.method, req.originalUrl, err);
  res.status(err.status || 500).json({
    code: 'INTERNAL_ERROR',
    error: 'Terjadi kesalahan pada server. Silakan coba lagi.',
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` SISTEM PRESENSI QR AKTIF & BERJALAN`);
  console.log(` - Akses via Browser : http://localhost:${PORT}`);
  console.log(` - Atau IP Loopback  : http://127.0.0.1:${PORT}`);
  console.log(`=======================================================`);
  // Start background auto closing scheduler
  startScheduler(15000);
});

module.exports = { app, server };
