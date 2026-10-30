// Pengujian black-box sesuai Tabel 3 proposal.
// Script menjalankan server sendiri (child_process) dengan DB sementara,
// menguji lewat HTTP API, lalu mencetak tabel hasil dan menyimpannya ke
// docs/hasil-pengujian.md untuk Bab IV laporan akhir.
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { nowParts } = require('./server/time');

const PORT = 3999;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT = __dirname;
const REPORT_PATH = path.join(ROOT, 'docs', 'hasil-pengujian.md');

// Jadwal sesi uji (besok, agar tidak terpengaruh jam nyata)
const RULES = { start_time: '18:00', present_until: '18:15', late_until: '19:00', end_time: '20:00' };

const results = [];

function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function tmpDbPath(label) {
  return path.join(os.tmpdir(), `presensi-test-${label}-${process.pid}-${Date.now()}.db`);
}

function removeDb(file) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(file + suffix); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// Server (child process)
// ---------------------------------------------------------------------------

async function startServer({ dbPath, allowSimulatedTime }) {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: dbPath,
    ALLOW_SIMULATED_TIME: allowSimulatedTime ? 'true' : 'false',
    SEED_DEMO: 'true',
    NODE_ENV: 'test',
  };
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  let exited = false;
  const exitPromise = new Promise((resolve) => child.on('exit', () => { exited = true; resolve(); }));

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Server berhenti sebelum siap.\n${log}`);
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        return {
          getLog: () => log,
          stop: async () => {
            if (!exited) child.kill();
            await exitPromise;
          },
        };
      }
    } catch (e) {
      // belum siap
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`Server tidak siap dalam 20 detik di port ${PORT}.\n${log}`);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function api(method, url, token, body) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data: data || {} };
}

async function login(username, password) {
  const res = await api('POST', '/api/auth/login', null, { username, password });
  if (res.status !== 200) throw new Error(`Login ${username} gagal: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.token;
}

async function createTomorrowSession(token, classId, meetingNumber) {
  const date = shiftDate(nowParts().date, 1);
  const res = await api('POST', '/api/sessions', token, {
    class_id: classId,
    meeting_number: meetingNumber,
    meeting_date: date,
    ...RULES,
  });
  if (res.status !== 201) throw new Error(`Gagal membuat sesi uji: ${res.status} ${JSON.stringify(res.data)}`);
  return { id: Number(res.data.sessionId), date, status: res.data.status };
}

/** Hasil scan diringkas: kode error, atau status presensi jika berhasil. */
function scanOutcome(res) {
  return res.data.success ? res.data.status : (res.data.code || `HTTP ${res.status}`);
}

/**
 * Catat satu kasus uji. `run` mengembalikan { actual, pass }.
 * Exception dicatat sebagai FAIL agar kasus lain tetap berjalan.
 */
async function testCase(meta, run) {
  let actual;
  let pass = false;
  try {
    ({ actual, pass } = await run());
  } catch (err) {
    actual = `Error: ${err.message}`;
  }
  results.push({ ...meta, actual, status: pass ? 'Lulus' : 'Gagal' });
  console.log(`${meta.id.padEnd(7)} ${pass ? '✅ PASS' : '❌ FAIL'}  ${meta.scenario}`);
  if (!pass) console.log(`        expected: ${meta.expected}\n        actual  : ${actual}`);
}

// ---------------------------------------------------------------------------
// Tahap 1: server dengan ALLOW_SIMULATED_TIME=true
// ---------------------------------------------------------------------------

