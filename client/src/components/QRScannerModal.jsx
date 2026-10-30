import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import {
  Camera,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  User,
  Keyboard,
} from 'lucide-react';
import { apiRequest } from '../api';
import { sounds } from './AudioEffects';

// Pesan yang jelas untuk setiap kode penolakan dari backend
const SCAN_ERRORS = {
  SESSION_NOT_STARTED: {
    title: 'Presensi Belum Dibuka',
    hint: 'Sesi belum dimulai. Scan baru bisa dilakukan mulai waktu mulai pada tanggal pertemuan.',
  },
  ATTENDANCE_PERIOD_CLOSED: {
    title: 'Batas Waktu Presensi Lewat',
    hint: 'Waktu scan sudah melewati batas telat. Hubungi dosen untuk pencatatan manual bila perlu.',
  },
  SESSION_CLOSED: {
    title: 'Sesi Sudah Ditutup',
    hint: 'Sesi ini sudah berakhir atau difinalisasi dan tidak menerima scan lagi.',
  },
  INVALID_QR_CODE: {
    title: 'QR Code Tidak Dikenali',
    hint: 'QR tidak terdaftar atau sudah dibuat ulang. Gunakan kartu QR terbaru mahasiswa.',
  },
  STUDENT_INACTIVE: {
    title: 'Mahasiswa Nonaktif',
    hint: 'Status mahasiswa ini nonaktif sehingga tidak dapat presensi. Hubungi admin untuk mengaktifkan kembali.',
  },
  STUDENT_NOT_REGISTERED: {
    title: 'Mahasiswa Tidak Terdaftar di Kelas Ini',
    hint: 'Daftarkan mahasiswa lewat menu Kelola Peserta jika memang peserta kelas ini.',
  },
  ALREADY_ATTENDED: {
    title: 'Sudah Presensi',
    hint: 'Mahasiswa ini sudah tercatat pada sesi ini. Scan kedua tidak diproses.',
  },
  SESSION_NOT_FOUND: {
    title: 'Sesi Tidak Ditemukan',
    hint: 'Sesi mungkin sudah dihapus. Tutup scanner lalu muat ulang halaman.',
  },
  FORBIDDEN: {
    title: 'Akses Ditolak',
    hint: 'Anda tidak mengelola kelas sesi ini.',
  },
  MISSING_DATA: {
    title: 'Data Scan Tidak Lengkap',
    hint: 'QR terbaca kosong. Coba arahkan ulang kartu ke kamera.',
  },
  INVALID_SIMULATED_TIME: {
    title: 'Waktu Simulasi Tidak Valid',
    hint: 'Format waktu simulasi salah.',
  },
  DATABASE_ERROR: {
    title: 'Gagal Menyimpan Presensi',
    hint: 'Terjadi kesalahan server. Coba scan ulang beberapa saat lagi.',
  },
};

const FALLBACK_ERROR = {
  title: 'Presensi Ditolak',
  hint: 'Periksa koneksi atau coba scan ulang.',
};

// Abaikan pembacaan QR yang sama dalam jeda ini (kamera membaca ~10 frame/detik)
const SAME_QR_COOLDOWN_MS = 3000;

