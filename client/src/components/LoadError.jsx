import React from 'react';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';

function describeError(error) {
  return error?.message === 'Failed to fetch'
    ? 'Tidak dapat terhubung ke server. Periksa koneksi atau pastikan server berjalan.'
    : error?.message || 'Terjadi kesalahan sistem.';
}

// Banner kecil untuk halaman yang tetap bisa tampil walau sebagian data gagal dimuat
export function LoadErrorBanner({ error, onRetry }) {
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium flex items-center justify-between gap-3">
      <span>Gagal memuat data: {describeError(error)}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-bold underline cursor-pointer">Coba lagi</button>
      )}
    </div>
  );
}

// Tampilan saat data halaman gagal dimuat (server mati, akses ditolak, data tidak ditemukan)
export default function LoadError({ error, onRetry, onBack }) {
  const status = error?.status;
  const canRetry = status !== 403 && status !== 404;
  const title = status === 403
    ? 'Akses ditolak'
    : status === 404
      ? 'Data tidak ditemukan'
      : 'Gagal memuat data';
  const message = describeError(error);

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="bg-white border border-rose-200 rounded-3xl p-7 text-center shadow-xs">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 mt-1.5">{message}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </button>
          )}
          {onRetry && canRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
