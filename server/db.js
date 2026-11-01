const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { nowParts, computePhase } = require('./time');
const { generateQrToken } = require('./qrToken');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'presensi.db');
const SEED_FILE = path.join(__dirname, 'seed-data.json');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');
// Tunggu (bukan langsung gagal) jika DB sedang dikunci proses lain, mis. test suite
db.exec('PRAGMA busy_timeout = 5000;');

const SESSION_STATUS_CHECK = "('SCHEDULED', 'ACTIVE', 'ATTENDANCE_CLOSED', 'CLOSED', 'FINALIZED')";

/**
 * Migrasi DB lama yang hanya mengenal status ACTIVE/CLOSED.
 * SQLite tidak bisa mengubah CHECK constraint, jadi tabel dibangun ulang.
 * Sesi ACTIVE lama dijadikan SCHEDULED; scheduler akan memajukannya sesuai jam.
 */
function migrateSessionStatuses() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attendance_sessions'").get();
  if (!row || row.sql.includes('FINALIZED')) return;

  console.log('Migrasi tabel attendance_sessions ke 5 status sesi...');
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE attendance_sessions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_code TEXT UNIQUE NOT NULL,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        meeting_number INTEGER NOT NULL,
        meeting_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        present_until TEXT NOT NULL,
        late_until TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT CHECK(status IN ${SESSION_STATUS_CHECK}) DEFAULT 'SCHEDULED',
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalized_at DATETIME DEFAULT NULL
      );
      INSERT INTO attendance_sessions_new
        (id, session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by, created_at)
      SELECT id, session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time,
        CASE WHEN status = 'CLOSED' THEN 'CLOSED' ELSE 'SCHEDULED' END, created_by, created_at
      FROM attendance_sessions;
      DROP TABLE attendance_sessions;
      ALTER TABLE attendance_sessions_new RENAME TO attendance_sessions;
    `);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function initDatabase() {
  migrateSessionStatuses();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'dosen', 'mahasiswa')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lecturers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nip TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nim TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      major TEXT NOT NULL,
      permanent_qr_token TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      lecturer_id INTEGER REFERENCES lecturers(id) ON DELETE SET NULL,
      academic_year TEXT NOT NULL,
      semester TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS class_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_code TEXT UNIQUE NOT NULL,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      meeting_number INTEGER NOT NULL,
      meeting_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      present_until TEXT NOT NULL,
      late_until TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT CHECK(status IN ${SESSION_STATUS_CHECK}) DEFAULT 'SCHEDULED',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finalized_at DATETIME DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      scan_time TEXT NOT NULL,
      status TEXT CHECK(status IN ('PRESENT', 'LATE', 'ABSENT')) NOT NULL,
      remarks TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, student_id)
    );
  `);

  // Safe migrations for session score / grading
  try { db.exec('ALTER TABLE attendances ADD COLUMN score REAL DEFAULT NULL;'); } catch (e) {}
  try { db.exec('ALTER TABLE attendances ADD COLUMN score_feedback TEXT DEFAULT NULL;'); } catch (e) {}
  // BR-01: mahasiswa nonaktif tidak bisa presensi, tetapi riwayatnya tetap tersimpan
  try { db.exec('ALTER TABLE students ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;'); } catch (e) {}
  // Nomor pertemuan unik per kelas (gagal diam-diam jika DB lama sudah berisi data dobel)
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_class_meeting ON attendance_sessions(class_id, meeting_number);'); } catch (e) {}

  seedData();
}

