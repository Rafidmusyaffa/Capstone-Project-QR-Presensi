const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const { startScheduler } = require('./scheduler');

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

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend Sistem Presensi Mahasiswa Berbasis QR Code aktif',
    timestamp: new Date().toISOString(),
  });
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
