import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../api';
import { serverNowParts } from '../serverClock';
import useAutoRefresh from '../useAutoRefresh';
import StudentCard from '../components/StudentCard';
import SessionStatusBadge from '../components/SessionStatusBadge';
import AttendanceStatusBadge from '../components/AttendanceStatusBadge';
import { LoadErrorBanner } from '../components/LoadError';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  BookOpen,
  History,
  GraduationCap,
  Sparkles,
  Award,
  CalendarClock,
  QrCode,
} from 'lucide-react';

const toSeconds = (t) => (t && t.length === 5 ? `${t}:00` : t);

// Petunjuk singkat untuk mahasiswa berdasarkan status sesi dan presensinya sendiri
function todayHint(ses) {
  if (ses.my_status) {
    return ses.my_scan_time && ses.my_scan_time !== '-'
      ? `Tercatat pukul ${ses.my_scan_time}.`
      : 'Sudah tercatat oleh sistem.';
  }
  switch (ses.status) {
    case 'SCHEDULED':
      return `Presensi dibuka pukul ${ses.start_time}. Siapkan QR Code Anda.`;
    case 'ACTIVE': {
      const now = serverNowParts().time;
      return now <= toSeconds(ses.present_until)
        ? `Presensi dibuka! Tunjukkan QR ke dosen sebelum ${ses.present_until} agar tercatat Hadir.`
        : `Sudah lewat ${ses.present_until}: scan sekarang tercatat Telat (batas ${ses.late_until}).`;
    }
    case 'ATTENDANCE_CLOSED':
      return 'Batas waktu presensi sudah lewat. Hubungi dosen bila ada kendala.';
    default:
      return 'Sesi sudah ditutup.';
  }
}

