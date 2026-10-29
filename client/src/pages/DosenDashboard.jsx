import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import ClassRosterModal from '../components/ClassRosterModal';
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  School,
  X,
  ChevronRight,
  TrendingUp,
  Trash2,
  Search,
  Filter,
  ArrowUpDown,
} from 'lucide-react';

export default function DosenDashboard({ user, onSelectSession, onViewClassReport }) {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [rosterClass, setRosterClass] = useState(null);

  // Filter & Sorting State for Sessions
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionClassFilter, setSessionClassFilter] = useState('all');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('all');
  const [sessionSortOrder, setSessionSortOrder] = useState('date_asc'); // 'date_asc', 'date_desc', 'meeting_asc'

  // New Session Form State
  const [selectedClassId, setSelectedClassId] = useState('');
  const [meetingNumber, setMeetingNumber] = useState(1);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('18:00');
  const [presentUntil, setPresentUntil] = useState('18:15');
  const [lateUntil, setLateUntil] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [sessionSortOrder]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [cls, ses] = await Promise.all([
        apiRequest('/classes'),
        apiRequest(`/sessions?sort=${sessionSortOrder}`),
      ]);
      setClasses(cls);
      setSessions(ses);
      if (cls.length > 0 && !selectedClassId) {
        setSelectedClassId(cls[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (e, ses) => {
    e.stopPropagation();
    if (
      !confirm(
        `Apakah Anda yakin ingin menghapus Sesi Pertemuan #${ses.meeting_number} (${ses.class_name})? Seluruh data presensi di sesi ini akan dihapus permanen.`
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/sessions/${ses.id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setCreateError(null);

    try {
      const res = await apiRequest('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          class_id: selectedClassId,
          meeting_number: Number(meetingNumber),
          meeting_date: meetingDate,
          start_time: startTime,
          present_until: presentUntil,
          late_until: lateUntil,
          end_time: endTime,
        }),
      });

      setIsCreateModalOpen(false);
      fetchData();
      if (res.sessionId) {
        onSelectSession(res.sessionId);
      }
    } catch (err) {
      setCreateError(err.message);
    }
  };

  const handleSetQuickTimes = (startH, startM) => {
    const s = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    setStartTime(s);
    // +15 mins
    const pM = (startM + 15) % 60;
    const pH = startH + Math.floor((startM + 15) / 60);
    setPresentUntil(`${String(pH).padStart(2, '0')}:${String(pM).padStart(2, '0')}`);
    // +60 mins
    setLateUntil(`${String(startH + 1).padStart(2, '0')}:${String(startM).padStart(2, '0')}`);
    // +120 mins
    setEndTime(`${String(startH + 2).padStart(2, '0')}:${String(startM).padStart(2, '0')}`);
  };

  const filteredSessions = (sessions || []).filter((ses) => {
    if (sessionClassFilter !== 'all' && String(ses.class_id) !== String(sessionClassFilter)) {
      return false;
    }
    if (sessionStatusFilter !== 'all' && ses.status !== sessionStatusFilter) {
      return false;
    }
    if (sessionSearch) {
      const q = sessionSearch.toLowerCase();
      const match =
        (ses.class_name || '').toLowerCase().includes(q) ||
        (ses.class_code || '').toLowerCase().includes(q) ||
        (ses.meeting_date || '').toLowerCase().includes(q) ||
        String(ses.meeting_number).includes(q) ||
        (ses.session_code || '').toLowerCase().includes(q) ||
        (ses.room || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
      {/* Top Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-7 shadow-xl shadow-slate-900/10 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-blue-200 backdrop-blur-md border border-white/10">
            <School className="w-3.5 h-3.5" />
            <span>Portal Dosen Pengajar</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Selamat Datang, {user?.lecturer?.name || user?.name || user?.username}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            NIP <span className="font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded-md">{user?.lecturer?.nip || '-'}</span> • Mengampu{' '}
            <strong className="text-white font-bold">{classes.length} Kelas Aktif</strong>
          </p>
        </div>

        <button
          onClick={() => {
            const now = new Date();
            handleSetQuickTimes(now.getHours(), now.getMinutes());
            setIsCreateModalOpen(true);
          }}
          className="relative z-10 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/25 transition-all cursor-pointer hover:shadow-indigo-500/40 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Buka Sesi Pertemuan Baru
        </button>
      </div>

      {/* Classes Overview Cards */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <School className="w-4 h-4 text-indigo-600" /> Kelas yang Diampu
          </h3>
          <span className="text-xs font-semibold text-slate-400">{classes.length} Mata Kuliah</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="modern-card rounded-3xl bg-white border border-slate-200/70 p-5 hover:border-indigo-200 hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-mono font-bold text-xs border border-indigo-100/70">
                    {cls.code}
                  </span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100/80 px-2.5 py-0.5 rounded-full">
                    {cls.student_count || 0} Mahasiswa
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-slate-900 mt-1">{cls.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Semester {cls.semester} • TA {cls.academic_year}
                </p>

                {cls.schedules && cls.schedules.length > 0 && (
                  <div className="mt-3.5 p-3 bg-slate-50/80 rounded-2xl text-xs text-slate-700 flex items-center gap-2 font-medium border border-slate-100">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">
                      {cls.schedules[0].day_of_week}, {cls.schedules[0].start_time} - {cls.schedules[0].end_time} • {cls.schedules[0].room}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                <button
                  onClick={() => setRosterClass(cls)}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer py-1 px-2 rounded-lg hover:bg-indigo-50/50 transition-colors"
                  title="Lihat dan kelola mahasiswa yang terdaftar di kelas ini"
                >
                  <Users className="w-3.5 h-3.5" /> Kelola Peserta
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onViewClassReport(cls.id)}
                    className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer py-1 px-2.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> Rekap
                  </button>
                  <button
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      const now = new Date();
                      handleSetQuickTimes(now.getHours(), now.getMinutes());
                      setIsCreateModalOpen(true);
                    }}
                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    + Sesi
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance Sessions List */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" /> Sesi Presensi Perkuliahan
          </h3>
          <span className="text-xs text-slate-500 font-semibold">
            {filteredSessions.length} dari {sessions.length} Sesi
          </span>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="modern-card p-3 rounded-2xl bg-white border border-slate-200/70 mb-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Cari kelas, kode, atau tanggal (YYYY-MM-DD)..."
              className="w-full pl-10 pr-3.5 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter Class */}
            <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sessionClassFilter}
                onChange={(e) => setSessionClassFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-700 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">Semua Kelas ({classes.length})</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Status */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl px-3 py-1.5">
              <select
                value={sessionStatusFilter}
                onChange={(e) => setSessionStatusFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-700 font-bold focus:outline-hidden cursor-pointer"
              >
                <option value="all">Semua Status</option>
                <option value="ACTIVE">ACTIVE Saja</option>
                <option value="CLOSED">CLOSED Saja</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl px-3 py-1.5 text-indigo-900">
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
              <select
                value={sessionSortOrder}
                onChange={(e) => setSessionSortOrder(e.target.value)}
                className="bg-transparent text-xs font-bold text-indigo-900 focus:outline-hidden cursor-pointer"
              >
                <option value="date_asc">Urut: Terlama → Terbaru</option>
                <option value="date_desc">Urut: Terbaru → Terlama</option>
                <option value="meeting_asc">Pertemuan (1, 2, 3...)</option>
              </select>
            </div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-slate-200 text-xs">
            Belum ada sesi presensi yang dibuat. Klik tombol "Buka Sesi Pertemuan Baru" untuk memulai.
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-slate-200 text-xs">
            Tidak ada sesi yang cocok dengan kriteria pencarian atau filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSessions.map((ses) => (
              <div
                key={ses.id}
                onClick={() => onSelectSession(ses.id)}
                className="modern-card rounded-3xl bg-white border border-slate-200/70 p-5 hover:border-indigo-300 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{ses.class_code}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        ses.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {ses.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                      {ses.status}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-base text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {ses.class_name}
                  </h4>
                  <p className="text-xs font-semibold text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                    <span>Pertemuan #{ses.meeting_number} • {ses.meeting_date}</span>
                    {ses.room && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-100">
                        {ses.room}
                      </span>
                    )}
                  </p>

                  {/* Clean Timeline Strip */}
                  <div className="mt-3.5 p-2.5 bg-slate-50/80 rounded-2xl border border-slate-100 grid grid-cols-4 gap-1 text-center font-mono">
                    <div className="p-1">
                      <span className="text-[10px] text-slate-400 block font-semibold">MULAI</span>
                      <span className="text-xs font-bold text-slate-800">{ses.start_time}</span>
                    </div>
                    <div className="p-1 border-l border-slate-200/60">
                      <span className="text-[10px] text-emerald-600 block font-semibold">HADIR</span>
                      <span className="text-xs font-bold text-emerald-700">{ses.present_until}</span>
                    </div>
                    <div className="p-1 border-l border-slate-200/60">
                      <span className="text-[10px] text-amber-600 block font-semibold">TELAT</span>
                      <span className="text-xs font-bold text-amber-700">{ses.late_until}</span>
                    </div>
                    <div className="p-1 border-l border-slate-200/60">
                      <span className="text-[10px] text-rose-600 block font-semibold">TUTUP</span>
                      <span className="text-xs font-bold text-rose-700">{ses.end_time}</span>
                    </div>
                  </div>

                  {/* Attendance counts summary */}
                  <div className="mt-3.5 flex items-center justify-between text-xs pt-2.5 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-700 font-bold">
                        {ses.present_count || 0} Hadir
                      </span>
                      <span className="text-amber-700 font-bold">
                        {ses.late_count || 0} Telat
                      </span>
                      <span className="text-rose-700 font-bold">
                        {ses.absent_count || 0} Alpa
                      </span>
                    </div>
                    <span className="text-slate-400 text-xs font-medium">
                      dari {ses.total_students || 0} mhs
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-indigo-600 group-hover:translate-x-1 transition-transform">
                    <span>Buka Monitor & QR Scanner</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, ses)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    title="Hapus Sesi Perkuliahan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Session Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between">
              <h3 className="font-bold text-base">Buat Attendance Session Baru</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-700 rounded-xl">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Kelas</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pertemuan Ke-</label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={meetingNumber}
                    onChange={(e) => setMeetingNumber(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  />
                </div>
              </div>

              {/* Time Rules Input Grid */}
              <div className="pt-2 border-t border-slate-100">
                <span className="block text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">
                  Aturan Waktu Presensi (Time Rules)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      1. Waktu Mulai
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                      2. Hadir s/d (Tepat Waktu)
                    </label>
                    <input
                      type="time"
                      value={presentUntil}
                      onChange={(e) => setPresentUntil(e.target.value)}
                      className="w-full text-xs p-2 bg-emerald-50/50 border border-emerald-300 rounded-xl font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-700 mb-1">
                      3. Batas Waktu Telat
                    </label>
                    <input
                      type="time"
                      value={lateUntil}
                      onChange={(e) => setLateUntil(e.target.value)}
                      className="w-full text-xs p-2 bg-amber-50/50 border border-amber-300 rounded-xl font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-rose-700 mb-1">
                      4. Waktu Selesai (Sesi Ditutup)
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full text-xs p-2 bg-rose-50/50 border border-rose-300 rounded-xl font-mono font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  Simpan & Buka Sesi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Class Roster Modal */}
      {rosterClass && (
        <ClassRosterModal
          classId={rosterClass.id}
          className={`${rosterClass.name} (${rosterClass.code})`}
          isOpen={!!rosterClass}
          onClose={() => setRosterClass(null)}
          onRosterChanged={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
