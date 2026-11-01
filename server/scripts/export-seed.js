// Ekspor isi server/presensi.db ke server/seed-data.json untuk seed versi online.
// Repo ini publik: password_hash asli tidak pernah ikut diekspor dan NIM disamarkan.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SERVER_DIR = path.join(__dirname, '..');
const DB_FILE = path.join(SERVER_DIR, 'presensi.db');
const OUTPUT_FILE = path.join(SERVER_DIR, 'seed-data.json');
const PASSWORD_PLACEHOLDER = '__DEMO__';

// Urutan aman foreign key, sama dengan urutan impor di server/db.js
const TABLES = ['users', 'lecturers', 'students', 'classes', 'class_students', 'schedules', 'attendance_sessions', 'attendances'];
const NIM_MASKED_DIGITS = 4;

/**
 * Ganti digit terakhir NIM dengan digit turunan HMAC. Hasilnya tetap sama di setiap ekspor,
 * dan kuncinya (hash password lokal) tidak pernah ikut ke repo sehingga tidak bisa ditebak balik.
 */
function maskNims(students, key) {
  const realNims = new Set(students.map((student) => student.nim));
  const used = new Set();

  return students.map((student) => {
    const prefix = student.nim.slice(0, -NIM_MASKED_DIGITS);
    for (let attempt = 0; ; attempt++) {
      const digest = crypto.createHmac('sha256', key).update(`${student.nim}:${attempt}`).digest();
      const digits = String(digest.readUInt32BE(0) % 10 ** NIM_MASKED_DIGITS).padStart(NIM_MASKED_DIGITS, '0');
      const nim = prefix + digits;
      if (realNims.has(nim) || used.has(nim)) continue;
      used.add(nim);
      return { ...student, nim };
    }
  });
}

if (!fs.existsSync(DB_FILE)) {
  console.error(`Database tidak ditemukan: ${DB_FILE}`);
  process.exit(1);
}

const db = new DatabaseSync(DB_FILE, { readOnly: true });
const data = {};
for (const table of TABLES) {
  data[table] = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
}
db.close();

const maskKey = data.users.map((user) => user.password_hash).join('');
data.students = maskNims(data.students, maskKey);
data.users = data.users.map((user) => ({ ...user, password_hash: PASSWORD_PLACEHOLDER }));

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Data diekspor ke ${path.relative(process.cwd(), OUTPUT_FILE)}`);
console.table(Object.fromEntries(TABLES.map((table) => [table, { baris: data[table].length }])));
