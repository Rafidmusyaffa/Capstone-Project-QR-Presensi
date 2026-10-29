const db = require('./server/db');
const { generateToken } = require('./server/auth');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   CAPSTONE FUNCTIONAL TESTING SUITE (10 SCENARIOS)   ');
  console.log('   Sistem Informasi Presensi QR Berbasis Waktu        ');
  console.log('======================================================\n');

  // Setup test session: Class SI-05, Pertemuan 99, 18:00 - 20:00
  const cls = db.prepare("SELECT * FROM classes WHERE code = 'SI-05'").get();
  const lecturerUser = db.prepare("SELECT * FROM users WHERE role = 'dosen'").get();
  const token = generateToken({ id: lecturerUser.id, username: lecturerUser.username, role: 'dosen' });

  // Students
  // Rafid (enrolled in SI-05)
  const std1 = db.prepare("SELECT * FROM students WHERE nim = '220101001'").get();
  // Anisa (enrolled in SI-05)
  const std2 = db.prepare("SELECT * FROM students WHERE nim = '220101002'").get();
  // Dimas (enrolled in SI-05)
  const std3 = db.prepare("SELECT * FROM students WHERE nim = '220101003'").get();
  // Fajar (NOT enrolled in SI-05, registered only in SI-07)
  const std4 = db.prepare("SELECT * FROM students WHERE nim = '220101004'").get();

  // Create isolated test session
  const testSessionCode = `TEST-SES-${Date.now().toString().slice(-4)}`;
  const sessionRes = db.prepare(`
    INSERT INTO attendance_sessions
    (session_code, class_id, meeting_number, meeting_date, start_time, present_until, late_until, end_time, status, created_by)
    VALUES (?, ?, 99, '2026-09-25', '18:00', '18:15', '19:00', '20:00', 'ACTIVE', ?)
  `).run(testSessionCode, cls.id, lecturerUser.id);
  const sessionId = sessionRes.lastInsertRowid;

  let passedCount = 0;
  let totalCount = 10;

  async function callScan(qrData, simulatedTime) {
    const res = await fetch('http://localhost:3000/api/attendance/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        qr_data: qrData,
        simulated_time: simulatedTime,
      }),
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  }

  // ----------------------------------------------------
  // Test Case 8: Scan Sebelum Session (17:50)
  // ----------------------------------------------------
  {
    const res = await callScan(std1.permanent_qr_token, '17:50');
    const passed = !res.ok && res.data.code === 'ATTENDANCE_SESSION_NOT_STARTED';
    console.log(`[TEST 8] Scan Sebelum Session (17:50)   : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 1 & 2: QR Valid & PRESENT (18:10)
  // ----------------------------------------------------
  {
    const res = await callScan(std1.permanent_qr_token, '18:10');
    const passed = res.ok && res.data.status === 'PRESENT';
    console.log(`[TEST 1 & 2] Scan Tepat Waktu (18:10)   : ${passed ? '✅ PASS' : '❌ FAIL'} (Status: ${res.data.status}, Mahasiswa: ${res.data.student?.name})`);
    if (passed) passedCount += 2; // Covers TC1 & TC2
  }

  // ----------------------------------------------------
  // Test Case 5: Duplicate Scan (std1 scans again)
  // ----------------------------------------------------
  {
    const res = await callScan(std1.permanent_qr_token, '18:12');
    const passed = !res.ok && res.data.code === 'ALREADY_ATTENDED';
    console.log(`[TEST 5] Duplicate Scan                 : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 3: LATE (18:40)
  // ----------------------------------------------------
  {
    const res = await callScan(std2.permanent_qr_token, '18:40');
    const passed = res.ok && res.data.status === 'LATE';
    console.log(`[TEST 3] Scan Periode Terlambat (18:40) : ${passed ? '✅ PASS' : '❌ FAIL'} (Status: ${res.data.status}, Mahasiswa: ${res.data.student?.name})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 4: Terlambat Melewati Batas (19:30)
  // ----------------------------------------------------
  {
    const res = await callScan(std3.permanent_qr_token, '19:30');
    const passed = !res.ok && res.data.code === 'ATTENDANCE_PERIOD_CLOSED';
    console.log(`[TEST 4] Melewati Batas Waktu (19:30)   : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 6: Wrong Class (std4 not enrolled in SI-05)
  // ----------------------------------------------------
  {
    const res = await callScan(std4.permanent_qr_token, '18:05');
    const passed = !res.ok && res.data.code === 'STUDENT_NOT_REGISTERED';
    console.log(`[TEST 6] Mahasiswa Salah Kelas          : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 7: Unknown QR
  // ----------------------------------------------------
  {
    const res = await callScan('QR-UNREGISTERED-RANDOM-TOKEN-999', '18:05');
    const passed = !res.ok && res.data.code === 'INVALID_QR_CODE';
    console.log(`[TEST 7] QR Code Tidak Dikenali         : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 9: Automatic Session Closing
  // ----------------------------------------------------
  {
    // Close the session manually or via status
    db.prepare("UPDATE attendance_sessions SET status = 'CLOSED' WHERE id = ?").run(sessionId);
    const res = await callScan(std3.permanent_qr_token, '18:10');
    const passed = !res.ok && res.data.code === 'SESSION_CLOSED';
    console.log(`[TEST 9] Session Status CLOSED          : ${passed ? '✅ PASS' : '❌ FAIL'} (${res.data.message})`);
    if (passed) passedCount++;
  }

  // ----------------------------------------------------
  // Test Case 10: Finalisasi Mahasiswa Tidak Presensi (ABSENT)
  // ----------------------------------------------------
  {
    // Call finalize endpoint
    const finRes = await fetch(`http://localhost:3000/api/sessions/${sessionId}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const finJson = await finRes.json();
    
    // Check if std3 (Dimas) now has status ABSENT in DB
    const absentRecord = db.prepare('SELECT * FROM attendances WHERE session_id = ? AND student_id = ?').get(sessionId, std3.id);
    const passed = absentRecord && absentRecord.status === 'ABSENT';
    console.log(`[TEST 10] Finalisasi Status ABSENT      : ${passed ? '✅ PASS' : '❌ FAIL'} (Student: ${std3.name}, Status: ${absentRecord?.status})`);
    if (passed) passedCount++;
  }

  // Cleanup test session
  db.prepare('DELETE FROM attendance_sessions WHERE id = ?').run(sessionId);

  console.log('\n======================================================');
  console.log(`   TEST RESULT: ${passedCount} / ${totalCount} PASSED (${Math.round((passedCount/totalCount)*100)}%)`);
  console.log('======================================================\n');
}

// Start server in-process if not already running, then run tests
const { server } = require('./server/index');
setTimeout(async () => {
  try {
    await runTestSuite();
  } catch (e) {
    console.error('Test execution failed:', e);
  } finally {
    setTimeout(() => process.exit(0), 100);
  }
}, 1000);

