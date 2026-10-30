# Konteks Project
Capstone STSI4440 Universitas Terbuka: "Rancang Bangun Sistem Informasi Presensi Mahasiswa Berbasis QR Code dengan Manajemen Sesi dan Waktu Presensi".
Stack: React + Vite + Tailwind (client/), Node.js + Express 5 + node:sqlite (server/). Node >= 22.5.
Target hosting: Render free (filesystem ephemeral) — data demo di-seed ulang otomatis saat server start.

# Business Rules (WAJIB dipatuhi, dari proposal)
- BR-01: QR hanya identitas (permanent_qr_token), mahasiswa harus terdaftar & aktif.
- BR-02: Mahasiswa harus terdaftar di kelas sesi tersebut (class_students).
- BR-03: Scan hanya diterima saat sesi berstatus ACTIVE.
- BR-04: PRESENT jika start_time <= t_scan <= present_until (inklusif, presisi detik).
- BR-05: LATE jika present_until < t_scan <= late_until.
- BR-06: Scan setelah late_until ditolak (ATTENDANCE_CLOSED).
- BR-07: UNIQUE(session_id, student_id), scan kedua ditolak.
- BR-08: Setelah end_time, scheduler menutup sesi (CLOSED), mencatat ABSENT massal, lalu FINALIZED.
Status sesi: SCHEDULED -> ACTIVE -> ATTENDANCE_CLOSED -> CLOSED -> FINALIZED.
Waktu selalu dari server dalam zona Asia/Jakarta, bukan jam klien.

# Aturan kerja
- Bahasa pesan UI & error: Indonesia.
- Jangan menambah dependency npm baru kecuali benar-benar perlu; jelaskan dulu jika ingin menambah.
- Setelah mengubah kode, jalankan `npm test` dan `npm run build`, perbaiki sampai lulus.
- Jelaskan ringkas file apa saja yang diubah di akhir setiap tugas.