# 🎓 Sistem Informasi Presensi Mahasiswa Berbasis QR Code

Aplikasi web modern untuk manajemen presensi mahasiswa dan dosen dengan validasi **Permanent QR Code**, aturan waktu presensi dinamis (*Time-Based Rules*), penilaian sesi pertemuan (*Session Grading*), kartu identitas QR digital, serta rekapitulasi laporan presensi matriks dan ekspor Excel (CSV).

---

## 🌟 Fitur Utama

1. **Scanner Kamera QR Code Live:**
   - Deteksi QR code real-time langsung melalui kamera perangkat (laptop, webcam, smartphone).
   - Validasi instan ke server dengan efek audio dan konfirmasi visual.
   - Deteksi otomatis status kehadiran: **Hadir** (tepat waktu) atau **Telat** (terlambat).

2. **Aturan Waktu Validasi Sesi (Time-Based Validation):**
   - **Waktu Mulai:** Waktu pembukaan sesi absensi.
   - **Hadir s/d:** Batas waktu kehadiran tepat waktu (*Hadir*).
   - **Batas Waktu Telat:** Batas toleransi keterlambatan (*Telat*).
   - **Waktu Selesai:** Sesi ditutup otomatis (*Tutup*), scan setelah waktu ini ditolak otomatis.

3. **Penilaian Sesi Pertemuan (Session Scoring & Feedback):**
   - Dosen dan Admin dapat menginputkan nilai sesi pertemuan (0–100) dan catatan/feedback per mahasiswa.
   - Rekap nilai per pertemuan dan kalkulasi otomatis **Rata-rata Nilai**.

4. **Kartu Identitas QR Code Digital & Mode Admin:**
   - Setiap mahasiswa memiliki QR Code unik dan permanen (*Permanent QR Token*).
   - Mahasiswa dapat melihat dan mengunduh kartu QR mereka di portal mahasiswa.
   - **Mode Admin:** Admin dapat melihat gambar QR code setiap mahasiswa langsung pada tabel dan mencetak/mengunduh kartu identitas mahasiswa.

5. **Laporan & Rekapitulasi Lengkap:**
   - Matriks kehadiran per mahasiswa di setiap pertemuan (Hadir, Telat, Absen, dan Nilai).
   - Ekspor laporan presensi dan penilaian ke format **Excel (CSV)**.
   - Fitur cetak laporan langsung via browser (*Print-Ready*).

---

## 🔑 Kredensial Login Demo

Sistem telah dilengkapi dengan data awal (*seeded initial data*):

| Role | Username | Password | Keterangan |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Akses penuh seluruh master data, kelas, dosen, mahasiswa, dan log presensi |
| **Dosen** | `dosen1` | `dosen123` | Dr. Budi Santoso, M.Kom |
| **Dosen** | `dosen2` | `dosen123` | Siti Aminah, S.Kom., M.T |
| **Mahasiswa** | `mahasiswa1` | `mhs123` | Rafid Musyaffa |
| **Mahasiswa** | `mahasiswa2` | `mhs123` | Muhammad Syahrul |
| **Mahasiswa** | `mahasiswa3` | `mhs123` | Lina Dewi Pakpahan |
| **Mahasiswa** | `mahasiswa4` | `mhs123` | Fajar Nugraha |

---

## 🚀 Panduan Menjalankan di Visual Studio Code (Localhost)

