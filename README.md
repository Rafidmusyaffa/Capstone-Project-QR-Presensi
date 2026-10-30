# Sistem Informasi Presensi Mahasiswa Berbasis QR Code

Proyek capstone STSI4440 Universitas Terbuka: **"Rancang Bangun Sistem Informasi Presensi Mahasiswa Berbasis QR Code dengan Manajemen Sesi dan Waktu Presensi"**.

Mahasiswa memiliki kartu QR permanen. Dosen memindai QR tersebut saat sesi perkuliahan. Server memvalidasi identitas, keanggotaan kelas, dan status sesi, lalu mengklasifikasikan kehadiran (Hadir/Telat) dengan jam server WIB. Setelah sesi berakhir, sistem menutup sesi, mencatat mahasiswa yang tidak hadir sebagai Absen, dan memfinalisasi rekap.

**Teknologi:** React 19 + Vite + Tailwind CSS 4 (folder `client/`), Node.js + Express 5 + SQLite bawaan Node (`node:sqlite`) (folder `server/`).

---

## Fitur

- **Lima status sesi:** `SCHEDULED` (Terjadwal) → `ACTIVE` (Aktif) → `ATTENDANCE_CLOSED` (Presensi Ditutup) → `CLOSED` (Ditutup) → `FINALIZED` (Final). Status berpindah otomatis mengikuti jam server; dosen juga bisa menutup dan memfinalisasi sesi lebih awal.
- **Aturan waktu presensi** (presisi detik, zona Asia/Jakarta):
  - **Hadir** jika `start_time ≤ waktu scan ≤ present_until`.
  - **Telat** jika `present_until < waktu scan ≤ late_until`.
  - Scan setelah `late_until` ditolak.
  - Setelah `end_time`, mahasiswa yang belum presensi dicatat **Absen** secara massal, lalu sesi difinalisasi dan rekapnya terkunci.
- **Validasi scan:** QR harus terdaftar, mahasiswa harus aktif dan terdaftar di kelas sesi, dan satu mahasiswa hanya bisa presensi sekali per sesi. Setiap penolakan memiliki kode dan pesan yang jelas.
- **Keamanan:**
  - Token QR acak 128-bit.
  - Token hanya terlihat oleh admin dan pemiliknya.
  - Dosen hanya bisa mengelola kelas yang diampunya.
  - Rate limit login dan security header.
  - Waktu tidak bisa dimanipulasi dari perangkat klien.
- **Mahasiswa nonaktif:** admin bisa menonaktifkan mahasiswa tanpa menghapus riwayatnya. QR mahasiswa nonaktif ditolak saat di-scan.
- **Buat ulang QR:** admin bisa membuat token QR baru (misalnya kartu hilang); QR lama langsung tidak berlaku.
- **Scanner kamera** dengan cadangan **input token manual** (juga untuk barcode scanner USB).
- **Presensi manual dan penilaian sesi (0–100)** oleh dosen/admin.
- **Rekap kelas:** matriks presensi dan nilai per pertemuan, cetak laporan, dan **export CSV** yang langsung rapi di Excel versi Indonesia.
- **Dashboard mahasiswa:** kartu QR, "Sesi Hari Ini" beserta status presensinya, dan riwayat presensi.
- **Tampilan responsif** untuk desktop dan HP.

---

## Prasyarat

- **Node.js ≥ 22.5** (dibutuhkan untuk modul bawaan `node:sqlite`). Cek dengan `node -v`.
- npm (terpasang bersama Node.js).

---

## Menjalankan di komputer lokal

```bash
npm install   # install dependensi server & client, lalu build client (otomatis, sekali)
npm start     # jalankan server
```

Buka **http://localhost:3000**.