async function runMainSuite(dbPath) {
  const adminToken = await login('admin', 'admin123');
  const dosenToken = await login('dosen1', 'dosen123');
  const dosen2Token = await login('dosen2', 'dosen123');
  const mhsToken = await login('mahasiswa1', 'mhs123');

  const classes = await api('GET', '/api/classes', adminToken);
  const si05 = classes.data.find((c) => c.code === 'SI-05');
  if (!si05) throw new Error('Kelas demo SI-05 tidak ditemukan.');

  // Token QR diambil lewat API admin (admin berhak melihat token)
  const students = await api('GET', '/api/users/students', adminToken);
  const byNim = (nim) => students.data.find((s) => s.nim === nim);
  const rafid = byNim('220101001'); // terdaftar SI-05
  const syahrul = byNim('220101002'); // terdaftar SI-05
  const lina = byNim('220101003'); // terdaftar SI-05
  const fajar = byNim('220101004'); // TIDAK terdaftar SI-05

  // Mahasiswa uji tambahan, didaftarkan ke SI-05 dan sengaja tidak pernah tercatat hadir
  const created = await api('POST', '/api/users/students', adminToken, {
    username: 'mhs-uji',
    password: 'uji12345',
    nim: '220101099',
    name: 'Mahasiswa Uji',
    major: 'Sistem Informasi',
  });
  if (created.status !== 201) throw new Error(`Gagal membuat mahasiswa uji: ${JSON.stringify(created.data)}`);
  const ujiId = Number(created.data.studentId);
  const ujiToken = created.data.permanent_qr_token;
  await api('POST', `/api/classes/${si05.id}/students`, adminToken, { student_id: ujiId });

  const session = await createTomorrowSession(dosenToken, si05.id, 1);
  const at = (time) => `${session.date}T${time}`;
  const scan = (qr, time, token = dosenToken) =>
    api('POST', '/api/attendance/scan', token, { session_id: session.id, qr_data: qr, simulated_now: at(time) });

  console.log(`Sesi uji #${session.id} tanggal ${session.date}, ${RULES.start_time}/${RULES.present_until}/${RULES.late_until}/${RULES.end_time}\n`);

  // Koneksi langsung ke DB server untuk verifikasi jumlah record & memanggil scheduler
  process.env.DB_PATH = dbPath;
  const db = require('./server/db');
  const { syncSessionStatuses } = require('./server/scheduler');
  const countRecords = (studentId) =>
    db.prepare('SELECT COUNT(*) AS n FROM attendances WHERE session_id = ? AND student_id = ?').get(session.id, studentId).n;

  await testCase({
    id: 'TC-01', modul: 'Validasi QR (Identitas)', teknik: 'EP',
    scenario: 'Scan QR acak (PQR-acak) dan format salah (JSON rusak) pada sesi aktif (18:10:00)',
    expected: 'INVALID_QR_CODE untuk kedua QR',
  }, async () => {
    const random = scanOutcome(await scan('PQR-tokenacaktidakterdaftar', '18:10:00'));
    const malformed = scanOutcome(await scan('{"permanent_qr_token":', '18:10:00'));
    return {
      actual: `QR acak: ${random}; format salah: ${malformed}`,
      pass: random === 'INVALID_QR_CODE' && malformed === 'INVALID_QR_CODE',
    };
  });

  await testCase({
    id: 'TC-02', modul: 'Validasi Keanggotaan Kelas', teknik: 'EP',
    scenario: 'Scan QR mahasiswa yang tidak terdaftar di kelas sesi (Fajar, kelas SI-07) pada 18:10:00',
    expected: 'STUDENT_NOT_REGISTERED, tidak ada record',
  }, async () => {
    const outcome = scanOutcome(await scan(fajar.permanent_qr_token, '18:10:00'));
    const records = countRecords(fajar.id);
    return {
      actual: `${outcome}, record = ${records}`,
      pass: outcome === 'STUDENT_NOT_REGISTERED' && records === 0,
    };
  });

  await testCase({
    id: 'TC-03', modul: 'Validasi Status Sesi', teknik: 'BVA',
    scenario: 'Scan 1 detik sebelum sesi dimulai (17:59:59, status SCHEDULED)',
    expected: 'SESSION_NOT_STARTED, tidak ada record',
  }, async () => {
    const outcome = scanOutcome(await scan(ujiToken, '17:59:59'));
    const records = countRecords(ujiId);
    return {
      actual: `status sesi ${session.status}; ${outcome}, record = ${records}`,
      pass: session.status === 'SCHEDULED' && outcome === 'SESSION_NOT_STARTED' && records === 0,
    };
  });

  await testCase({
    id: 'TC-05', modul: 'Klasifikasi Waktu Presensi', teknik: 'BVA',
    scenario: 'Scan tepat pada batas present_until (18:15:00)',
    expected: 'PRESENT',
  }, async () => {
    const outcome = scanOutcome(await scan(rafid.permanent_qr_token, '18:15:00'));
    return { actual: outcome, pass: outcome === 'PRESENT' };
  });

  await testCase({
    id: 'TC-04', modul: 'Pencegahan Presensi Ganda', teknik: 'EP',
    scenario: 'Scan kedua mahasiswa yang sudah tercatat (Rafid) pada 18:20:00',
    expected: 'ALREADY_ATTENDED (HTTP 409), jumlah record tetap 1',
  }, async () => {
    const res = await scan(rafid.permanent_qr_token, '18:20:00');
    const records = countRecords(rafid.id);
    return {
      actual: `${scanOutcome(res)} (HTTP ${res.status}), record = ${records}`,
      pass: res.data.code === 'ALREADY_ATTENDED' && res.status === 409 && records === 1,
    };
  });

  await testCase({
    id: 'TC-06', modul: 'Klasifikasi Waktu Presensi', teknik: 'BVA',
    scenario: 'Scan 1 detik setelah present_until (18:15:01) dan tepat pada late_until (19:00:00)',
    expected: 'LATE untuk kedua scan',
  }, async () => {
    const afterPresent = scanOutcome(await scan(syahrul.permanent_qr_token, '18:15:01'));
    const atLate = scanOutcome(await scan(lina.permanent_qr_token, '19:00:00'));
    return {
      actual: `18:15:01: ${afterPresent}; 19:00:00: ${atLate}`,
      pass: afterPresent === 'LATE' && atLate === 'LATE',
    };
  });

  await testCase({
    id: 'TC-07', modul: 'Klasifikasi Waktu Presensi', teknik: 'BVA',
    scenario: 'Scan 1 detik setelah late_until (19:00:01)',
    expected: 'ATTENDANCE_PERIOD_CLOSED, tidak ada record',
  }, async () => {
    const outcome = scanOutcome(await scan(ujiToken, '19:00:01'));
    const records = countRecords(ujiId);
    return {
      actual: `${outcome}, record = ${records}`,
      pass: outcome === 'ATTENDANCE_PERIOD_CLOSED' && records === 0,
    };
  });

  await testCase({
    id: 'TC-08', modul: 'Penutupan Sesi Otomatis', teknik: 'BVA',
    scenario: 'syncSessionStatuses dengan waktu simulasi tepat end_time (20:00:00) lalu 20:00:01',
    expected: '20:00:00 belum final; 20:00:01 FINALIZED dan mahasiswa yang belum scan menjadi ABSENT',
  }, async () => {
    const statusOf = () => db.prepare('SELECT status FROM attendance_sessions WHERE id = ?').get(session.id).status;

    syncSessionStatuses({ date: session.date, time: '20:00:00' });
    const atEnd = statusOf();
    syncSessionStatuses({ date: session.date, time: '20:00:01' });
    const afterEnd = statusOf();

    const detail = await api('GET', `/api/sessions/${session.id}`, dosenToken);
    const statusById = Object.fromEntries(detail.data.students.map((s) => [s.student_id, s.attendance_status]));
    const absentUji = statusById[ujiId];
    const kept = [statusById[rafid.id], statusById[syahrul.id], statusById[lina.id]].join('/');

    return {
      actual: `20:00:00: ${atEnd}; 20:00:01: ${afterEnd}; Mahasiswa Uji: ${absentUji}; ` +
        `ABSENT = ${detail.data.stats.absent}; Rafid/Syahrul/Lina tetap ${kept}`,
      pass: atEnd === 'ATTENDANCE_CLOSED' && afterEnd === 'FINALIZED' && absentUji === 'ABSENT' &&
        detail.data.stats.absent === 1 && kept === 'PRESENT/LATE/LATE',
    };
  });

  await testCase({
    id: 'TC-09', modul: 'Keamanan: Kerahasiaan Token QR', teknik: 'EP',
    scenario: 'Mahasiswa (mahasiswa1) mengakses daftar mahasiswa dan detail kelasnya',
    expected: 'Daftar mahasiswa ditolak (403); detail kelas tidak memuat token QR mahasiswa lain',
  }, async () => {
    const list = await api('GET', '/api/users/students', mhsToken);
    const cls = await api('GET', `/api/classes/${si05.id}`, mhsToken);
    const body = JSON.stringify(cls.data);
    const leaked = [syahrul, lina].filter((s) => body.includes(s.permanent_qr_token)).length;
    return {
      actual: `daftar mahasiswa: HTTP ${list.status}; detail kelas: HTTP ${cls.status}, token lain bocor = ${leaked}`,
      pass: list.status === 403 && cls.status === 200 && leaked === 0,
    };
  });

  await testCase({
    id: 'TC-10', modul: 'Keamanan: Otorisasi Dosen', teknik: 'EP',
    scenario: 'Dosen lain (dosen2) melakukan scan pada sesi kelas milik dosen1',
    expected: 'FORBIDDEN (HTTP 403), tidak ada record',
  }, async () => {
    const other = await createTomorrowSession(dosenToken, si05.id, 2);
    const res = await api('POST', '/api/attendance/scan', dosen2Token, {
      session_id: other.id,
      qr_data: rafid.permanent_qr_token,
      simulated_now: `${other.date}T18:05:00`,
    });
    const records = db.prepare('SELECT COUNT(*) AS n FROM attendances WHERE session_id = ?').get(other.id).n;
    return {
      actual: `${scanOutcome(res)} (HTTP ${res.status}), record = ${records}`,
      pass: res.status === 403 && res.data.code === 'FORBIDDEN' && records === 0,
    };
  });

  await testCase({
    id: 'TC-12', modul: 'Validasi QR (Status Mahasiswa)', teknik: 'EP',
    scenario: 'Admin menonaktifkan mahasiswa terdaftar (Lina), lalu QR-nya di-scan pada sesi aktif (18:05:00)',
    expected: 'STUDENT_INACTIVE, tidak ada record; setelah diaktifkan kembali scan diterima',
  }, async () => {
    const other = await createTomorrowSession(dosenToken, si05.id, 3);
    const scanOther = (time) => api('POST', '/api/attendance/scan', dosenToken, {
      session_id: other.id, qr_data: lina.permanent_qr_token, simulated_now: `${other.date}T${time}`,
    });
    await api('PATCH', `/api/users/students/${lina.id}/status`, adminToken, { is_active: false });
    const inactive = scanOther('18:05:00');
    const inactiveOutcome = scanOutcome(await inactive);
    const records = db.prepare('SELECT COUNT(*) AS n FROM attendances WHERE session_id = ?').get(other.id).n;
    await api('PATCH', `/api/users/students/${lina.id}/status`, adminToken, { is_active: true });
    const reactivated = scanOutcome(await scanOther('18:06:00'));
    return {
      actual: `nonaktif: ${inactiveOutcome}, record = ${records}; aktif kembali: ${reactivated}`,
      pass: inactiveOutcome === 'STUDENT_INACTIVE' && records === 0 && reactivated === 'PRESENT',
    };
  });

  await testCase({
    id: 'TC-13', modul: 'Keamanan: Sesi Login', teknik: 'EP',
    scenario: 'Request API dengan token login tidak valid / kedaluwarsa',
    expected: 'HTTP 401 dengan kode TOKEN_INVALID (client diarahkan login ulang)',
  }, async () => {
    const res = await api('GET', '/api/sessions', `${dosenToken}rusak`);
    return {
      actual: `HTTP ${res.status}, ${res.data.code}`,
      pass: res.status === 401 && res.data.code === 'TOKEN_INVALID',
    };
  });

  await testCase({
    id: 'TC-14', modul: 'Validasi Input', teknik: 'EP',
    scenario: 'Mengirim body JSON rusak ke endpoint scan',
    expected: 'HTTP 400 berformat JSON dengan kode INVALID_JSON',
  }, async () => {
    const res = await fetch(`${BASE_URL}/api/attendance/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dosenToken}` },
      body: '{"session_id": 1,',
    });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : {};
    return {
      actual: `HTTP ${res.status}, JSON = ${isJson}, ${data.code}`,
      pass: res.status === 400 && isJson && data.code === 'INVALID_JSON',
    };
  });

  await testCase({
    id: 'TC-15', modul: 'Keamanan: Data Identitas', teknik: 'EP',
    scenario: 'Mahasiswa mengubah nama/prodi sendiri lewat PUT /api/auth/profile',
    expected: 'HTTP 403, data mahasiswa tidak berubah',
  }, async () => {
    const res = await api('PUT', '/api/auth/profile', mhsToken, { name: '', major: 'Lain' });
    const row = db.prepare('SELECT name, major FROM students WHERE id = ?').get(rafid.id);
    return {
      actual: `HTTP ${res.status}; nama = ${row.name}, prodi = ${row.major}`,
      pass: res.status === 403 && row.name === rafid.name && row.major === rafid.major,
    };
  });

  await testCase({
    id: 'TC-16', modul: 'Manajemen Akun', teknik: 'BVA',
    scenario: 'Admin membuat mahasiswa dengan password 5 karakter, lalu 6 karakter',
    expected: '5 karakter ditolak (400) tanpa akun yatim; 6 karakter diterima (201)',
  }, async () => {
    const payload = (password) => ({ username: 'mhs-pw', password, nim: '220101098', name: 'Uji Password', major: 'SI' });
    const short = await api('POST', '/api/users/students', adminToken, payload('12345'));
    const orphan = db.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'mhs-pw'").get().n;
    const ok = await api('POST', '/api/users/students', adminToken, payload('123456'));
    return {
      actual: `5 karakter: HTTP ${short.status}, akun tersisa = ${orphan}; 6 karakter: HTTP ${ok.status}`,
      pass: short.status === 400 && orphan === 0 && ok.status === 201,
    };
  });

  await testCase({
    id: 'TC-17', modul: 'Integritas Rekap Final', teknik: 'EP',
    scenario: 'Dosen mengubah status presensi (manual) dan menghapus record pada sesi FINALIZED (hasil TC-08); nilai tetap boleh diisi',
    expected: 'Ubah & hapus ditolak 409 SESSION_FINALIZED, status tetap ABSENT; simpan nilai diterima (200)',
  }, async () => {
    const manual = await api('POST', '/api/attendance/manual', dosenToken, {
      session_id: session.id, student_id: ujiId, status: 'PRESENT',
    });
    const statusUji = db.prepare('SELECT status FROM attendances WHERE session_id = ? AND student_id = ?').get(session.id, ujiId).status;
    const rafidRecord = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?').get(session.id, rafid.id);
    const del = await api('DELETE', `/api/attendance/${rafidRecord.id}`, dosenToken);
    const score = await api('POST', '/api/attendance/score', dosenToken, {
      session_id: session.id, student_id: rafid.id, score: 90,
    });
    return {
      actual: `manual: HTTP ${manual.status} ${manual.data.code}, status = ${statusUji}; hapus: HTTP ${del.status} ${del.data.code}; nilai: HTTP ${score.status}`,
      pass: manual.status === 409 && manual.data.code === 'SESSION_FINALIZED' && statusUji === 'ABSENT' &&
        del.status === 409 && del.data.code === 'SESSION_FINALIZED' && score.status === 200,
    };
  });

  await testCase({
    id: 'TC-18', modul: 'Sesi Hari Ini (Mahasiswa)', teknik: 'EP',
    scenario: 'Mahasiswa meminta daftar sesi per tanggal (GET /api/sessions?date=...) beserta status presensinya; tanggal tidak valid',
    expected: 'Hanya sesi pada tanggal itu, my_status sesuai record miliknya; tanggal tidak valid ditolak 400',
  }, async () => {
    const me = await api('GET', '/api/auth/me', mhsToken);
    const myId = me.data.user.student.id;
    const list = await api('GET', `/api/sessions?date=${session.date}`, mhsToken);
    const sameDate = list.data.every((s) => s.meeting_date === session.date);
    const mine = list.data.find((s) => s.id === session.id);
    const expectedStatus = db.prepare('SELECT status FROM attendances WHERE session_id = ? AND student_id = ?').get(session.id, myId)?.status ?? null;
    const bad = await api('GET', '/api/sessions?date=31-12-2026', mhsToken);
    return {
      actual: `HTTP ${list.status}, ${list.data.length} sesi, semua tanggal sama = ${sameDate}; my_status = ${mine?.my_status} (DB: ${expectedStatus}); tanggal salah: HTTP ${bad.status}`,
      pass: list.status === 200 && sameDate && !!mine && mine.my_status === expectedStatus && expectedStatus !== null && bad.status === 400,
    };
  });

  await testCase({
    id: 'TC-19', modul: 'Keamanan: Statistik Dosen', teknik: 'EP',
    scenario: 'Dosen lain (dosen2) membuka statistik dashboard (GET /api/reports/dashboard)',
    expected: 'Jumlah kelas = kelas yang diampu dosen2; tidak ada log presensi kelas SI-05 milik dosen1',
  }, async () => {
    const dash = await api('GET', '/api/reports/dashboard', dosen2Token);
    const ownClasses = await api('GET', '/api/classes', dosen2Token);
    const leaked = dash.data.recentAttendances.filter((a) => a.class_code === 'SI-05').length;
    return {
      actual: `HTTP ${dash.status}; kelas = ${dash.data.metrics.totalClasses} (diampu: ${ownClasses.data.length}); log SI-05 terlihat = ${leaked}`,
      pass: dash.status === 200 && dash.data.metrics.totalClasses === ownClasses.data.length && leaked === 0,
    };
  });

  db.close();
}

