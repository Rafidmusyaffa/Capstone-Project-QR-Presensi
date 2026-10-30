# Ringkasan Perubahan Sistem Presensi QR

Per 30 Oktober 2026 (WIB). Kondisi awal dihitung dari commit `78163aa` ("kondisi awal"). Semua perubahan di dokumen ini belum di-commit.

> **Untuk chat baru:** dokumen ini mencatat semua perubahan pada project capstone setelah kondisi awal. Gunakan dokumen ini untuk memperbarui proposal: Bab III (perancangan, aturan bisnis, basis data, API) dan Bab IV (implementasi & pengujian). Bagian 10 merangkum hal yang **berbeda atau baru dibandingkan proposal**.

---

## 1. Identitas project

- **Judul:** Rancang Bangun Sistem Informasi Presensi Mahasiswa Berbasis QR Code dengan Manajemen Sesi dan Waktu Presensi (Capstone STSI4440, Universitas Terbuka).
- **Teknologi:**
  - Frontend: React 19 + Vite 8 + Tailwind CSS 4, dengan lucide-react, html5-qrcode, qrcode.react, dan canvas-confetti.
  - Backend: Node.js ≥ 22.5 + Express 5 + SQLite bawaan Node (`node:sqlite`), dengan bcryptjs, jsonwebtoken, dan dotenv.
- **Dependency npm:** tidak ada yang ditambahkan. Semua fitur keamanan (rate limit, security header, token acak) dibuat tanpa library baru.
- **Target hosting:** Render free. Filesystem-nya tidak permanen, sehingga data demo di-seed ulang otomatis setiap server start. Urusan hosting ditunda dulu; fokus saat ini adalah aplikasi web.

---

## 2. Aturan bisnis (BR) dan status implementasinya

| BR | Aturan | Implementasi |
|---|---|---|
| BR-01 | QR hanya berisi identitas (`permanent_qr_token`). Mahasiswa harus terdaftar dan **aktif**. | QR dicocokkan ke `permanent_qr_token`. Fallback ke NIM dihapus. Kolom `is_active` ditambahkan; scan mahasiswa nonaktif ditolak dengan `STUDENT_INACTIVE`. |
| BR-02 | Mahasiswa harus terdaftar di kelas sesi tersebut. | Dicek terhadap `class_students`, ditolak dengan `STUDENT_NOT_REGISTERED`. Fitur auto-enroll dihapus dari presensi manual dan penilaian. |
| BR-03 | Scan hanya diterima saat sesi ACTIVE. | Fase dihitung dari tanggal + jam server. Kode tolak: `SESSION_NOT_STARTED`, `ATTENDANCE_PERIOD_CLOSED`, `SESSION_CLOSED`. |
| BR-04 | PRESENT jika `start_time ≤ t ≤ present_until`. | Inklusif, presisi detik (format `HH:MM:SS`). |
| BR-05 | LATE jika `present_until < t ≤ late_until`. | Inklusif di `late_until`. |
| BR-06 | Scan setelah `late_until` ditolak. | Kode `ATTENDANCE_PERIOD_CLOSED`. |
| BR-07 | Satu kali presensi per mahasiswa per sesi: `UNIQUE(session_id, student_id)`. | Scan kedua → HTTP **409** `ALREADY_ATTENDED`. Scan bersamaan juga ditangani lewat constraint UNIQUE. |
| BR-08 | Setelah `end_time`, sesi ditutup, ABSENT dicatat massal, lalu FINALIZED. | Scheduler berjalan tiap 15 detik dan juga pada setiap request ke `/api/sessions` dan `/api/attendance`. Penutupan sesi dalam satu transaksi: CLOSED → INSERT ABSENT → FINALIZED (+ `finalized_at`). |

- **Waktu acuan:** selalu jam server dalam zona Asia/Jakarta (WIB), tidak pernah jam perangkat klien. Zona bisa diganti lewat env `APP_TIMEZONE`.
- **Siklus status sesi:** `SCHEDULED → ACTIVE → ATTENDANCE_CLOSED → CLOSED → FINALIZED`. Status hanya bergerak maju.
- **Batas tiap fase:**
  - **SCHEDULED:** sebelum tanggal pertemuan, atau sebelum `start_time`.
  - **ACTIVE:** `start_time` s/d `late_until`.
  - **ATTENDANCE_CLOSED:** setelah `late_until` s/d `end_time`.
  - **CLOSED:** setelah `end_time`, atau tanggal sudah lewat. Sesi yang mencapai CLOSED langsung difinalisasi menjadi FINALIZED.

