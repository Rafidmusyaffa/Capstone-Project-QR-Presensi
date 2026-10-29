const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'presensi.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
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
      status TEXT CHECK(status IN ('ACTIVE', 'CLOSED')) DEFAULT 'ACTIVE',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  seedData();
}

function seedData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) return;

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

  // 3. Students (Permanent QR Code format: QR-STD-{NIM}-{TOKEN})
  const insertStudent = db.prepare('INSERT INTO students (user_id, nim, name, major, permanent_qr_token) VALUES (?, ?, ?, ?, ?)');
  const s1 = insertStudent.run(mhs1Res.lastInsertRowid, '220101001', 'Rafid Musyaffa', 'Sistem Informasi', 'QR-STD-220101001-A9F3');
  const s2 = insertStudent.run(mhs2Res.lastInsertRowid, '220101002', 'Anisa Rahmawati', 'Sistem Informasi', 'QR-STD-220101002-B7C1');
  const s3 = insertStudent.run(mhs3Res.lastInsertRowid, '220101003', 'Dimas Pratama', 'Sistem Informasi', 'QR-STD-220101003-C4D8');
  const s4 = insertStudent.run(mhs4Res.lastInsertRowid, '220101004', 'Fajar Nugraha', 'Informatika', 'QR-STD-220101004-E2K9');

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
  const today = new Date().toISOString().slice(0, 10);
  const insertSession = db.prepare(`
    INSERT INTO attendance_sessions 
    (session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertSession.run(
    'SES-SI05-M05',
    c1.lastInsertRowid,
    5,
    today,
    '00:00',
    '23:45',
    '23:55',
    '23:59',
    'ACTIVE',
    adminRes.lastInsertRowid
  );

  console.log('Database initialized and seeded successfully.');
}

initDatabase();

module.exports = db;