// ---------------------------------------------------------------------------
// Tahap 2: server dengan ALLOW_SIMULATED_TIME=false
// ---------------------------------------------------------------------------

async function runSimulationDisabledSuite() {
  const dosenToken = await login('dosen1', 'dosen123');
  const adminToken = await login('admin', 'admin123');
  const classes = await api('GET', '/api/classes', adminToken);
  const si05 = classes.data.find((c) => c.code === 'SI-05');
  const students = await api('GET', '/api/users/students', adminToken);
  const rafid = students.data.find((s) => s.nim === '220101001');
  const session = await createTomorrowSession(dosenToken, si05.id, 1);

  await testCase({
    id: 'TC-11', modul: 'Keamanan: Waktu Server', teknik: 'EP',
    scenario: 'ALLOW_SIMULATED_TIME tidak aktif: scan dengan simulated_now / simulated_time besok 18:10 (dalam periode hadir)',
    expected: 'Waktu simulasi diabaikan, jam server dipakai -> SESSION_NOT_STARTED, tidak ada record',
  }, async () => {
    const withNow = await api('POST', '/api/attendance/scan', dosenToken, {
      session_id: session.id, qr_data: rafid.permanent_qr_token, simulated_now: `${session.date}T18:10:00`,
    });
    const withTime = await api('POST', '/api/attendance/scan', dosenToken, {
      session_id: session.id, qr_data: rafid.permanent_qr_token, simulated_time: '18:10:00',
    });
    const detail = await api('GET', `/api/sessions/${session.id}`, dosenToken);
    const recorded = detail.data.students.filter((s) => s.attendance_status).length;
    return {
      actual: `simulated_now: ${scanOutcome(withNow)}; simulated_time: ${scanOutcome(withTime)}; record = ${recorded}`,
      pass: scanOutcome(withNow) === 'SESSION_NOT_STARTED' && scanOutcome(withTime) === 'SESSION_NOT_STARTED' && recorded === 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------

function buildMarkdownTable() {
  const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const order = (id) => id.replace(/\D/g, '').padStart(3, '0');
  const rows = [...results].sort((a, b) => order(a.id).localeCompare(order(b.id)));
  const lines = [
    '| ID | Modul | Teknik (EP/BVA) | Skenario | Expected | Actual | Status |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${[r.id, r.modul, r.teknik, r.scenario, r.expected, r.actual, r.status].map(cell).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function writeReport(table, passed) {
  const now = nowParts();
  const content = [
    '# Hasil Pengujian Sistem',
    '',
    `Dijalankan: ${now.date} ${now.time} WIB (Asia/Jakarta) · Node.js ${process.version} · perintah \`npm test\``,
    '',
    'Pengujian black-box dengan teknik Equivalence Partitioning (EP) dan Boundary Value Analysis (BVA).',
    'Server dijalankan otomatis dengan database sementara dan data demo. Sesi uji dibuat untuk hari esok dengan aturan waktu:',
    '',
    `- Mulai (start_time): ${RULES.start_time}:00`,
    `- Batas hadir (present_until): ${RULES.present_until}:00`,
    `- Batas terlambat (late_until): ${RULES.late_until}:00`,
    `- Selesai (end_time): ${RULES.end_time}:00`,
    '',
    'Waktu scan disimulasikan lewat `simulated_now`, yang hanya diterima server jika `ALLOW_SIMULATED_TIME=true`.',
    '',
    table,
    '',
    `**Ringkasan:** ${passed} dari ${results.length} kasus uji lulus.`,
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, content, 'utf8');
}

// ---------------------------------------------------------------------------

async function runStage(label, options, suite) {
  const dbPath = tmpDbPath(label);
  let server;
  try {
    server = await startServer({ dbPath, ...options });
    await suite(dbPath);
  } catch (err) {
    console.error(`\n[${label}] Pengujian terhenti: ${err.message}`);
    if (server) console.error(`--- log server ---\n${server.getLog()}`);
    results.push({
      id: `ERR-${label}`, modul: '-', teknik: '-', scenario: `Tahap ${label}`,
      expected: 'Tahap berjalan', actual: err.message.split('\n')[0], status: 'Gagal',
    });
  } finally {
    if (server) await server.stop();
    removeDb(dbPath);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('   PENGUJIAN BLACK-BOX SISTEM PRESENSI QR (Tabel 3)  ');
  console.log('======================================================\n');

  await runStage('simulasi', { allowSimulatedTime: true }, runMainSuite);
  await runStage('tanpa-simulasi', { allowSimulatedTime: false }, runSimulationDisabledSuite);

  const passed = results.filter((r) => r.status === 'Lulus').length;
  const table = buildMarkdownTable();
  writeReport(table, passed);

  console.log(`\n${table}\n`);
  console.log(`Ringkasan: ${passed}/${results.length} lulus. Laporan: ${path.relative(ROOT, REPORT_PATH).split(path.sep).join('/')}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