---

## 3. Perubahan basis data (SQLite)

- **`attendance_sessions`:**
  - CHECK status diubah menjadi lima nilai: `SCHEDULED`, `ACTIVE`, `ATTENDANCE_CLOSED`, `CLOSED`, `FINALIZED`.
  - Default status: `SCHEDULED`.
  - Kolom baru `finalized_at`.
  - Migrasi otomatis membangun ulang tabel lama, karena SQLite tidak bisa mengubah CHECK. Sesi lama berstatus ACTIVE dijadikan SCHEDULED, lalu scheduler memajukannya sesuai jam.
  - Index unik baru `idx_sessions_class_meeting (class_id, meeting_number)`: nomor pertemuan tidak boleh dobel di satu kelas.
- **`students`:** kolom baru `is_active INTEGER NOT NULL DEFAULT 1`, ditambahkan otomatis lewat ALTER TABLE.
- **`attendances`:** tetap `UNIQUE(session_id, student_id)`. Kolom `score` dan `score_feedback` tetap ada.
- **Lokasi database:** bisa diatur dengan env `DB_PATH`.
- **`PRAGMA busy_timeout = 5000`:** jika database sedang dikunci proses lain, operasi menunggu, tidak langsung gagal.
- **Seed demo:** berjalan jika database kosong. Bisa dimatikan dengan `SEED_DEMO=false`.

---

## 4. Perubahan API (backend)

### Endpoint baru / berubah

| Endpoint | Keterangan |
|---|---|
| `POST /api/sessions/:id/finalize` | **Baru**, menggantikan `PATCH` toggle status yang lama. Menutup dan memfinalisasi sesi secara manual: belum presensi → ABSENT. |
| `POST /api/users/students/:id/regenerate-qr` | **Baru** (admin). Membuat token QR baru; QR lama langsung tidak berlaku. |
| `PATCH /api/users/students/:id/status` | **Baru** (admin). Body `{ "is_active": true/false }`. Mengaktifkan atau menonaktifkan mahasiswa. |
| `GET /api/time` | **Baru**. Mengembalikan jam resmi server `{date, time, timezone, epoch_ms}`, dipakai untuk menyinkronkan jam di client. |
| `GET /api/sessions?date=YYYY-MM-DD\|today` | **Baru: filter tanggal.** `today` memakai tanggal server (WIB). Untuk mahasiswa, setiap sesi juga membawa `my_status` dan `my_scan_time` (status presensinya sendiri). Tanggal tidak valid → 400. Dipakai bagian "Sesi Hari Ini". |
| `GET /api/reports/dashboard` | Statistik untuk dosen kini **hanya mencakup kelas yang diampunya** (sebelumnya angka global). Admin tetap melihat seluruh data. |
| `GET /api/reports/class/:id` | Hasil sama, tetapi data presensi diambil dengan satu query (sebelumnya satu query per mahasiswa per sesi). |
| `POST /api/sessions` | Validasi diperketat. Detailnya di bawah tabel ini. |
| `POST /api/attendance/scan` | Pipeline IDENTIFY → VALIDATE → CLASSIFY → RECORD dengan kode error yang jelas (lihat 4.2). |
| `POST /api/attendance/score` | Hanya memperbarui record yang sudah ada. Jika belum ada record → 404 `ATTENDANCE_NOT_FOUND`. Tidak lagi auto-enroll. |
| `POST /api/attendance/manual` | Mahasiswa harus terdaftar di kelas. Tidak lagi auto-enroll. Ditolak 409 `SESSION_FINALIZED` bila sesi sudah FINALIZED. Status ABSENT manual dicatat dengan `scan_time = '-'` (sama seperti ABSENT dari scheduler), bukan jam sekarang. |
| `DELETE /api/attendance/:id` | Ditolak 409 `SESSION_FINALIZED` bila sesi sudah FINALIZED. |
| `PUT /api/auth/change-password` | Wajib mengisi password lama. Password baru minimal 6 karakter. |
| `PUT /api/auth/profile` | Hanya dosen yang boleh (nama wajib diisi, email divalidasi). Mahasiswa → 403, karena identitas hanya boleh diubah admin. |
| `POST/PUT /api/users/students`, `POST/PUT /api/users/lecturers` | Memakai transaksi (akun user dan profil dibuat bersamaan atau tidak sama sekali). Password minimal 6 karakter. Input di-trim. Username/NIM/NIP duplikat → 409. |

