# Hasil Pengujian Sistem

Dijalankan: 2026-10-30 19:49:45 WIB (Asia/Jakarta) · Node.js v24.11.0 · perintah `npm test`

Pengujian black-box dengan teknik Equivalence Partitioning (EP) dan Boundary Value Analysis (BVA).
Server dijalankan otomatis dengan database sementara dan data demo. Sesi uji dibuat untuk hari esok dengan aturan waktu:

- Mulai (start_time): 18:00:00
- Batas hadir (present_until): 18:15:00
- Batas terlambat (late_until): 19:00:00
- Selesai (end_time): 20:00:00

Waktu scan disimulasikan lewat `simulated_now`, yang hanya diterima server jika `ALLOW_SIMULATED_TIME=true`.

| ID | Modul | Teknik (EP/BVA) | Skenario | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| TC-01 | Validasi QR (Identitas) | EP | Scan QR acak (PQR-acak) dan format salah (JSON rusak) pada sesi aktif (18:10:00) | INVALID_QR_CODE untuk kedua QR | QR acak: INVALID_QR_CODE; format salah: INVALID_QR_CODE | Lulus |
| TC-02 | Validasi Keanggotaan Kelas | EP | Scan QR mahasiswa yang tidak terdaftar di kelas sesi (Fajar, kelas SI-07) pada 18:10:00 | STUDENT_NOT_REGISTERED, tidak ada record | STUDENT_NOT_REGISTERED, record = 0 | Lulus |
| TC-03 | Validasi Status Sesi | BVA | Scan 1 detik sebelum sesi dimulai (17:59:59, status SCHEDULED) | SESSION_NOT_STARTED, tidak ada record | status sesi SCHEDULED; SESSION_NOT_STARTED, record = 0 | Lulus |
| TC-04 | Pencegahan Presensi Ganda | EP | Scan kedua mahasiswa yang sudah tercatat (Rafid) pada 18:20:00 | ALREADY_ATTENDED (HTTP 409), jumlah record tetap 1 | ALREADY_ATTENDED (HTTP 409), record = 1 | Lulus |
| TC-05 | Klasifikasi Waktu Presensi | BVA | Scan tepat pada batas present_until (18:15:00) | PRESENT | PRESENT | Lulus |
| TC-06 | Klasifikasi Waktu Presensi | BVA | Scan 1 detik setelah present_until (18:15:01) dan tepat pada late_until (19:00:00) | LATE untuk kedua scan | 18:15:01: LATE; 19:00:00: LATE | Lulus |
| TC-07 | Klasifikasi Waktu Presensi | BVA | Scan 1 detik setelah late_until (19:00:01) | ATTENDANCE_PERIOD_CLOSED, tidak ada record | ATTENDANCE_PERIOD_CLOSED, record = 0 | Lulus |
| TC-08 | Penutupan Sesi Otomatis | BVA | syncSessionStatuses dengan waktu simulasi tepat end_time (20:00:00) lalu 20:00:01 | 20:00:00 belum final; 20:00:01 FINALIZED dan mahasiswa yang belum scan menjadi ABSENT | 20:00:00: ATTENDANCE_CLOSED; 20:00:01: FINALIZED; Mahasiswa Uji: ABSENT; ABSENT = 1; Rafid/Syahrul/Lina tetap PRESENT/LATE/LATE | Lulus |
| TC-09 | Keamanan: Kerahasiaan Token QR | EP | Mahasiswa (mahasiswa1) mengakses daftar mahasiswa dan detail kelasnya | Daftar mahasiswa ditolak (403); detail kelas tidak memuat token QR mahasiswa lain | daftar mahasiswa: HTTP 403; detail kelas: HTTP 200, token lain bocor = 0 | Lulus |
| TC-10 | Keamanan: Otorisasi Dosen | EP | Dosen lain (dosen2) melakukan scan pada sesi kelas milik dosen1 | FORBIDDEN (HTTP 403), tidak ada record | FORBIDDEN (HTTP 403), record = 0 | Lulus |
| TC-11 | Keamanan: Waktu Server | EP | ALLOW_SIMULATED_TIME tidak aktif: scan dengan simulated_now / simulated_time besok 18:10 (dalam periode hadir) | Waktu simulasi diabaikan, jam server dipakai -> SESSION_NOT_STARTED, tidak ada record | simulated_now: SESSION_NOT_STARTED; simulated_time: SESSION_NOT_STARTED; record = 0 | Lulus |
| TC-12 | Validasi QR (Status Mahasiswa) | EP | Admin menonaktifkan mahasiswa terdaftar (Lina), lalu QR-nya di-scan pada sesi aktif (18:05:00) | STUDENT_INACTIVE, tidak ada record; setelah diaktifkan kembali scan diterima | nonaktif: STUDENT_INACTIVE, record = 0; aktif kembali: PRESENT | Lulus |
| TC-13 | Keamanan: Sesi Login | EP | Request API dengan token login tidak valid / kedaluwarsa | HTTP 401 dengan kode TOKEN_INVALID (client diarahkan login ulang) | HTTP 401, TOKEN_INVALID | Lulus |
| TC-14 | Validasi Input | EP | Mengirim body JSON rusak ke endpoint scan | HTTP 400 berformat JSON dengan kode INVALID_JSON | HTTP 400, JSON = true, INVALID_JSON | Lulus |
| TC-15 | Keamanan: Data Identitas | EP | Mahasiswa mengubah nama/prodi sendiri lewat PUT /api/auth/profile | HTTP 403, data mahasiswa tidak berubah | HTTP 403; nama = Rafid Musyaffa, prodi = Sistem Informasi | Lulus |
| TC-16 | Manajemen Akun | BVA | Admin membuat mahasiswa dengan password 5 karakter, lalu 6 karakter | 5 karakter ditolak (400) tanpa akun yatim; 6 karakter diterima (201) | 5 karakter: HTTP 400, akun tersisa = 0; 6 karakter: HTTP 201 | Lulus |
| TC-17 | Integritas Rekap Final | EP | Dosen mengubah status presensi (manual) dan menghapus record pada sesi FINALIZED (hasil TC-08); nilai tetap boleh diisi | Ubah & hapus ditolak 409 SESSION_FINALIZED, status tetap ABSENT; simpan nilai diterima (200) | manual: HTTP 409 SESSION_FINALIZED, status = ABSENT; hapus: HTTP 409 SESSION_FINALIZED; nilai: HTTP 200 | Lulus |
| TC-18 | Sesi Hari Ini (Mahasiswa) | EP | Mahasiswa meminta daftar sesi per tanggal (GET /api/sessions?date=...) beserta status presensinya; tanggal tidak valid | Hanya sesi pada tanggal itu, my_status sesuai record miliknya; tanggal tidak valid ditolak 400 | HTTP 200, 3 sesi, semua tanggal sama = true; my_status = PRESENT (DB: PRESENT); tanggal salah: HTTP 400 | Lulus |
| TC-19 | Keamanan: Statistik Dosen | EP | Dosen lain (dosen2) membuka statistik dashboard (GET /api/reports/dashboard) | Jumlah kelas = kelas yang diampu dosen2; tidak ada log presensi kelas SI-05 milik dosen1 | HTTP 200; kelas = 1 (diampu: 1); log SI-05 terlihat = 0 | Lulus |

**Ringkasan:** 19 dari 19 kasus uji lulus.