export default function MahasiswaDashboard({ user }) {
  const [historyData, setHistoryData] = useState({ summary: {}, records: [] });
  const [classes, setClasses] = useState([]);
  const [todaySessions, setTodaySessions] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [hist, cls, today] = await Promise.all([
        apiRequest('/attendance/my-history'),
        apiRequest('/classes'),
        apiRequest('/sessions?date=today&sort=date_asc'),
      ]);
      setHistoryData(hist);
      setClasses(cls);
      setTodaySessions(today);
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Status sesi hari ini dan riwayat presensi ikut diperbarui tanpa refresh
  useAutoRefresh(fetchData);

  const { summary, records } = historyData;
  const attendanceRate = summary?.attendanceRate || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
      {loadError && <LoadErrorBanner error={loadError} onRetry={fetchData} />}

      {/* Top Welcome Header - Modern Asymmetrical Style */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-7 shadow-xl shadow-slate-900/10 border border-slate-800">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-indigo-200 backdrop-blur-md border border-white/10">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Portal Mahasiswa</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Halo, {user?.student?.name || user?.name || user?.username}!
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-normal">
              NIM <span className="font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded-md">{user?.student?.nim}</span> • Program Studi <span className="text-white font-medium">{user?.student?.major}</span>
            </p>
          </div>

          {/* Quick Rate Badge Card */}
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-2xl shadow-inner">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white font-extrabold text-xl shadow-lg shadow-indigo-500/30">
              {attendanceRate}%
            </div>
            <div>
              <span className="text-xs text-indigo-200 font-medium block">Tingkat Kehadiran</span>
              <span className="text-xs font-bold text-white mt-0.5 block">
                {summary?.present || 0} Hadir • {summary?.late || 0} Telat • {summary?.absent || 0} Absen
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sesi Hari Ini */}
      <div className="modern-card rounded-3xl p-5 sm:p-6 bg-white border border-slate-200/70">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-600" /> Sesi Hari Ini
          </h4>
          <span className="text-xs font-semibold text-slate-400">{serverNowParts().date}</span>
        </div>
        {todaySessions.length === 0 ? (
          <p className="text-center py-4 text-xs text-slate-400">Tidak ada sesi perkuliahan untuk Anda hari ini.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {todaySessions.map((ses) => {
              const needsScan = ses.status === 'ACTIVE' && !ses.my_status;
              return (
                <div
                  key={ses.id}
                  className={`p-4 rounded-2xl border ${needsScan ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200/70 bg-slate-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-mono font-bold text-[11px]">
                        {ses.class_code}
                      </span>
                      <h5 className="font-bold text-sm text-slate-900 mt-1.5 truncate">{ses.class_name}</h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pertemuan #{ses.meeting_number}{ses.room ? ` • ${ses.room}` : ''}
                      </p>
                    </div>
                    <SessionStatusBadge status={ses.status} size="sm" />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-center font-mono text-[11px] p-2 bg-white rounded-xl border border-slate-100">
                    <div><span className="block text-[9px] text-slate-400 font-sans font-semibold">MULAI</span>{ses.start_time}</div>
                    <div><span className="block text-[9px] text-emerald-600 font-sans font-semibold">HADIR</span>{ses.present_until}</div>
                    <div><span className="block text-[9px] text-amber-600 font-sans font-semibold">TELAT</span>{ses.late_until}</div>
                    <div><span className="block text-[9px] text-rose-600 font-sans font-semibold">TUTUP</span>{ses.end_time}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className={`text-[11px] font-medium ${needsScan ? 'text-emerald-800' : 'text-slate-500'}`}>
                      {todayHint(ses)}
                    </p>
                    <AttendanceStatusBadge status={ses.my_status} />
                  </div>
                  {needsScan && (
                    <button
                      type="button"
                      onClick={() => document.getElementById('kartu-qr')?.scrollIntoView({ behavior: 'smooth' })}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" /> Tampilkan QR Saya
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid: Permanent QR Card vs Stats & Enrolled Classes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Left Column: Permanent Student QR Code (WHO) */}
        <div id="kartu-qr" className="lg:col-span-5 space-y-4 scroll-mt-20">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Kartu QR Code Mahasiswa</span>
            </h3>
          </div>
          {user?.student?.is_active === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium">
              Status akun Anda <strong>nonaktif</strong>. QR Code tidak dapat dipakai untuk presensi sampai diaktifkan kembali oleh admin.
            </div>
          )}
          <StudentCard student={user?.student} />
        </div>

        {/* Right Column: Attendance History & Classes */}
        <div className="lg:col-span-7 space-y-6">
          {/* Summary Metric Cards with Visual Variety */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="modern-card rounded-2xl p-4 bg-gradient-to-b from-white to-emerald-50/30 border border-emerald-100/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-600">Tepat Waktu</span>
                <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 tracking-tight">{summary?.present || 0}</div>
              <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">Sesi Hadir</span>
            </div>

            <div className="modern-card rounded-2xl p-4 bg-gradient-to-b from-white to-amber-50/30 border border-amber-100/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-600">Terlambat</span>
                <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-amber-700 tracking-tight">{summary?.late || 0}</div>
              <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">Sesi Telat</span>
            </div>

            <div className="modern-card rounded-2xl p-4 bg-gradient-to-b from-white to-rose-50/30 border border-rose-100/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-600">Tidak Hadir</span>
                <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-700 tracking-tight">{summary?.absent || 0}</div>
              <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">Sesi Absen</span>
            </div>

            <div className="modern-card rounded-2xl p-4 bg-gradient-to-b from-white to-indigo-50/40 border border-indigo-100/80">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-600">Rata-rata Nilai</span>
                <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-indigo-700 tracking-tight">
                {summary?.averageScore !== null && summary?.averageScore !== undefined ? summary.averageScore : '—'}
              </div>
              <span className="text-[11px] font-medium text-slate-500 mt-0.5 block">
                {summary?.gradedCount || 0} Sesi Dinilai
              </span>
            </div>
          </div>

          {/* Enrolled Classes */}
          <div className="modern-card rounded-3xl p-5 sm:p-6 bg-white border border-slate-200/70">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-indigo-600" /> Kelas yang Anda Ikuti
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {classes.length === 0 ? (
                <div className="col-span-2 text-center py-6 text-xs text-slate-400">
                  Belum terdaftar di kelas perkuliahan manapun.
                </div>
              ) : (
                classes.map((cls) => (
                  <div
                    key={cls.id}
                    className="p-4 rounded-2xl border border-slate-200/70 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-mono font-bold text-xs">
                          {cls.code}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {cls.semester} {cls.academic_year}
                        </span>
                      </div>
                      <h5 className="font-bold text-sm text-slate-900 mt-1">{cls.name}</h5>
                      <p className="text-xs text-slate-500 mt-1">Dosen: {cls.lecturer_name || '-'}</p>
                    </div>
                    {cls.schedules && cls.schedules.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="min-w-0 break-words sm:truncate">
                          {cls.schedules[0].day_of_week}, {cls.schedules[0].start_time} - {cls.schedules[0].end_time} • {cls.schedules[0].room}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Attendance History Table */}
          <div className="modern-card rounded-3xl p-5 sm:p-6 bg-white border border-slate-200/70">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" /> Riwayat Presensi Masuk
              </h4>
              <span className="text-xs font-semibold text-slate-400">
                {records.length} Catatan
              </span>
            </div>

            {records.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                Belum ada data presensi yang tercatat untuk akun ini.
              </div>
            ) : (
              <>
              {/* Tampilan kartu untuk layar HP */}
              <ul className="md:hidden divide-y divide-slate-100">
                {records.map((r) => (
                  <li key={r.attendance_id} className="py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{r.class_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {r.meeting_date} • Pertemuan #{r.meeting_number}
                        </div>
                      </div>
                      <AttendanceStatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Scan: <strong className="font-mono text-slate-800">{r.scan_time || '-'}</strong></span>
                      <span>
                        Nilai: <strong className="text-slate-800">{r.score !== null && r.score !== undefined ? r.score : 'Belum dinilai'}</strong>
                      </span>
                    </div>
                    {r.score_feedback && <p className="text-[11px] text-slate-400 italic break-words">{r.score_feedback}</p>}
                  </li>
                ))}
              </ul>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200/70">
                    <tr>
                      <th className="py-3 px-3.5 rounded-l-xl">Tanggal / Sesi</th>
                      <th className="py-3 px-3.5">Mata Kuliah</th>
                      <th className="py-3 px-3.5">Waktu Scan</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5">Nilai Sesi</th>
                      <th className="py-3 px-3.5 rounded-r-xl">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r) => (
                      <tr key={r.attendance_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{r.meeting_date}</div>
                          <div className="text-slate-400 text-[11px]">Pertemuan #{r.meeting_number}</div>
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-800">{r.class_name}</div>
                          <div className="text-slate-400 font-mono text-[11px]">{r.class_code}</div>
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {r.scan_time || '-'}
                        </td>
                        <td className="py-3 px-3.5">
                          <AttendanceStatusBadge status={r.status} />
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {r.score !== null && r.score !== undefined ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                <Award className="w-3 h-3 text-indigo-600" /> {r.score}
                              </span>
                              {r.score_feedback && (
                                <p className="text-[10px] text-slate-400 italic mt-0.5 max-w-[140px] truncate" title={r.score_feedback}>
                                  {r.score_feedback}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Belum dinilai</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-500 max-w-[180px] truncate text-xs">
                          {r.remarks || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
