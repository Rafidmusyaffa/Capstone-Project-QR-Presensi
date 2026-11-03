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
- Database `server/presensi.db` dibuat dan diisi data demo otomatis saat server pertama kali berjalan. Hapus file itu untuk kembali ke isi `server/seed-data.json`.

### Mode pengembangan (hot reload frontend)

```bash
npm run dev:server   # terminal 1: API di http://localhost:3000
npm run dev:client   # terminal 2: Vite di http://localhost:5173
```

### Mencoba di HP

Buka `http://<IP-laptop>:3000` dari HP yang terhubung ke Wi-Fi yang sama. Browser hanya mengizinkan kamera lewat **HTTPS** (atau `localhost`), jadi lewat alamat IP biasa scanner kamera tidak aktif. Gunakan input token manual, pakai [Demo Online](#demo-online-cloudflare-tunnel), atau coba setelah di-deploy ke Render (otomatis HTTPS).

---

## Akun demo

Data demo berasal dari [`server/seed-data.json`](server/seed-data.json), yaitu hasil ekspor database lokal. Versi online menampilkan data yang sama: mahasiswa, kelas, jadwal, sesi, dan seluruh presensinya. Sesi yang sudah `FINALIZED` tetap terkunci, dan token QR tetap sama sehingga kartu QR yang sudah dicetak bisa dipindai di versi online.

| Role | Username | Password |
| :--- | :--- | :--- |
| Admin | `admin` | `admin123` |
| Dosen | `dosen1`, `dosen2` | `dosen123` |
| Mahasiswa | `mahasiswa1` s/d `mahasiswa5` | `mhs123` |

Password asli tidak ikut diekspor. Saat seed berjalan, semua akun memakai password demo di atas sesuai role-nya. Empat digit terakhir NIM juga disamarkan saat ekspor, jadi NIM di data demo bukan NIM asli.

Seed juga menambahkan satu sesi demo **Capstone Project** pada tanggal server dijalankan, dengan nomor pertemuan berikutnya (mulai 00:00, hadir s/d 23:45, telat s/d 23:55, selesai 23:59). Sesi ini langsung bisa dipakai untuk mencoba scan.

### Memperbarui data demo

```bash
npm run seed:export   # tulis ulang server/seed-data.json dari server/presensi.db
```

Setelah itu commit `server/seed-data.json` dan deploy ulang. Jika file ini tidak ada, atau `SEED_SOURCE=builtin`, server memakai seed bawaan di `server/db.js`.

---

## Pengujian

```bash
npm test
```

`test-capstone.js` berjalan mandiri:
- Menyalakan server sendiri di port 3999 dengan database sementara dan seed bawaan (`SEED_SOURCE=builtin`).
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
| `SEED_SOURCE` | kosong | `builtin` = pakai seed bawaan di `server/db.js`, bukan `server/seed-data.json` |
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
│   ├── scripts/export-seed.js      # Ekspor database lokal ke seed-data.json
│   ├── access.js                   # Otorisasi per kelas & penyembunyian token QR
│   ├── auth.js                     # JWT & middleware peran
│   ├── db.js                       # Skema, migrasi, dan seed data demo
│   ├── qrToken.js                  # Pembuat token QR acak (PQR-…)
│   ├── scheduler.js                # Pembaruan status sesi & finalisasi otomatis
│   ├── seed-data.json              # Data demo (hasil npm run seed:export)
│   ├── time.js                     # Jam server Asia/Jakarta & fase sesi
│   └── index.js                    # Entry point, security header, file statis client/dist
├── docs/
│   ├── hasil-pengujian.md          # Hasil npm test (dibuat otomatis)
│   └── ringkasan-perubahan.md      # Catatan perubahan untuk pembaruan proposal
├── scripts/demo-online.js          # Server + Cloudflare Quick Tunnel untuk demo lewat HTTPS
├── test-capstone.js                # Pengujian black-box TC-01 s/d TC-19
├── .env.example                    # Contoh konfigurasi
├── install.bat / start.bat         # Pintasan install & jalankan di Windows
├── demo-online.bat                 # Pintasan demo online (Cloudflare Tunnel)
└── package.json
```

`client/dist/` dan file database (`*.db`) tidak disimpan di git; keduanya dibuat ulang otomatis.

---

## Demo Online (Cloudflare Tunnel)

Cara cepat membuat aplikasi di laptop bisa dibuka dari HP lewat **HTTPS**, sehingga scanner kamera berfungsi, tanpa deploy.

**Prasyarat:** [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) terinstall. Setelah install, buka terminal baru agar PATH terbaca.

```bash
npm run demo:online
```

Di Windows bisa juga klik dua kali `demo-online.bat`. Skrip ini:
1. Mem-build frontend jika `client/dist` belum ada.
2. Menyalakan server di port 3000 (`NODE_ENV=production`, simulasi waktu dimatikan).
3. Membuka Cloudflare Quick Tunnel, lalu menampilkan link `https://xxxx.trycloudflare.com`, menyalinnya ke clipboard, dan membukanya di browser.

Tekan **Ctrl+C** untuk berhenti; server dan tunnel dihentikan bersama sehingga port 3000 bebas lagi.

Catatan:
- **Link berubah setiap kali dijalankan.** Bagikan link terbaru ke dosen sebelum demo. Jika link baru belum bisa dibuka, tunggu beberapa detik.
- **Hanya aktif selama laptop menyala, terhubung internet, dan jendela demo tetap terbuka.**
- **Data yang dipakai adalah database lokal** `server/presensi.db` apa adanya (tidak di-reset atau di-seed ulang). Semua perubahan saat demo langsung tersimpan di sana.
- Siapa pun yang punya link bisa membuka halaman login, jadi pastikan password akun di database lokal tidak mudah ditebak jika link disebar luas.
- Isi `JWT_SECRET` di `.env` agar login tidak terputus saat server dijalankan ulang.

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

> **Catatan Render free:** filesystem bersifat sementara. Setiap kali server restart atau "tidur" lalu bangun kembali, database kosong lagi dan **diisi ulang dari `server/seed-data.json`**. Perubahan yang dibuat di versi online (sesi, presensi, akun baru) hilang, tetapi token QR tetap sama. Untuk pemakaian nyata dibutuhkan penyimpanan permanen (persistent disk atau database terkelola).

---

## Lisensi

Dikembangkan untuk keperluan akademik (capstone). Lisensi ISC.