Validasi `POST /api/sessions`:
- Format tanggal dan jam harus valid.
- Urutan jam harus `start ≤ present_until ≤ late_until ≤ end`.
- Nomor pertemuan yang sudah ada di kelas yang sama → 409.
- Sesi yang waktunya sudah lewat ditolak.
- Status awal dihitung otomatis dari jam server.

### 4.2 Kode hasil scan

| Kode | HTTP | Arti |
|---|---|---|
| `ATTENDANCE_RECORDED` | 200 | Berhasil; status PRESENT atau LATE |
| `MISSING_DATA` | 400 | `session_id` atau `qr_data` kosong |
| `SESSION_NOT_FOUND` | 404 | Sesi tidak ada |
| `FORBIDDEN` | 403 | Dosen bukan pengampu kelas ini |
| `INVALID_SIMULATED_TIME` | 400 | Format waktu simulasi salah (hanya bila simulasi aktif) |
| `SESSION_CLOSED` | 400 | Sesi CLOSED/FINALIZED, atau sudah lewat `end_time` |
| `INVALID_QR_CODE` | 400 | QR tidak dikenali |
| `STUDENT_INACTIVE` | 400 | Mahasiswa nonaktif (**baru**) |
| `STUDENT_NOT_REGISTERED` | 400 | Mahasiswa bukan peserta kelas |
| `SESSION_NOT_STARTED` | 400 | Belum `start_time` / belum tanggalnya |
| `ATTENDANCE_PERIOD_CLOSED` | 400 | Lewat `late_until` |
| `ALREADY_ATTENDED` | 409 | Sudah presensi di sesi ini |

### 4.3 Kode error umum

| Kode | HTTP | Arti |
|---|---|---|
| `AUTH_REQUIRED` | 401 | Token tidak dikirim |
| `TOKEN_EXPIRED` | 401 | Token kedaluwarsa (berlaku 12 jam). Sebelumnya membalas 403. |
| `TOKEN_INVALID` | 401 | Token tidak valid, misalnya server restart dengan secret acak |
| `FORBIDDEN` | 403 | Tidak berhak |
| `SESSION_FINALIZED` | 409 | Status presensi pada sesi FINALIZED tidak bisa diubah/dihapus (**baru**). Nilai sesi tetap bisa diisi. |
| `TOO_MANY_ATTEMPTS` | 429 | Login gagal 10× dalam 15 menit (per IP + username). Disertai header `Retry-After`. |
| `INVALID_JSON` | 400 | Body JSON rusak (**baru**, sebelumnya halaman HTML) |
| `PAYLOAD_TOO_LARGE` | 413 | Body > 100 KB |
| `INTERNAL_ERROR` | 500 | Error tak terduga, dibalas JSON berbahasa Indonesia |

### 4.4 Waktu simulasi (khusus pengujian)

- **Field:** `simulated_now` (`YYYY-MM-DDTHH:MM:SS`) atau `simulated_time` (`HH:MM:SS`, dengan tanggal = tanggal pertemuan) pada body request scan.
- **Kapan berlaku:** **hanya** jika env `ALLOW_SIMULATED_TIME=true`. Selain itu field ini diabaikan dan jam server yang dipakai, sehingga di produksi waktu tidak bisa dimanipulasi dari klien.

---

## 5. Keamanan

1. **Token QR acak:** `PQR-` + 16 byte acak (base64url). Token tidak bisa ditebak dari NIM. Data demo lama tetap memakai format `QR-STD-{NIM}-{kode}`.
2. **Kerahasiaan token QR:** token hanya terlihat oleh admin. Mahasiswa melihat tokennya sendiri lewat `/api/auth/me`. Dosen dan mahasiswa lain tidak menerima token di daftar mahasiswa, roster, maupun detail sesi.
3. **Otorisasi per kelas (`canManageClass`):** dosen hanya bisa mengelola kelas yang diampunya. Ini berlaku untuk scan, manual, nilai, hapus presensi, detail/buat/finalisasi/hapus sesi, roster, enroll/unenroll, dan rekap kelas. Mahasiswa hanya bisa melihat kelas tempat ia terdaftar.
4. **Endpoint dibatasi:** `GET /api/users/students` dan `GET /api/reports/dashboard` hanya untuk admin dan dosen.
5. **JWT:**
   - Payload minimal `{id, username, role}`, berlaku 12 jam.
   - Secret diambil dari env `JWT_SECRET`. Jika kosong, dibuat secret acak beserta peringatan; akibatnya login hilang setiap server restart.