- `npm install` menjalankan skrip `postinstall` yang menginstall dependensi `client/` dan mem-build frontend ke `client/dist`. Tidak perlu menjalankan build terpisah.
- Setelah mengubah kode frontend, jalankan `npm run build` untuk mem-build ulang (server tidak perlu di-restart).
- Di Windows bisa juga klik dua kali `install.bat`, lalu `start.bat`.
- Database `server/presensi.db` dibuat dan diisi data demo otomatis saat server pertama kali berjalan. Hapus file itu untuk kembali ke data demo awal.

### Mode pengembangan (hot reload frontend)

```bash
npm run dev:server   # terminal 1: API di http://localhost:3000
npm run dev:client   # terminal 2: Vite di http://localhost:5173
```

### Mencoba di HP

Buka `http://<IP-laptop>:3000` dari HP yang terhubung ke Wi-Fi yang sama. Browser hanya mengizinkan kamera lewat **HTTPS** (atau `localhost`), jadi lewat alamat IP biasa scanner kamera tidak aktif. Gunakan input token manual, atau coba setelah di-deploy ke Render (otomatis HTTPS).

---

## Akun demo

Semua akun berikut dibuat oleh seed di `server/db.js`.

| Role | Username | Password | Nama | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| Admin | `admin` | `admin123` | – | Akses penuh: mahasiswa, dosen, kelas, sesi, rekap |
| Dosen | `dosen1` | `dosen123` | Dr. Budi Santoso, M.Kom | Pengampu **SI-05 Database Systems** (Rabu 18:00–20:00, Lab Komputer 3) |
| Dosen | `dosen2` | `dosen123` | Siti Aminah, S.Kom., M.T | Pengampu **SI-07 Pemrograman Web Lanjut** (Kamis 13:00–15:30, Ruang Teori 204) |
| Mahasiswa | `mahasiswa1` | `mhs123` | Rafid Musyaffa (220101001) | Peserta SI-05 |
| Mahasiswa | `mahasiswa2` | `mhs123` | Muhammad Syahrul (220101002) | Peserta SI-05 dan SI-07 |
| Mahasiswa | `mahasiswa3` | `mhs123` | Lina Dewi Pakpahan (220101003) | Peserta SI-05 |
| Mahasiswa | `mahasiswa4` | `mhs123` | Fajar Nugraha (220101004) | Peserta SI-07 saja. Cocok untuk menguji penolakan "tidak terdaftar di kelas" pada sesi SI-05 |

Seed juga membuat satu sesi demo **SI-05 Pertemuan #5** pada tanggal server dijalankan (mulai 00:00, hadir s/d 23:45, telat s/d 23:55, selesai 23:59). Sesi ini langsung bisa dipakai untuk mencoba scan. Token QR demo dibuat acak setiap kali seed berjalan. Lihat tokennya di kartu QR mahasiswa atau di menu admin.

---

## Pengujian

```bash
npm test
```

`test-capstone.js` berjalan mandiri:
- Menyalakan server sendiri di port 3999 dengan database sementara.
- Membuat sesi uji untuk besok (mulai 18:00, hadir s/d 18:15, telat s/d 19:00, selesai 20:00).
- Menjalankan kasus uji black-box (Equivalence Partitioning & Boundary Value Analysis) TC-01 s/d TC-19.

Hasilnya dicetak sebagai tabel dan disimpan ke [`docs/hasil-pengujian.md`](docs/hasil-pengujian.md).

Lint frontend: `npm --prefix client run lint`.

---

## Variabel lingkungan

Salin [`.env.example`](.env.example) menjadi `.env` lalu sesuaikan. Semua variabel bersifat opsional untuk lokal; `JWT_SECRET` wajib di produksi.