### Prasyarat
- **Node.js** versi 18, 20, atau lebih baru ([Download Node.js](https://nodejs.org/)).

### Langkah 1: Buka Project di Visual Studio Code
1. Ekstrak file zip `presensi-qr.zip`.
2. Buka aplikasi **Visual Studio Code**.
3. Pilih menu **File > Open Folder...**, lalu pilih folder `presensi-qr`.

### Langkah 2: Buka Terminal VS Code
Tekan kombinasi tombol ``Ctrl + ` `` (atau menu **Terminal > New Terminal**).

### Langkah 3: Install Dependensi
Jalankan perintah berikut di terminal:
```bash
npm run install:all
```
*Perintah ini akan otomatis menginstall dependensi untuk backend dan frontend.*

### Langkah 4: Jalankan Aplikasi
Jalankan server:
```bash
npm start
```
Buka browser dan akses:
👉 **`http://localhost:3000`** (atau `http://127.0.0.1:3000`)

---

## 🛠️ Opsi Mode Pengembangan (Development)

Jika Anda ingin memodifikasi kode frontend dengan *Hot Module Replacement (HMR)* aktif:

1. **Terminal 1 (Backend Server):**
   ```bash
   npm run dev:server
   ```
2. **Terminal 2 (Frontend Vite Live Dev):**
   ```bash
   npm run dev:client
   ```
   Akses frontend di `http://localhost:5173`.

---

## 📤 Panduan Push ke GitHub

Untuk membagikan atau menyimpan kode proyek di GitHub:

1. Buat repository baru di [GitHub](https://github.com/new) (misalnya diberi nama `presensi-qr`).
2. Buka terminal di folder project pada VS Code, lalu jalankan:
   ```bash
   git init
   git add .
   git commit -m "feat: complete presensi qr system with grading and admin qr view"
   git branch -M main
   git remote add origin https://github.com/USERNAME_GITHUB_ANDA/presensi-qr.git
   git push -u origin main
   ```
*(File `node_modules` sudah otomatis diabaikan berkat file `.gitignore`).*

---

## 🌐 Panduan Hosting / Deploy Online

Aplikasi ini menggunakan Express.js yang siap menyajikan frontend production build (`client/dist`).

### Opsi A: Deploy di Render.com (Gratis & Direkomendasikan)
1. Login ke [Render.com](https://render.com) dan hubungkan akun GitHub Anda.
2. Buat **New Web Service**, pilih repository `presensi-qr`.
3. Konfigurasi Service:
   - **Environment:** `Node`
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
4. Klik **Create Web Service**. Aplikasi akan live dalam beberapa menit!

### Opsi B: Deploy di Railway.app
1. Login ke [Railway.app](https://railway.app).
2. Pilih **New Project > Deploy from GitHub repo**.
3. Railway akan secara otomatis mendeteksi Node.js dan menjalankan `npm start`.

---

## 📁 Struktur Direktori

```text
presensi-qr/
├── client/                     # Frontend Application (React + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/         # Komponen UI (QRScannerModal, StudentCard, dll)
│   │   ├── pages/              # Halaman Utama (Admin, Dosen, Mahasiswa, Report)
│   │   ├── api.js              # HTTP Client & JWT Interceptor
│   │   ├── App.jsx             # Router & Navigasi Utama
│   │   └── main.jsx            # Entry point React
│   ├── dist/                   # Production build frontend
│   └── package.json
│
├── server/                     # Backend API (Node.js + Express.js + SQLite)
│   ├── routes/
│   │   ├── auth.js             # Autentikasi & Reset Password
│   │   ├── attendance.js       # Scan QR, Riwayat, & Penilaian Sesi
│   │   ├── classes.js          # CRUD Kelas & Roster Mahasiswa
│   │   ├── sessions.js         # Sesi Presensi & Finalisasi
│   │   ├── reports.js          # Rekapitulasi Matriks & Dashboard Stats
│   │   └── users.js            # Manajemen User, Dosen, & Mahasiswa
│   ├── db.js                   # Inisialisasi Database SQLite & Seeder
│   ├── scheduler.js            # Auto-Close Sesi Terjadwal
│   ├── index.js                # Server Entry Point & Static Server
│   └── presensi.db             # File Database SQLite
│
├── .gitignore                  # Aturan file yang diabaikan Git
├── package.json                # Root package scripts untuk VS Code & Hosting
└── README.md                   # Panduan Lengkap Penggunaan
```

---

## 📄 Lisensi
Dikembangkan untuk keperluan akademik dan manajemen perkuliahan. Lisensi ISC.
