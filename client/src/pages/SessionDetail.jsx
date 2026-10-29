import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import QRScannerModal from '../components/QRScannerModal';
import ClassRosterModal from '../components/ClassRosterModal';
import {
  Clock,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Percent,
  Lock,
  Unlock,
  CheckCheck,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  UserPlus,
  Trash2,
  Award,
} from 'lucide-react';

export default function SessionDetail({ sessionId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Score / Grading state
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [selectedStudentForScore, setSelectedStudentForScore] = useState(null);
  const [inputScore, setInputScore] = useState('');
  const [inputFeedback, setInputFeedback] = useState('');
  const [savingScore, setSavingScore] = useState(false);

  const handleOpenScoreForStudent = (student) => {
    setSelectedStudentForScore(student);
    setInputScore(student.score !== null && student.score !== undefined ? student.score : '');
    setInputFeedback(student.score_feedback || '');
    setScoreModalOpen(true);
  };

  const handleSaveScore = async (e) => {
    e?.preventDefault();
    if (!selectedStudentForScore) return;

    if (inputScore !== '' && (isNaN(inputScore) || Number(inputScore) < 0 || Number(inputScore) > 100)) {
      alert('Nilai harus berupa angka antara 0 sampai 100.');
      return;
    }

    try {
      setSavingScore(true);
      await apiRequest('/attendance/score', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          student_id: selectedStudentForScore.student_id,
          score: inputScore === '' ? null : Number(inputScore),
          score_feedback: inputFeedback || null,
        }),
      });
      setScoreModalOpen(false);
      setActionMessage(`Nilai untuk ${selectedStudentForScore.name} berhasil disimpan.`);
      fetchSession();
    } catch (err) {
      alert(err.message || 'Gagal menyimpan nilai');
    } finally {
      setSavingScore(false);
    }
  };

  const handleDeleteScore = async () => {
    if (!confirm(`Hapus nilai untuk ${selectedStudentForScore.name}?`)) return;
    try {
      setSavingScore(true);
      await apiRequest('/attendance/score', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          student_id: selectedStudentForScore.student_id,
          score: null,
          score_feedback: null,
        }),
      });
      setScoreModalOpen(false);
      setActionMessage(`Nilai untuk ${selectedStudentForScore.name} berhasil dihapus.`);
      fetchSession();
    } catch (err) {
      alert(err.message || 'Gagal menghapus nilai');
    } finally {
      setSavingScore(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!data?.session) return;
    if (
      !confirm(
        `Apakah Anda yakin ingin menghapus Sesi Pertemuan #${data.session.meeting_number} (${data.session.session_code})? Seluruh rekap presensi di sesi ini akan dihapus secara permanen.`
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/sessions/${sessionId}`, { method: 'DELETE' });
      alert('Sesi pertemuan berhasil dihapus.');
      if (onBack) onBack();
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    fetchSession();
    // Auto-poll every 5 seconds to keep attendee list up to date
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const res = await apiRequest(`/sessions/${sessionId}`);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!data?.session) return;
    const newStatus = data.session.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    try {
      await apiRequest(`/sessions/${sessionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setActionMessage(`Status sesi berhasil diubah menjadi ${newStatus}.`);
      fetchSession();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Apakah Anda yakin ingin melakukan finalisasi? Mahasiswa yang belum presensi akan dicatat sebagai Absen dan sesi akan ditutup.')) {
      return;
    }
    setIsFinalizing(true);
    try {
      const res = await apiRequest(`/sessions/${sessionId}/finalize`, {
        method: 'POST',
      });
      setActionMessage(res.message);
      fetchSession();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center text-slate-500">
        Memuat data sesi presensi...
      </div>
    );
  }

  const { session, stats, students } = data || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer py-1.5 px-3 rounded-xl hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Daftar Sesi
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRosterOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 shadow-xs transition-all cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" /> Kelola Peserta
          </button>
          <button
            onClick={() => {
              setSelectedStudentForManual(null);
              setManualModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-100 transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" /> Presensi Manual
          </button>
          <button
            onClick={fetchSession}
            className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 bg-indigo-50/90 border border-indigo-200/80 rounded-2xl text-xs text-indigo-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-medium">{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Session Header Card */}
      <div className="modern-card rounded-3xl p-6 sm:p-7 bg-white border border-slate-200/70 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-md shadow-slate-200/40">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-mono font-bold text-xs border border-indigo-100">
              {session?.class_code}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                session?.status === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${session?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              SESSION {session?.status}
            </span>
            <span className="text-xs text-slate-400 font-mono font-medium">{session?.session_code}</span>
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900 mt-2.5 tracking-tight">
            {session?.class_name} • Pertemuan #{session?.meeting_number}
          </h2>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
            <span>
              Tanggal: <strong className="text-slate-800 font-bold">{session?.meeting_date}</strong>
            </span>
            <span>•</span>
            <span>Dosen: <strong className="text-slate-800 font-bold">{session?.lecturer_name}</strong></span>
            {session?.room && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 text-[11px]">
                  {session.room}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer active:scale-[0.98]"
          >
            <Camera className="w-4 h-4" /> Buka Scanner QR
          </button>

          <button
            onClick={handleToggleStatus}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              session?.status === 'ACTIVE'
                ? 'bg-rose-50 border-rose-200/80 text-rose-700 hover:bg-rose-100/80'
                : 'bg-emerald-50 border-emerald-200/80 text-emerald-700 hover:bg-emerald-100/80'
            }`}
          >
            {session?.status === 'ACTIVE' ? (
              <>
                <Lock className="w-4 h-4" /> Tutup Sesi
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" /> Buka Sesi
              </>
            )}
          </button>

          <button
            disabled={isFinalizing}
            onClick={handleFinalize}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98]"
            title="Ubah mahasiswa yang tidak scan menjadi Absen dan tutup sesi"
          >
            <CheckCheck className="w-4 h-4" /> Finalisasi Absen
          </button>

          <button
            onClick={handleDeleteSession}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="Hapus sesi perkuliahan ini beserta seluruh data presensinya"
          >
            <Trash2 className="w-4 h-4" /> Hapus
          </button>
        </div>
      </div>

      {/* Time Rules Timeline Progress Bar */}
      <div className="modern-card rounded-3xl p-5 sm:p-6 bg-white border border-slate-200/70">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-600" /> Aturan Waktu Validasi Presensi (Time-Based Rules)
        </h3>

        <div className="grid grid-cols-4 gap-2.5 sm:gap-4 text-center font-mono">
          <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">Waktu Mulai</span>
            <span className="text-base font-bold text-slate-900">{session?.start_time}</span>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Sesi Dibuka</span>
          </div>

          <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-200/70">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block font-sans">Hadir s/d</span>
            <span className="text-base font-bold text-emerald-800">{session?.present_until}</span>
            <span className="text-[10px] text-emerald-700 block mt-0.5 font-sans">Tepat Waktu</span>
          </div>

          <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/70">
            <span className="text-[10px] uppercase font-bold text-amber-600 block font-sans">Batas Telat</span>
            <span className="text-base font-bold text-amber-800">{session?.late_until}</span>
            <span className="text-[10px] text-amber-700 block mt-0.5 font-sans">Terlambat</span>
          </div>

          <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-200/70">
            <span className="text-[10px] uppercase font-bold text-rose-600 block font-sans">Selesai</span>
            <span className="text-base font-bold text-rose-800">{session?.end_time}</span>
            <span className="text-[10px] text-rose-700 block mt-0.5 font-sans">Sesi Ditutup</span>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="modern-card p-4 rounded-2xl bg-white border border-slate-200/70">
          <span className="text-xs font-bold text-slate-500">Total Terdaftar</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">{stats?.total || 0}</div>
          <span className="text-[11px] text-slate-400 font-medium">Mahasiswa</span>
        </div>

        <div className="modern-card p-4 rounded-2xl bg-gradient-to-b from-white to-emerald-50/30 border border-emerald-100">
          <span className="text-xs font-bold text-emerald-700">Hadir</span>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{stats?.present || 0}</div>
          <span className="text-[11px] text-emerald-600 font-medium">Tepat Waktu</span>
        </div>

        <div className="modern-card p-4 rounded-2xl bg-gradient-to-b from-white to-amber-50/30 border border-amber-100">
          <span className="text-xs font-bold text-amber-700">Telat</span>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{stats?.late || 0}</div>
          <span className="text-[11px] text-amber-600 font-medium">Terlambat</span>
        </div>

        <div className="modern-card p-4 rounded-2xl bg-gradient-to-b from-white to-rose-50/30 border border-rose-100">
          <span className="text-xs font-bold text-rose-700">Absen</span>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{stats?.absent || 0}</div>
          <span className="text-[11px] text-rose-600 font-medium">Alpa</span>
        </div>

        <div className="col-span-2 md:col-span-1 modern-card p-4 rounded-2xl bg-gradient-to-b from-white to-indigo-50/30 border border-indigo-100">
          <span className="text-xs font-bold text-indigo-700">Tingkat Hadir</span>
          <div className="text-2xl font-extrabold text-indigo-700 mt-1">{stats?.attendanceRate || 0}%</div>
          <span className="text-[11px] text-indigo-600 font-medium">Persentase</span>
        </div>
      </div>

      {/* Attendee Live Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> Daftar Mahasiswa Peserta Pertemuan
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">
              {stats?.unrecorded || 0} Mahasiswa belum presensi
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">NIM</th>
                <th className="py-3 px-4">Nama Mahasiswa</th>
                <th className="py-3 px-4">Program Studi</th>
                <th className="py-3 px-4">Waktu Scan</th>
                <th className="py-3 px-4">Status Presensi</th>
                <th className="py-3 px-4">Nilai Sesi</th>
                <th className="py-3 px-4">Catatan / Validasi</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students?.map((s) => (
                <tr key={s.student_id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-700">{s.nim}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                  <td className="py-3 px-4 text-slate-500">{s.major}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                    {s.scan_time || '—'}
                  </td>
                  <td className="py-3 px-4">
                    {s.attendance_status === 'PRESENT' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> Hadir
                      </span>
                    )}
                    {s.attendance_status === 'LATE' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" /> Telat
                      </span>
                    )}
                    {s.attendance_status === 'ABSENT' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <XCircle className="w-3 h-3" /> Absen
                      </span>
                    )}
                    {!s.attendance_status && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                        Belum Presensi
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {s.score !== null && s.score !== undefined ? (
                      <div className="inline-flex flex-col">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Award className="w-3 h-3 text-indigo-600" /> {s.score} / 100
                        </span>
                        {s.score_feedback && (
                          <span className="text-[10px] text-slate-400 italic mt-0.5 max-w-[130px] truncate" title={s.score_feedback}>
                            {s.score_feedback}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-200/60">
                        Belum dinilai
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                    {s.remarks || '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleOpenScoreForStudent(s)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-[11px] cursor-pointer transition-colors border border-indigo-200/70"
                      title="Beri atau edit nilai sesi pertemuan ini"
                    >
                      <Award className="w-3 h-3" /> {s.score !== null && s.score !== undefined ? 'Nilai' : '+ Nilai'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        session={session}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={() => {
          fetchSession();
        }}
      />

      {/* Class Roster Management Modal (Enroll/Unenroll students) */}
      {isRosterOpen && (
        <ClassRosterModal
          classId={session?.class_id}
          className={session?.class_name}
          isOpen={isRosterOpen}
          onClose={() => setIsRosterOpen(false)}
          onRosterChanged={() => {
            fetchSession();
          }}
        />
      )}

      {/* Modal Input/Edit Nilai Sesi */}
      {scoreModalOpen && selectedStudentForScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Penilaian Sesi Pertemuan</h4>
                  <p className="text-[11px] text-slate-500">Pertemuan #{session?.meeting_number} • {session?.class_name}</p>
                </div>
              </div>
              <button
                onClick={() => setScoreModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveScore}>
              <div className="py-4 space-y-4">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mahasiswa</div>
                  <div className="text-sm font-extrabold text-slate-800">{selectedStudentForScore.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{selectedStudentForScore.nim} • {selectedStudentForScore.major}</div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nilai Sesi (Skala 0 - 100) <span className="text-indigo-600 font-normal">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="Contoh: 85"
                      value={inputScore}
                      onChange={(e) => setInputScore(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all pr-14"
                      autoFocus
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">/ 100</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Catatan / Feedback Nilai <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <textarea
                    rows="2"
                    placeholder="Contoh: Aktif bertanya, tugas presentasi sangat baik..."
                    value={inputFeedback}
                    onChange={(e) => setInputFeedback(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {selectedStudentForScore.score !== null && selectedStudentForScore.score !== undefined ? (
                  <button
                    type="button"
                    onClick={handleDeleteScore}
                    disabled={savingScore}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 px-3 py-2 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    Hapus Nilai
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScoreModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingScore}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {savingScore ? 'Menyimpan...' : 'Simpan Nilai'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
