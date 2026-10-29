import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import {
  Camera,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Volume2,
  RefreshCw,
  User,
} from 'lucide-react';
import { apiRequest } from '../api';
import { sounds } from './AudioEffects';

export default function QRScannerModal({ session, isOpen, onClose, onScanSuccess }) {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      // Small timeout to allow the DOM element #qr-reader-target to mount
      const timer = setTimeout(() => {
        startCamera();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
      setScanResult(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {}
      }

      const html5QrCode = new Html5Qrcode('qr-reader-target');
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleProcessScan(decodedText);
        },
        (errorMessage) => {
          // ignore frame errors
        }
      );
      setIsCameraActive(true);
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError('Gagal mengakses kamera. Pastikan browser diizinkan mengakses kamera perangkat Anda.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && isCameraActive) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        // ignore
      }
      setIsCameraActive(false);
    }
  };

  const handleProcessScan = async (qrData) => {
    if (isProcessing) return;
    setIsProcessing(true);

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
      setScanResult({
        type: 'error',
        code: data.code || 'REJECTED',
        message: err.message,
        student: data.student,
        scan_time: data.scan_time,
      });
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
      }, 1500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4.5 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Scanner Kamera Presensi</h3>
              <p className="text-xs text-slate-400">
                {session?.class_name} • Pertemuan #{session?.meeting_number}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Rules Banner */}
        <div className="bg-indigo-50/70 border-b border-indigo-100 px-6 py-2.5 flex items-center justify-between text-xs text-indigo-900">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>
              <strong>Aturan Sesi:</strong> Mulai <strong>{session?.start_time}</strong> • Hadir s/d{' '}
              <strong className="text-emerald-700">{session?.present_until}</strong> • Batas Telat{' '}
              <strong className="text-amber-700">{session?.late_until}</strong> • Tutup{' '}
              <strong className="text-rose-700">{session?.end_time}</strong>
            </span>
          </div>
        </div>

        {/* Modal Body - Scanner Only */}
        <div className="p-6">
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
                      : `PRESENSI DITOLAK [${scanResult.code}]`}
                  </span>
                  {scanResult.scan_time && (
                    <span className="text-[11px] font-mono font-bold bg-white/80 px-2 py-0.5 rounded-md border border-current shadow-2xs">
                      {scanResult.scan_time}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-1 leading-relaxed font-medium">{scanResult.message}</p>
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
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