6. **Rate limit login:** maksimal 10 kali gagal per 15 menit (dihitung per IP + username), disimpan di memori. Server memakai `trust proxy 1`.
7. **Security header:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (kamera hanya untuk origin sendiri), dan HSTS di produksi. Header `x-powered-by` dimatikan.
8. **CORS:** hanya aktif jika `CORS_ORIGIN` diisi.
9. **Query SQL:** semua memakai parameter (prepared statement), tidak ada penggabungan string.
10. **Transaksi:** pembuatan akun dan finalisasi sesi memakai transaksi agar data tidak setengah jadi.

---

## 6. Perubahan tampilan / UX (frontend)

- **Badge status sesi:** lima status dengan label Indonesia dan warna masing-masing:
  - Terjadwal (abu-abu)
  - Aktif (hijau)
  - Presensi Ditutup (kuning)
  - Ditutup (merah)
  - Final (ungu)

  Filter status di dashboard admin dan dosen juga memakai lima status ini.
- **Detail sesi:**
  - Tombol **Tutup & Finalisasi** dengan konfirmasi.
  - Scanner hanya bisa dibuka saat sesi Aktif; di luar itu tampil keterangan alasannya.
  - Presensi manual per mahasiswa.
  - Input nilai dinonaktifkan jika mahasiswa belum punya record presensi.
- **Scanner QR:**
  - Pesan error spesifik per kode (judul + petunjuk), termasuk Mahasiswa Nonaktif.
  - Jeda 3 detik untuk QR yang sama, agar tidak terbaca berulang kali.
- **Admin:**
  - Tombol **Buat Ulang QR**.
  - Kolom Status dan tombol **Aktif/Nonaktif** mahasiswa.
  - Tombol **Rekap** di tab Kelas, yang sebelumnya tidak ada sehingga admin tidak bisa membuka rekap.
- **Form buat sesi (dosen):**
  - Nomor pertemuan otomatis terisi nomor berikutnya per kelas.
  - Tanggal dan jam cepat diambil dari jam server WIB: mulai = sekarang, hadir +15 menit, telat +60 menit, selesai +120 menit, dibatasi maksimal 23:59.
  - Ada pengaman klik ganda.
  - Muncul pesan jika dosen belum mengampu kelas.
  - Label tombol menjadi "Simpan Sesi".
- **Login kedaluwarsa:** pengguna otomatis kembali ke halaman login dengan pesan "Sesi login Anda telah berakhir".
- **Tampilan error:**
  - Detail Sesi dan Rekap Kelas menampilkan kartu error dengan tombol Coba Lagi / Kembali.
  - Dashboard menampilkan banner jika data gagal dimuat.
  - Polling berhenti jika akses ditolak atau data tidak ditemukan.
- **Jam navbar:** jam server WIB (disinkronkan lewat `/api/time` setiap 5 menit), bukan jam perangkat.
- **Profil:** ganti password wajib mengisi password lama (minimal 6 karakter).
- **Dashboard mahasiswa:** pemberitahuan jika akun berstatus nonaktif.
- **Kartu QR:** tidak error jika token tidak tersedia; tombol unduh dinonaktifkan.

### 6.1 Navigasi & pembaruan data otomatis
- **Navigasi lewat URL hash:** `#/sesi/:id` (detail sesi) dan `#/rekap/:id` (rekap kelas).
  - Refresh halaman tetap di halaman yang sama.
  - Tombol Back browser/HP kembali ke dashboard, bukan keluar aplikasi.
  - Link detail sesi bisa dibuka langsung; ID tidak valid/bukan haknya menampilkan kartu error.
  - Admin: tab terakhir (Mahasiswa/Dosen/Kelas/Sesi) diingat saat kembali dari detail.
