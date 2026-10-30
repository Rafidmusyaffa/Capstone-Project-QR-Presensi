import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../api';
import { serverNowParts } from '../serverClock';
import LoadError from '../components/LoadError';
import { ArrowLeft, Download, Printer, FileSpreadsheet } from 'lucide-react';

// Excel versi Indonesia memakai ';' sebagai pemisah daftar dan ',' sebagai desimal
const CSV_SEPARATOR = ';';
const STATUS_LABELS = { PRESENT: 'Hadir', LATE: 'Telat', ABSENT: 'Absen' };

// Kutip setiap sel agar ';', tanda kutip, dan baris baru di dalam data tidak merusak kolom
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Cegah formula injection: sel yang diawali =, +, -, @ dibaca Excel sebagai rumus
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const csvNumber = (value) => (value === null || value === undefined ? '-' : String(value).replace('.', ','));
const csvRow = (cells) => cells.map(csvCell).join(CSV_SEPARATOR);

export default function ClassReport({ classId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchReport = useCallback(async () => {
    try {
      const res = await apiRequest(`/reports/class/${classId}`);
      setData(res);
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const retryFetch = () => {
    setLoading(true);
    fetchReport();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!data) return;
    const { classInfo, sessions, recap } = data;
    const { date, time } = serverNowParts();

    const lines = [
      csvRow(['REKAPITULASI PRESENSI & PENILAIAN MAHASISWA']),
      csvRow(['Mata Kuliah', `${classInfo.name} (${classInfo.code})`]),
      csvRow(['Dosen Pengampu', classInfo.lecturer_name || '-']),
      csvRow(['Tahun Ajaran / Semester', `${classInfo.academic_year} / ${classInfo.semester}`]),
      csvRow(['Diekspor', `${date} ${time} WIB`]),
      '',
    ];

    const headers = ['NIM', 'Nama Mahasiswa', 'Program Studi'];
    sessions.forEach((s) => {
      headers.push(`P${s.meeting_number} Status`, `P${s.meeting_number} Nilai`);
    });
    headers.push('Total Hadir', 'Total Telat', 'Total Absen', 'Rata-rata Nilai', 'Persentase Kehadiran (%)');
    lines.push(csvRow(headers));

    recap.forEach((r) => {
      const row = [r.student.nim, r.student.name, r.student.major];
      r.sessions.forEach((s) => {
        row.push(STATUS_LABELS[s.status] || '-', csvNumber(s.score));
      });
      row.push(r.presentCount, r.lateCount, r.absentCount, csvNumber(r.averageScore), csvNumber(r.attendanceRate));
      lines.push(csvRow(row));
    });

    // BOM UTF-8 agar Excel membaca karakter non-ASCII dengan benar; CRLF sesuai standar CSV
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Presensi_Nilai_${classInfo.code}_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto p-12 text-center text-slate-400 font-medium text-xs">
        Memuat rekap laporan presensi kelas...
      </div>
    );
  }

  if (!data) {
    return <LoadError error={loadError} onRetry={retryFetch} onBack={onBack} />;
  }

  const { classInfo, sessions, recap } = data || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer py-1.5 px-3 rounded-xl hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" /> Export Excel (CSV)
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold border border-slate-200/80 shadow-xs transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Cetak Laporan
          </button>
        </div>
      </div>

      {/* Class Banner */}
      <div className="modern-card rounded-3xl p-5 sm:p-7 bg-white border border-slate-200/70 shadow-md shadow-slate-200/40 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-mono font-bold text-xs border border-indigo-100">
              {classInfo?.code}
            </span>
            <span className="text-xs font-bold text-slate-400">
              TA {classInfo?.academic_year} • Semester {classInfo?.semester}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Rekapitulasi Presensi: {classInfo?.name}
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Dosen Pengampu: <strong className="text-slate-800 font-bold">{classInfo?.lecturer_name || '-'}</strong>
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-50/80 border border-slate-200/70 p-4 rounded-2xl">
          <div className="text-center px-2">
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Pertemuan</span>
            <span className="text-xl font-extrabold text-slate-800">{sessions?.length || 0}</span>
            <span className="text-[11px] text-slate-500 block">Sesi Tercatat</span>
          </div>
          <div className="border-l border-slate-200 pl-4 text-center px-2">
            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Peserta</span>
            <span className="text-xl font-extrabold text-slate-800">{recap?.length || 0}</span>
            <span className="text-[11px] text-slate-500 block">Mahasiswa</span>
          </div>
        </div>
      </div>

      {/* Attendance Matrix Table */}
      <div className="modern-card rounded-3xl bg-white border border-slate-200/70 overflow-hidden shadow-md shadow-slate-200/30">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Matriks Presensi Seluruh Pertemuan
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> H: Hadir
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> T: Telat
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> A: Alpa
            </span>
            <span className="inline-flex items-center gap-1.5 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
              <span className="text-[10px] font-black bg-indigo-200/60 px-1 rounded">85</span> Nilai Sesi
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200/70">
              <tr>
                <th className="py-3 px-3.5 sticky left-0 bg-slate-50 z-10 w-12 text-center">No</th>
                <th className="py-3 px-3.5 sticky left-12 bg-slate-50 z-10 font-mono w-28">NIM</th>
                <th className="py-3 px-4 sticky left-40 bg-slate-50 z-10 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">Nama Mahasiswa</th>
                {sessions?.map((s) => (
                  <th key={s.id} className="py-3 px-2 text-center whitespace-nowrap min-w-[52px]">
                    <div className="font-bold text-slate-700">P#{s.meeting_number}</div>
                    <div className="text-[10px] font-normal text-slate-400 font-mono">{s.meeting_date.slice(5)}</div>
                  </th>
                ))}
                <th className="py-3 px-2.5 text-center text-emerald-700 font-bold bg-emerald-50/30">Hadir</th>
                <th className="py-3 px-2.5 text-center text-amber-700 font-bold bg-amber-50/30">Telat</th>
                <th className="py-3 px-2.5 text-center text-rose-700 font-bold bg-rose-50/30">Alpa</th>
                <th className="py-3 px-3 text-center text-indigo-700 font-bold bg-indigo-50/40">Rata-rata Nilai</th>
                <th className="py-3 px-4 text-right font-bold text-slate-700">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recap?.map((r, idx) => (
                <tr key={r.student.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="py-3 px-3.5 text-slate-400 text-center sticky left-0 bg-white group-hover:bg-slate-50 z-10">{idx + 1}</td>
                  <td className="py-3 px-3.5 font-mono font-bold text-slate-700 sticky left-12 bg-white group-hover:bg-slate-50 z-10">{r.student.nim}</td>
                  <td className="py-3 px-4 font-bold text-slate-900 sticky left-40 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">{r.student.name}</td>
                  {r.sessions.map((s) => (
                    <td key={s.sessionId} className="py-3 px-2 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        {s.status === 'PRESENT' && (
                          <span className="inline-block w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-bold leading-6 text-xs" title={`Tepat waktu: ${s.scan_time}`}>
                            H
                          </span>
                        )}
                        {s.status === 'LATE' && (
                          <span className="inline-block w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-bold leading-6 text-xs" title={`Terlambat: ${s.scan_time}`}>
                            T
                          </span>
                        )}
                        {s.status === 'ABSENT' && (
                          <span className="inline-block w-6 h-6 rounded-lg bg-rose-100 text-rose-800 font-bold leading-6 text-xs" title="Tidak Hadir">
                            A
                          </span>
                        )}
                        {s.status === 'NOT_RECORDED' && (
                          <span className="inline-block w-6 h-6 rounded-lg bg-slate-100 text-slate-400 leading-6 text-xs">
                            -
                          </span>
                        )}

                        {s.score !== null && s.score !== undefined ? (
                          <span
                            className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded px-1 py-0.5 leading-none shadow-2xs"
                            title={`Nilai Sesi: ${s.score}${s.score_feedback ? ` (${s.score_feedback})` : ''}`}
                          >
                            {s.score}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  ))}
                  <td className="py-3 px-2.5 text-center font-bold text-emerald-700 bg-emerald-50/20">{r.presentCount}</td>
                  <td className="py-3 px-2.5 text-center font-bold text-amber-700 bg-amber-50/20">{r.lateCount}</td>
                  <td className="py-3 px-2.5 text-center font-bold text-rose-700 bg-rose-50/20">{r.absentCount}</td>
                  <td className="py-3 px-3 text-center bg-indigo-50/20">
                    {r.averageScore !== null ? (
                      <span className="inline-block px-2 py-0.5 rounded-md font-extrabold text-xs text-indigo-800 bg-indigo-100 border border-indigo-200">
                        {r.averageScore}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-slate-800">
                    {r.attendanceRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