export default function QRScannerModal({ session, isOpen, onClose, onScanSuccess }) {
  const [scanResult, setScanResult] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualToken, setManualToken] = useState('');
  const [isManualOpen, setIsManualOpen] = useState(false);

  const html5QrCodeRef = useRef(null);
  // Ref (bukan state) karena dibaca dari callback kamera yang dibuat sekali
  const processingRef = useRef(false);
  const lastScanRef = useRef({ data: null, at: 0 });
  // Callback kamera dibuat sekali; selalu panggil handler versi terbaru
  const scanHandlerRef = useRef(null);

  const stopCamera = useCallback(async () => {
    const scanner = html5QrCodeRef.current;
    if (!scanner) return;
    html5QrCodeRef.current = null;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // ignore (kamera belum berjalan)
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    // Browser hanya mengizinkan kamera di HTTPS atau localhost
    if (!window.isSecureContext) {
      setCameraError('Kamera diblokir browser karena halaman tidak dibuka lewat HTTPS. Buka aplikasi melalui alamat https:// (atau localhost di laptop), atau gunakan input token manual di bawah.');
      setIsCameraActive(false);
      setIsManualOpen(true);
      return;
    }
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch {
          // kamera sebelumnya sudah berhenti
        }
      }

      const html5QrCode = new Html5Qrcode('qr-reader-target');
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 10,
        // Kotak bidik 75% dari sisi terpendek agar pas di layar HP kecil
        qrbox: (w, h) => {
          const size = Math.floor(Math.min(w, h) * 0.75);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          scanHandlerRef.current?.(decodedText);
        },
        () => {
          // ignore frame errors
        }
      );
      setIsCameraActive(true);
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError('Gagal mengakses kamera. Pastikan browser diizinkan mengakses kamera, atau gunakan input token manual di bawah.');
      setIsCameraActive(false);
      setIsManualOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    // Small timeout to allow the DOM element #qr-reader-target to mount
    const timer = setTimeout(startCamera, 300);
    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleClose = () => {
    setScanResult(null);
    setManualToken('');
    onClose();
  };

  const handleProcessScan = async (qrData) => {
    const now = Date.now();
    if (processingRef.current) return;
    if (lastScanRef.current.data === qrData && now - lastScanRef.current.at < SAME_QR_COOLDOWN_MS) return;
    processingRef.current = true;
    lastScanRef.current = { data: qrData, at: now };

    try {
      const payload = {
        session_id: session.id,
        qr_data: qrData,
      };

      const res = await apiRequest('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Scan Success (PRESENT or LATE)
      if (res.status === 'PRESENT') {
        sounds.playSuccess();
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } else {
        sounds.playWarning();
      }

      setScanResult({
        type: 'success',
        status: res.status,
        message: res.message,
        student: res.student,
        scan_time: res.scan_time,
      });

      if (onScanSuccess) onScanSuccess(res);
    } catch (err) {
      sounds.playError();
      const data = err.data || {};
      const code = data.code || (err.status === 401 || err.status === 403 ? 'FORBIDDEN' : 'REJECTED');
      const info = SCAN_ERRORS[code] || FALLBACK_ERROR;
      setScanResult({
        type: 'error',
        code,
        title: info.title,
        hint: info.hint,
        message: err.message,
        student: data.student,
        scan_time: data.scan_time,
      });
    } finally {
      setTimeout(() => {
        processingRef.current = false;
      }, 1500);
    }
  };

  useEffect(() => {
    scanHandlerRef.current = handleProcessScan;
  });

  // Token diketik / dari barcode scanner USB (yang mengetik lalu menekan Enter)
  const handleManualSubmit = (e) => {
    e.preventDefault();
    const token = manualToken.trim();
    if (!token) return;
    lastScanRef.current = { data: null, at: 0 };
    handleProcessScan(token);
    setManualToken('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-4.5 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:block p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base">Scanner Kamera Presensi</h3>
              <p className="text-xs text-slate-400 truncate">
                {session?.class_name} • Pertemuan #{session?.meeting_number}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Rules Banner */}
        <div className="bg-indigo-50/70 border-b border-indigo-100 px-4 sm:px-6 py-2.5 flex items-center justify-between text-[11px] sm:text-xs text-indigo-900">
          <div className="flex items-start sm:items-center gap-2">
            <Clock className="w-4 h-4 shrink-0 text-indigo-600" />
            <span>
              <strong>Aturan Sesi:</strong> Mulai <strong>{session?.start_time}</strong> • Hadir s/d{' '}
              <strong className="text-emerald-700">{session?.present_until}</strong> • Batas Telat{' '}
              <strong className="text-amber-700">{session?.late_until}</strong> • Tutup{' '}
              <strong className="text-rose-700">{session?.end_time}</strong>
            </span>
          </div>
        </div>

        {/* Modal Body - Scanner Only */}
        <div className="p-4 sm:p-6">
          <div>
            <div className="relative mx-auto max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-slate-900 border-4 border-indigo-600/30 flex items-center justify-center shadow-inner">
              <div id="qr-reader-target" className="w-full h-full"></div>
              {!isCameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-900">
                  <Camera className="w-12 h-12 text-slate-500 mb-2" />
                  <p className="text-xs font-medium mb-4 text-slate-300">
                    {cameraError || 'Kamera belum aktif. Klik tombol di bawah untuk mengaktifkan.'}
                  </p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-md shadow-indigo-600/20"
                  >
                    Nyalakan Kamera
                  </button>
                </div>
              )}
            </div>
            <p className="text-center text-xs text-slate-500 mt-3 font-medium">
              Arahkan Kartu / Gambar QR Code Mahasiswa ke depan kamera scanner.
            </p>
          </div>

          {/* Cadangan: input token manual (kamera bermasalah / barcode scanner USB) */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIsManualOpen((v) => !v)}
              className="mx-auto flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5" />
              {isManualOpen ? 'Sembunyikan input token manual' : 'Kamera bermasalah? Input token manual'}
            </button>
            {isManualOpen && (
              <form onSubmit={handleManualSubmit} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Token QR, mis. PQR-…"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!manualToken.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Proses
                </button>
              </form>
            )}
          </div>

          {/* Feedback Result Banner */}
          {scanResult && (
            <div
              className={`mt-5 p-4 rounded-2xl border flex items-start gap-3 transition-all ${
                scanResult.type === 'success'
                  ? scanResult.status === 'PRESENT'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              {scanResult.type === 'success' ? (
                scanResult.status === 'PRESENT' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                )
              ) : (
                <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              )}

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm">
                    {scanResult.type === 'success'
                      ? scanResult.status === 'PRESENT'
                        ? 'PRESENSI BERHASIL (HADIR)'
                        : 'PRESENSI BERHASIL (TELAT)'
                      : scanResult.title}
                  </span>
                  {scanResult.scan_time && (
                    <span className="text-[11px] font-mono font-bold bg-white/80 px-2 py-0.5 rounded-md border border-current shadow-2xs">
                      {scanResult.scan_time}
                    </span>
                  )}
                </div>
                {scanResult.type === 'error' ? (
                  <>
                    <p className="text-xs mt-1 leading-relaxed font-semibold">{scanResult.hint}</p>
                    <p className="text-[11px] mt-1 leading-relaxed opacity-75">
                      {scanResult.message} <span className="font-mono">[{scanResult.code}]</span>
                    </p>
                  </>
                ) : (
                  <p className="text-xs mt-1 leading-relaxed font-medium">{scanResult.message}</p>
                )}
                {scanResult.student && (
                  <div className="mt-2 pt-2 border-t border-current/20 text-xs flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    <span className="font-bold">{scanResult.student.name}</span>
                    <span className="font-mono">({scanResult.student.nim})</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3.5 flex justify-between items-center">
          {isCameraActive ? (
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Kamera
            </button>
          ) : <div />}
          <button
            onClick={handleClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