- **Auto-refresh 30 detik** di dashboard admin, dosen, dan mahasiswa. Berhenti saat tab tidak terlihat dan langsung memuat ulang saat pengguna kembali ke tab. Detail sesi tetap polling 5 detik (dilewati saat tab tidak terlihat).

### 6.2 Fitur baru
- **Input token manual di scanner:** cadangan jika kamera gagal / tidak ada HTTPS, dan bisa dipakai barcode scanner USB (ketik lalu Enter). Terbuka otomatis bila kamera gagal. Validasinya sama persis dengan scan kamera.
- **"Sesi Hari Ini" di dashboard mahasiswa:** daftar sesi hari ini (tanggal server) dengan status sesi, jam aturan, status presensi pribadi, dan petunjuk (mis. "Tunjukkan QR ke dosen sebelum 18:15 agar tercatat Hadir"). Tombol **Tampilkan QR Saya** menggulir ke kartu QR.
- **Kunci rekap final:** tombol Presensi/Presensi Manual nonaktif pada sesi FINALIZED, dengan keterangan; nilai tetap bisa diubah.
- **Export CSV ramah Excel Indonesia:** BOM UTF-8, pemisah `;`, desimal koma, setiap sel dikutip (aman untuk nama berisi `;`/tanda kutip), proteksi formula injection, dan baris "Diekspor" berisi waktu server.

### 6.3 Tampilan HP (responsif)
- Semua modal bisa di-scroll di layar kecil (form panjang tidak terpotong).
- Input berukuran 16px di HP agar iPhone tidak zoom otomatis; tanpa kilatan biru saat tap.
- Navbar ringkas; jam WIB tetap tampil di HP.
- Detail sesi: daftar mahasiswa berbentuk **kartu** di HP, tombol **Scan QR mengambang** di bawah layar saat sesi Aktif, aturan waktu 2×2.
- Riwayat presensi mahasiswa berbentuk kartu di HP.
- Scanner: kotak bidik menyesuaikan layar; pesan jelas bila kamera diblokir karena bukan HTTPS.
- Header tab admin bertumpuk di HP.

### 6.4 Performa & kerapian kode
- **Lazy loading per halaman:** unduhan awal turun dari ±814 KB menjadi ±253 KB; library kamera hanya diunduh saat membuka detail sesi.
- Komponen bersama `AttendanceStatusBadge` (dipakai detail sesi & dashboard mahasiswa).
- Lint (`npm --prefix client run lint`): **0 peringatan** (sebelumnya ±40).

---

## 7. Variabel lingkungan (env)

| Env | Default | Fungsi |
|---|---|---|
| `PORT` | 3000 | Port server |
| `DB_PATH` | `server/presensi.db` | Lokasi file database |
| `JWT_SECRET` | acak per proses | Wajib diisi di produksi |
| `NODE_ENV` | – | `production` mengaktifkan HSTS dan peringatan |
| `CORS_ORIGIN` | kosong (CORS mati) | Daftar origin, dipisah koma |
| `APP_TIMEZONE` | `Asia/Jakarta` | Zona waktu acuan |
| `ALLOW_SIMULATED_TIME` | `false` | Mengizinkan waktu simulasi saat scan (hanya untuk pengujian) |
| `SEED_DEMO` | aktif | `false` = tanpa data demo |

Contoh lengkap dengan penjelasan tersedia di file **`.env.example`** (salin menjadi `.env`).

---

## 8. Pengujian (untuk Bab IV)

- **Perintah:** `npm test` (file `test-capstone.js`).
- **Metode:** black-box, dengan teknik Equivalence Partitioning (EP) dan Boundary Value Analysis (BVA).
- **Cara kerja script:**
  - Menjalankan server sendiri sebagai child process (port 3999) dengan database sementara dan data demo.
  - Tahap pertama dengan `ALLOW_SIMULATED_TIME=true`; tahap kedua dengan simulasi dimatikan.
  - Sesi uji dibuat untuk **besok** agar tidak terpengaruh jam nyata: mulai 18:00, hadir s/d 18:15, telat s/d 19:00, selesai 20:00.
- **Hasil:** tabel lengkap tersimpan otomatis di `docs/hasil-pengujian.md`. Hasil terakhir: **19/19 lulus**.