/** Insert baris apa adanya (termasuk id) berdasarkan nama kolom di JSON. */
function insertRows(table, rows) {
  for (const row of rows) {
    const columns = Object.keys(row);
    const names = columns.map((column) => `"${column}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    db.prepare(`INSERT INTO ${table} (${names}) VALUES (${placeholders})`).run(...columns.map((column) => row[column]));
  }
}

/** Satu sesi sepanjang hari ini untuk Capstone Project, supaya scan bisa langsung dicoba saat demo. */
function insertTodayDemoSession(seed) {
  const demoClass = seed.classes.find((c) => c.name === 'Capstone Project');
  const admin = seed.users.find((u) => u.role === 'admin');
  if (!demoClass || !admin) {
    console.warn('Sesi demo hari ini dilewati: kelas Capstone Project atau akun admin tidak ada di seed-data.json.');
    return;
  }

  const meetingNumbers = seed.attendance_sessions.filter((s) => s.class_id === demoClass.id).map((s) => s.meeting_number);
  const meetingNumber = Math.max(0, ...meetingNumbers) + 1;
  const now = nowParts();
  const demoSession = {
    meeting_date: now.date,
    start_time: '00:00',
    present_until: '23:45',
    late_until: '23:55',
    end_time: '23:59',
  };
  const classCode = demoClass.code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  insertRows('attendance_sessions', [{
    session_code: `SES-${classCode}-M${String(meetingNumber).padStart(2, '0')}-DEMO`,
    class_id: demoClass.id,
    meeting_number: meetingNumber,
    ...demoSession,
    status: computePhase(demoSession, now),
    created_by: admin.id,
  }]);
}

/** Isi DB dari seed-data.json (hasil `npm run seed:export`) dalam satu transaksi. */
function seedFromFile() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const passwords = {
    admin: bcrypt.hashSync('admin123', 10),
    dosen: bcrypt.hashSync('dosen123', 10),
    mahasiswa: bcrypt.hashSync('mhs123', 10),
  };

  db.exec('BEGIN');
  try {
    // Data asli bisa berisi nomor pertemuan ganda dari sebelum index ini ada, jadi
    // index dilepas selama impor. API tetap menolak duplikat lewat pengecekannya sendiri.
    db.exec('DROP INDEX IF EXISTS idx_sessions_class_meeting;');

    insertRows('users', seed.users.map((user) => ({ ...user, password_hash: passwords[user.role] })));
    for (const table of ['lecturers', 'students', 'classes', 'class_students', 'schedules', 'attendance_sessions', 'attendances']) {
      insertRows(table, seed[table]);
    }
    insertTodayDemoSession(seed);

    try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_class_meeting ON attendance_sessions(class_id, meeting_number);'); } catch (e) {}

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`Data demo dimuat dari seed-data.json (${seed.students.length} mahasiswa, ${seed.attendance_sessions.length} sesi + 1 sesi demo hari ini, ${seed.attendances.length} presensi).`);
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) return;
  // Data demo aktif secara default (Render free: DB di-seed ulang tiap start); SEED_DEMO=false mematikannya
  if (process.env.SEED_DEMO === 'false') return;

  // SEED_SOURCE=builtin memaksa seed bawaan di bawah (dipakai npm test)
  if (process.env.SEED_SOURCE !== 'builtin' && fs.existsSync(SEED_FILE)) {
    seedFromFile();
    return;
  }

  console.log('Seeding initial data for Presensi QR System...');

  // Hash standard demo passwords
  const adminPass = bcrypt.hashSync('admin123', 10);
  const dosenPass = bcrypt.hashSync('dosen123', 10);
  const mhsPass = bcrypt.hashSync('mhs123', 10);

  // 1. Users
  const insertUser = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  
  const adminRes = insertUser.run('admin', adminPass, 'admin');
  const dosen1Res = insertUser.run('dosen1', dosenPass, 'dosen');
  const dosen2Res = insertUser.run('dosen2', dosenPass, 'dosen');
  const mhs1Res = insertUser.run('mahasiswa1', mhsPass, 'mahasiswa');
  const mhs2Res = insertUser.run('mahasiswa2', mhsPass, 'mahasiswa');
  const mhs3Res = insertUser.run('mahasiswa3', mhsPass, 'mahasiswa');
  const mhs4Res = insertUser.run('mahasiswa4', mhsPass, 'mahasiswa');

  // 2. Lecturers
  const insertLecturer = db.prepare('INSERT INTO lecturers (user_id, nip, name, email) VALUES (?, ?, ?, ?)');
  const l1 = insertLecturer.run(dosen1Res.lastInsertRowid, '198001012005011001', 'Dr. Budi Santoso, M.Kom', 'budi.santoso@univ.ac.id');
  const l2 = insertLecturer.run(dosen2Res.lastInsertRowid, '198505122008012002', 'Siti Aminah, S.Kom., M.T', 'siti.aminah@univ.ac.id');

  // 3. Students (token QR acak 'PQR-…', format sama dengan mahasiswa baru)
  const insertStudent = db.prepare('INSERT INTO students (user_id, nim, name, major, permanent_qr_token) VALUES (?, ?, ?, ?, ?)');
  const s1 = insertStudent.run(mhs1Res.lastInsertRowid, '220101001', 'Rafid Musyaffa', 'Sistem Informasi', generateQrToken());
  const s2 = insertStudent.run(mhs2Res.lastInsertRowid, '220101002', 'Muhammad Syahrul', 'Sistem Informasi', generateQrToken());
  const s3 = insertStudent.run(mhs3Res.lastInsertRowid, '220101003', 'Lina Dewi Pakpahan', 'Sistem Informasi', generateQrToken());
  const s4 = insertStudent.run(mhs4Res.lastInsertRowid, '220101004', 'Fajar Nugraha', 'Informatika', generateQrToken());

  // 4. Classes
  const insertClass = db.prepare('INSERT INTO classes (code, name, lecturer_id, academic_year, semester) VALUES (?, ?, ?, ?, ?)');
  const c1 = insertClass.run('SI-05', 'Database Systems', l1.lastInsertRowid, '2026/2027', 'Ganjil');
  const c2 = insertClass.run('SI-07', 'Pemrograman Web Lanjut', l2.lastInsertRowid, '2026/2027', 'Ganjil');

  // 5. Enrollments (Class Students)
  const insertEnrollment = db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)');
  // SI-05 enrolled: s1, s2, s3 (s4 is registered in another class to test Rule 2: WRONG CLASS!)
  insertEnrollment.run(c1.lastInsertRowid, s1.lastInsertRowid);
  insertEnrollment.run(c1.lastInsertRowid, s2.lastInsertRowid);
  insertEnrollment.run(c1.lastInsertRowid, s3.lastInsertRowid);

  // SI-07 enrolled: s2, s4
  insertEnrollment.run(c2.lastInsertRowid, s2.lastInsertRowid);
  insertEnrollment.run(c2.lastInsertRowid, s4.lastInsertRowid);

  // 6. Schedules
  const insertSchedule = db.prepare('INSERT INTO schedules (class_id, day_of_week, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)');
  insertSchedule.run(c1.lastInsertRowid, 'Rabu', '18:00', '20:00', 'Lab Komputer 3');
  insertSchedule.run(c2.lastInsertRowid, 'Kamis', '13:00', '15:30', 'Ruang Teori 204');

  // 7. Initial Active Attendance Session for Testing & Demonstration
  // Let's create an active session for SI-05 meeting 5 with broad flexible test hours or current date
  const now = nowParts();
  const insertSession = db.prepare(`
    INSERT INTO attendance_sessions 
    (session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const demoSession = {
    meeting_date: now.date,
    start_time: '00:00',
    present_until: '23:45',
    late_until: '23:55',
    end_time: '23:59',
  };
  insertSession.run(
    'SES-SI05-M05',
    c1.lastInsertRowid,
    5,
    demoSession.meeting_date,
    demoSession.start_time,
    demoSession.present_until,
    demoSession.late_until,
    demoSession.end_time,
    computePhase(demoSession, now),
    adminRes.lastInsertRowid
  );

  console.log('Database initialized and seeded successfully.');
}

initDatabase();

module.exports = db;
