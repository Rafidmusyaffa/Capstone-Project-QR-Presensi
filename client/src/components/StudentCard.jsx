import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, ShieldCheck, AlertCircle, QrCode } from 'lucide-react';

export default function StudentCard({ student }) {
  if (!student) return null;

  // Token QR hanya dikirim backend ke admin dan ke mahasiswa pemiliknya
  const hasToken = Boolean(student.permanent_qr_token);

  const handleDownloadQR = () => {
    const svg = document.getElementById('student-qr-code');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${student.nim}_${student.name.replace(/\s+/g, '_')}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modern-card rounded-3xl bg-white border border-slate-200/80 overflow-hidden shadow-lg shadow-slate-200/40 max-w-md mx-auto">
      {/* Top Banner / University Header */}
      <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 p-6 text-white text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-center gap-1.5 mb-1.5">
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          <span className="text-[11px] uppercase font-bold tracking-widest text-indigo-200">
            KARTU IDENTITAS MAHASISWA
          </span>
        </div>
        <h3 className="font-extrabold text-lg tracking-tight text-white">UNIVERSITAS TEKNOLOGI</h3>
        <p className="text-xs text-indigo-200/80 font-medium">Permanent Student QR Identification</p>
      </div>

      {/* Card Body */}
      <div className="p-6 text-center">
        {/* QR Code Container */}
        <div className="inline-block p-4 bg-white rounded-3xl border-2 border-dashed border-indigo-200/80 shadow-xs mb-4.5 hover:border-indigo-400 transition-colors">
          {hasToken ? (
            <QRCodeSVG
              id="student-qr-code"
              value={student.permanent_qr_token}
              size={180}
              level="H"
              includeMargin={true}
            />
          ) : (
            <div className="w-[180px] h-[180px] flex flex-col items-center justify-center gap-2 text-slate-400">
              <QrCode className="w-12 h-12" />
              <span className="text-[11px] font-semibold px-4">QR Code tidak tersedia untuk akun ini.</span>
            </div>
          )}
        </div>

        {/* Student Details */}
        <div className="space-y-1">
          <h4 className="text-xl font-extrabold text-slate-900 tracking-tight">{student.name}</h4>
          <div className="pt-0.5">
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/80 inline-block px-3 py-1 rounded-full">
              NIM: {student.nim}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-semibold pt-1">{student.major}</p>
        </div>

        {/* Token Info */}
        <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between text-left text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">QR Token Tetap</span>
            <span className="font-mono text-slate-700 font-bold truncate block max-w-[210px] text-xs">
              {student.permanent_qr_token || '—'}
            </span>
          </div>
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold rounded-lg text-[10px]">
            PERMANENT
          </span>
        </div>

        {/* Context Note */}
        <div className="mt-3.5 p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-left text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            QR Code ini berfungsi sebagai identitas tetap Anda (<strong className="font-semibold">WHO</strong>). Tunjukkan QR ini kepada Dosen saat sesi presensi berlangsung.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={handleDownloadQR}
            disabled={!hasToken}
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Download QR
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/70 transition-all cursor-pointer active:scale-[0.98]"
          >
            <Printer className="w-4 h-4" /> Cetak Kartu
          </button>
        </div>
      </div>
    </div>
  );
}