| ID | Modul | Teknik | Skenario | Expected |
|---|---|---|---|---|
| TC-01 | Validasi QR | EP | QR acak dan format salah | `INVALID_QR_CODE` |
| TC-02 | Keanggotaan kelas | EP | Mahasiswa bukan peserta kelas | `STUDENT_NOT_REGISTERED` |
| TC-03 | Status sesi | BVA | Scan 17:59:59 (sebelum mulai) | `SESSION_NOT_STARTED` |
| TC-04 | Presensi ganda | EP | Scan kedua mahasiswa yang sama | `ALREADY_ATTENDED` (409), record tetap 1 |
| TC-05 | Klasifikasi waktu | BVA | Tepat 18:15:00 | PRESENT |
| TC-06 | Klasifikasi waktu | BVA | 18:15:01 dan tepat 19:00:00 | LATE |
| TC-07 | Klasifikasi waktu | BVA | 19:00:01 | `ATTENDANCE_PERIOD_CLOSED` |
| TC-08 | Penutupan otomatis | BVA | Scheduler pada 20:00:00 lalu 20:00:01 | 20:00:00 belum final; 20:00:01 FINALIZED dan yang belum scan menjadi ABSENT |
| TC-09 | Keamanan token QR | EP | Mahasiswa mengakses daftar/detail kelas | 403; token orang lain tidak bocor |
| TC-10 | Otorisasi dosen | EP | Dosen lain scan di kelas bukan miliknya | 403 `FORBIDDEN` |
| TC-11 | Waktu server | EP | Simulasi dimatikan, kirim `simulated_now`/`simulated_time` | Diabaikan → `SESSION_NOT_STARTED` |
| TC-12 | Status mahasiswa | EP | Mahasiswa dinonaktifkan lalu di-scan | `STUDENT_INACTIVE`; setelah diaktifkan kembali → PRESENT |
| TC-13 | Sesi login | EP | Token tidak valid | 401 `TOKEN_INVALID` |
| TC-14 | Validasi input | EP | Body JSON rusak | 400 JSON `INVALID_JSON` |
| TC-15 | Data identitas | EP | Mahasiswa mengubah profil sendiri | 403, data tidak berubah |
| TC-16 | Manajemen akun | BVA | Password 5 lalu 6 karakter | 400 tanpa akun yatim, lalu 201 |
| TC-17 | Integritas rekap final | EP | Ubah status manual & hapus record pada sesi FINALIZED; isi nilai | Ubah/hapus 409 `SESSION_FINALIZED`, status tetap ABSENT; nilai 200 |
| TC-18 | Sesi Hari Ini | EP | Mahasiswa meminta sesi per tanggal; tanggal tidak valid | Hanya sesi tanggal itu, `my_status` sesuai record; tanggal salah 400 |
| TC-19 | Keamanan statistik dosen | EP | dosen2 membuka statistik dashboard | Hanya kelasnya sendiri; log kelas dosen1 tidak terlihat |

---

## 9. Daftar file yang berubah

- **Backend:**
  - **Baru:** `server/time.js`, `server/access.js`.
  - **Diubah:** `server/db.js`, `server/scheduler.js`, `server/auth.js`, `server/index.js`, dan route `attendance`, `sessions`, `users`, `classes`, `reports`, `auth`.
- **Frontend:**
  - **Baru:** `client/src/sessionStatus.js`, `client/src/serverClock.js`, `client/src/hashRoute.js`, `client/src/useAutoRefresh.js`, `components/SessionStatusBadge.jsx`, `components/AttendanceStatusBadge.jsx`, `components/LoadError.jsx`.
  - **Diubah:** `api.js`, `App.jsx`, `index.css`, `Navbar.jsx`, `Login.jsx`, `AdminDashboard.jsx`, `DosenDashboard.jsx`, `SessionDetail.jsx`, `ClassReport.jsx`, `MahasiswaDashboard.jsx`, `QRScannerModal.jsx`, `StudentCard.jsx`, `ClassRosterModal.jsx`, `ManualAttendanceModal.jsx`, `UserProfileModal.jsx`, `client/.oxlintrc.json`.
- **Test & dokumen:**
  - `test-capstone.js` ditulis ulang (19 kasus uji).
  - `docs/hasil-pengujian.md` dihasilkan otomatis.
  - `CLAUDE.md` berisi aturan project.