| Variabel | Default | Fungsi |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port HTTP server (Render mengisinya otomatis) |
| `JWT_SECRET` | acak per proses | Secret penandatangan token login. Jika kosong, semua pengguna logout setiap server restart |
| `NODE_ENV` | – | `production` mengaktifkan HSTS dan peringatan konfigurasi |
| `DB_PATH` | `server/presensi.db` | Lokasi file database SQLite |
| `APP_TIMEZONE` | `Asia/Jakarta` | Zona waktu acuan semua aturan presensi |
| `SEED_DEMO` | `true` | `false` = database baru tidak diisi data demo |
| `CORS_ORIGIN` | kosong (CORS mati) | Daftar origin yang diizinkan, dipisah koma. Tidak perlu jika frontend & API satu domain |
| `ALLOW_SIMULATED_TIME` | `false` | **Khusus pengujian.** Mengizinkan waktu simulasi pada request scan. Jangan aktifkan di produksi |

---

## Struktur folder

```text
presensi-qr/
├── client/                         # Frontend (React + Vite + Tailwind CSS)
│   └── src/
│       ├── components/             # Scanner QR, kartu QR, modal, badge status, dll.
│       ├── pages/                  # Login, dashboard Admin/Dosen/Mahasiswa, Detail Sesi, Rekap Kelas
│       ├── api.js                  # HTTP client + penanganan login kedaluwarsa
│       ├── hashRoute.js            # Navigasi berbasis URL hash (#/sesi/:id, #/rekap/:id)
│       ├── serverClock.js          # Sinkronisasi jam server (WIB)
│       ├── sessionStatus.js        # Label & warna 5 status sesi
│       ├── useAutoRefresh.js       # Pembaruan data otomatis tiap 30 detik
│       └── App.jsx                 # Root aplikasi & pemilihan halaman
├── server/                         # Backend API (Express + SQLite)
│   ├── routes/                     # auth, users, classes, sessions, attendance, reports
│   ├── access.js                   # Otorisasi per kelas & penyembunyian token QR
│   ├── auth.js                     # JWT & middleware peran
│   ├── db.js                       # Skema, migrasi, dan seed data demo
│   ├── qrToken.js                  # Pembuat token QR acak (PQR-…)
│   ├── scheduler.js                # Pembaruan status sesi & finalisasi otomatis
│   ├── time.js                     # Jam server Asia/Jakarta & fase sesi
│   └── index.js                    # Entry point, security header, file statis client/dist
├── docs/
│   ├── hasil-pengujian.md          # Hasil npm test (dibuat otomatis)
│   └── ringkasan-perubahan.md      # Catatan perubahan untuk pembaruan proposal
├── test-capstone.js                # Pengujian black-box TC-01 s/d TC-19
├── .env.example                    # Contoh konfigurasi
├── install.bat / start.bat         # Pintasan install & jalankan di Windows
└── package.json
```

`client/dist/` dan file database (`*.db`) tidak disimpan di git; keduanya dibuat ulang otomatis.

---

## Deploy ke Render

1. Push repository ini ke GitHub.
2. Di [Render](https://render.com), pilih **New → Web Service** dan hubungkan repository-nya.
3. Isi konfigurasi:
   - **Runtime:** Node
   - **Build Command:** `npm install` (skrip `postinstall` sekaligus mem-build frontend)
   - **Start Command:** `npm start`
4. Di menu **Environment**, tambahkan:

   | Key | Value |
   | :--- | :--- |
   | `JWT_SECRET` | string acak panjang, mis. hasil `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `NODE_ENV` | `production` |
   | `APP_TIMEZONE` | `Asia/Jakarta` |

5. Klik **Create Web Service**. Versi Node mengikuti `engines` di `package.json` (≥ 22.5). Jika Render memakai versi lama, tambahkan env `NODE_VERSION` = `22.12.0` atau lebih baru.

> **Catatan Render free:** filesystem bersifat sementara. Setiap kali server restart atau "tidur" lalu bangun kembali, database kosong lagi dan **diisi ulang dengan data demo**. Semua data yang dibuat sebelumnya (sesi, presensi, akun baru) hilang dan token QR demo berubah. Untuk pemakaian nyata dibutuhkan penyimpanan permanen (persistent disk atau database terkelola).

---

## Lisensi

Dikembangkan untuk keperluan akademik (capstone). Lisensi ISC.