- **Konfigurasi repo:**
  - `.gitignore` kini mengabaikan file database (`*.db`, `*.sqlite`); `server/presensi.db` dikeluarkan dari git (file lokal tetap ada, dibuat & di-seed ulang otomatis bila tidak ada).
  - `.env.example` baru.

---

## 10. Hal yang perlu disesuaikan di proposal

1. **Siklus status sesi menjadi 5 status** (sebelumnya hanya ACTIVE/CLOSED). Diagram state dan tabel `attendance_sessions` perlu diperbarui, termasuk kolom `finalized_at`.
2. **Mahasiswa aktif/nonaktif (BR-01):**
   - Kolom `students.is_active` ditambahkan.
   - Admin bisa menonaktifkan mahasiswa tanpa menghapus riwayatnya.
   - Kode tolak baru: `STUDENT_INACTIVE`.
3. **Finalisasi manual:** endpoint `POST /sessions/:id/finalize` (tombol Tutup & Finalisasi), di samping finalisasi otomatis oleh scheduler.
4. **Buat ulang QR:** token QR permanen bisa dibuat ulang oleh admin (misalnya jika kartu hilang); QR lama langsung tidak berlaku.
5. **Format token QR:** acak 128-bit (`PQR-…`), tidak lagi turunan NIM.
6. **Scheduler:** berjalan tiap 15 detik dan juga setiap ada request, karena server di Render free bisa "tidur".
7. **Waktu simulasi** hanya untuk pengujian, dikunci lewat `ALLOW_SIMULATED_TIME`. Ini perlu dijelaskan di metodologi pengujian.
8. **Kode respons:** scan ganda memakai HTTP 409; token kedaluwarsa memakai HTTP 401.
9. **Aspek keamanan baru** (bisa menjadi subbab tersendiri): rate limit login, security header, kerahasiaan token QR, otorisasi per kelas, dan transaksi database.
10. **Hak ubah data:** identitas mahasiswa (nama/NIM/prodi) hanya bisa diubah admin. Dosen boleh mengubah nama/email sendiri. Semua pengguna bisa mengganti password sendiri dengan memasukkan password lama.
11. **Nomor pertemuan unik per kelas**, dijamin oleh index unik di database.
12. **Tabel pengujian:** gunakan tabel di Bagian 8, yang bertambah dari 11 menjadi 19 kasus uji.
13. **Sesi FINALIZED = rekap terkunci:** setelah finalisasi, status presensi tidak bisa diubah atau dihapus (kode `SESSION_FINALIZED`); hanya nilai sesi yang masih bisa diisi. Ini memperjelas makna status FINALIZED di diagram state.
14. **Fitur "Sesi Hari Ini" untuk mahasiswa** (kebutuhan fungsional baru): mahasiswa melihat sesi hari ini beserta status presensinya.
15. **Cadangan input token manual** pada scanner (kebutuhan non-fungsional: ketersediaan bila kamera gagal).
16. **Rancangan antarmuka responsif** (desktop & HP) dapat ditambahkan pada subbab perancangan UI.

---

## 11. Status rencana & catatan teknis

**Tahap 2 – UX: selesai** (lihat Bagian 6.1–6.2)
- ✅ Navigasi lewat URL hash (refresh & tombol Back berfungsi).
- ✅ Dashboard diperbarui otomatis setiap 30 detik.
- ✅ Input manual token di scanner.
- ✅ "Sesi Hari Ini" di dashboard mahasiswa.
- ✅ Export CSV rapi di Excel Indonesia.

**Tahap 3 – Kerapian: selesai**
- ✅ `server/presensi.db` dikeluarkan dari git dan diabaikan lewat `.gitignore`.
- ✅ `.env.example` ditambahkan.
- ✅ Warning lint dibersihkan (0 peringatan).

**Catatan teknis yang sudah ditangani**
- ✅ Presensi manual ABSENT kini mencatat `scan_time = '-'`.
- ✅ Edit/hapus presensi pada sesi FINALIZED ditolak.
- ✅ Statistik dashboard dosen hanya mencakup kelasnya sendiri.

**Catatan teknis yang masih terbuka**
- Data di Render free hilang setiap restart; untuk pemakaian nyata perlu database permanen.
- Kamera di HP hanya berfungsi lewat HTTPS (otomatis terpenuhi saat di-hosting di Render).
- Belum ada test otomatis untuk frontend (pengujian frontend dilakukan manual).
