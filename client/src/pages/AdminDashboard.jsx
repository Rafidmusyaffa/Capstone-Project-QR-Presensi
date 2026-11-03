import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../api';
import useAutoRefresh from '../useAutoRefresh';
import ClassRosterModal from '../components/ClassRosterModal';
import StudentCard from '../components/StudentCard';
import SessionStatusBadge from '../components/SessionStatusBadge';
import AttendanceStatusBadge from '../components/AttendanceStatusBadge';
import { useDialog } from '../components/dialogContext';
import { LoadErrorBanner } from '../components/LoadError';
import { SESSION_STATUSES } from '../sessionStatus';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  GraduationCap,
  School,
  BookOpen,
  Calendar,
  Plus,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Edit,
  Trash2,
  Filter,
  ArrowUpDown,
  Search,
  Eye,
  EyeOff,
  QrCode,
  RefreshCw,
  FileText,
  UserCheck,
  UserX,
} from 'lucide-react';

// Tombol aksi pada daftar kartu di HP: area sentuh minimal 44px
const MOBILE_ACTION = 'inline-flex items-center justify-center gap-1.5 min-h-11 px-2 rounded-xl text-xs font-bold cursor-pointer transition-colors';

export default function AdminDashboard({ onSelectSession, onViewClassReport }) {
  // Tab terakhir diingat selama tab browser terbuka, agar "Kembali" dari detail sesi tidak reset ke Ringkasan
  const [activeTab, setActiveTabState] = useState(() => sessionStorage.getItem('adminActiveTab') || 'overview'); // overview, students, lecturers, classes, sessions
  const setActiveTab = (tab) => {
    sessionStorage.setItem('adminActiveTab', tab);
    setActiveTabState(tab);
  };
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadError, setLoadError] = useState(null);

  // Student QR Code preview modal
  const [selectedStudentForQR, setSelectedStudentForQR] = useState(null);

  // Class Roster Management modal
  const [rosterClass, setRosterClass] = useState(null);

  // Sessions Tab Filtering & Sorting State
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionClassFilter, setSessionClassFilter] = useState('all');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('all');
  const [sessionSortOrder, setSessionSortOrder] = useState('date_asc');

  // Student form modal (Add)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({
    username: '',
    password: '',
    nim: '',
    name: '',
    major: 'Sistem Informasi',
  });

  // Student form modal (Edit)
  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editStudentForm, setEditStudentForm] = useState({
    username: '',
    password: '',
    nim: '',
    name: '',
    major: '',
  });

  // Lecturer form modal (Add)
  const [isLecturerModalOpen, setIsLecturerModalOpen] = useState(false);
  const [lecturerForm, setLecturerForm] = useState({
    username: '',
    password: '',
    nip: '',
    name: '',
    email: '',
  });

  // Lecturer form modal (Edit)
  const [isEditLecturerModalOpen, setIsEditLecturerModalOpen] = useState(false);
  const [editingLecturer, setEditingLecturer] = useState(null);
  const [editLecturerForm, setEditLecturerForm] = useState({
    username: '',
    password: '',
    nip: '',
    name: '',
    email: '',
  });

  // Password visibility states for modals
  const [showStudentPass, setShowStudentPass] = useState(false);
  const [showEditStudentPass, setShowEditStudentPass] = useState(false);
  const [showLecturerPass, setShowLecturerPass] = useState(false);
  const [showEditLecturerPass, setShowEditLecturerPass] = useState(false);

  // Class form modal (Add)
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classForm, setClassForm] = useState({
    code: '',
    name: '',
    lecturer_id: '',
    academic_year: '2026/2027',
    semester: 'Ganjil',
    day_of_week: 'Senin',
    start_time: '08:00',
    end_time: '10:00',
    room: 'Lab Komputer 1',
  });

  // Class form modal (Edit)
  const [isEditClassModalOpen, setIsEditClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [editClassForm, setEditClassForm] = useState({
    code: '',
    name: '',
    lecturer_id: '',
    academic_year: '2026/2027',
    semester: 'Ganjil',
    day_of_week: 'Senin',
    start_time: '08:00',
    end_time: '10:00',
    room: 'Lab Komputer 1',
  });

  const [formError, setFormError] = useState(null);
  const dialog = useDialog();

  // Bar tab bisa digeser di HP; tab aktif selalu digeser ke area yang terlihat
  const tabBarRef = useRef(null);
  useEffect(() => {
    const bar = tabBarRef.current;
    const active = bar?.querySelector('[aria-selected="true"]');
    if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeTab]);

  const fetchAll = useCallback(async () => {
    try {
      const [dash, std, lect, cls, ses] = await Promise.all([
        apiRequest('/reports/dashboard'),
        apiRequest('/users/students'),
        apiRequest('/users/lecturers'),
        apiRequest('/classes'),
        apiRequest(`/sessions?sort=${sessionSortOrder}`),
      ]);
      setStats(dash);
      setStudents(std);
      setLecturers(lect);
      setClasses(cls);
      setSessions(ses);
      setLoadError(null);
      if (lect.length > 0) {
        setClassForm((prev) => (prev.lecturer_id ? prev : { ...prev, lecturer_id: lect[0].id }));
      }
    } catch (e) {
      setLoadError(e);
    }
  }, [sessionSortOrder]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Status sesi & statistik ikut diperbarui tanpa refresh manual
  useAutoRefresh(fetchAll);

  const handleDeleteSession = async (ses) => {
    const ok = await dialog.confirm({
      title: 'Hapus sesi pertemuan?',
      message: `Pertemuan #${ses.meeting_number} • ${ses.class_name} (${ses.session_code}) beserta seluruh data presensinya akan dihapus permanen.`,
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiRequest(`/sessions/${ses.id}`, { method: 'DELETE' });
      dialog.notify('Sesi pertemuan berhasil dihapus.', 'success');
      fetchAll();
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  // --- Student Handlers ---
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await apiRequest('/users/students', {
        method: 'POST',
        body: JSON.stringify(studentForm),
      });
      setIsStudentModalOpen(false);
      setStudentForm({ username: '', password: '', nim: '', name: '', major: 'Sistem Informasi' });
      fetchAll();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleOpenEditStudent = (student) => {
    setFormError(null);
    setEditingStudent(student);
    setShowEditStudentPass(false);
    setEditStudentForm({
      username: student.username || '',
      password: '',
      nim: student.nim || '',
      name: student.name || '',
      major: student.major || '',
    });
    setIsEditStudentModalOpen(true);
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await apiRequest(`/users/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify(editStudentForm),
      });
      setIsEditStudentModalOpen(false);
      fetchAll();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteStudent = async (student) => {
    const ok = await dialog.confirm({
      title: 'Hapus mahasiswa?',
      message: `${student.name} (NIM ${student.nim}) akan dihapus. Semua data presensi dan keanggotaan kelasnya juga ikut terhapus.`,
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiRequest(`/users/students/${student.id}`, {
        method: 'DELETE',
      });
      dialog.notify('Mahasiswa berhasil dihapus.', 'success');
      fetchAll();
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  const handleRegenerateQr = async (student) => {
    const ok = await dialog.confirm({
      title: 'Buat ulang QR Code?',
      message: `QR lama milik ${student.name} (NIM ${student.nim}) akan langsung tidak berlaku dan kartu QR harus dicetak ulang.`,
      confirmLabel: 'Buat Ulang',
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/users/students/${student.id}/regenerate-qr`, { method: 'POST' });
      if (selectedStudentForQR?.id === student.id) {
        setSelectedStudentForQR({ ...selectedStudentForQR, permanent_qr_token: res.permanent_qr_token });
      }
      fetchAll();
      dialog.notify(res.message, 'success');
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  // Mahasiswa nonaktif tetap bisa login & melihat riwayat, tetapi scan QR ditolak (BR-01)
  const handleToggleStudentActive = async (student) => {
    const activate = !student.is_active;
    const ok = await dialog.confirm(
      activate
        ? {
            title: 'Aktifkan kembali mahasiswa?',
            message: `${student.name} (NIM ${student.nim}) dapat melakukan presensi lagi.`,
            confirmLabel: 'Aktifkan',
            tone: 'primary',
          }
        : {
            title: 'Nonaktifkan mahasiswa?',
            message: `${student.name} (NIM ${student.nim}) tidak dapat melakukan presensi, tetapi riwayat presensinya tetap tersimpan.`,
            confirmLabel: 'Nonaktifkan',
          }
    );
    if (!ok) return;
    try {
      await apiRequest(`/users/students/${student.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: activate }),
      });
      fetchAll();
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  // --- Lecturer Handlers ---
  const handleCreateLecturer = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await apiRequest('/users/lecturers', {
        method: 'POST',
        body: JSON.stringify(lecturerForm),
      });
      setIsLecturerModalOpen(false);
      setLecturerForm({ username: '', password: '', nip: '', name: '', email: '' });
      fetchAll();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleOpenEditLecturer = (lecturer) => {
    setFormError(null);
    setEditingLecturer(lecturer);
    setShowEditLecturerPass(false);
    setEditLecturerForm({
      username: lecturer.username || '',
      password: '',
      nip: lecturer.nip || '',
      name: lecturer.name || '',
      email: lecturer.email || '',
    });
    setIsEditLecturerModalOpen(true);
  };

  const handleUpdateLecturer = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await apiRequest(`/users/lecturers/${editingLecturer.id}`, {
        method: 'PUT',
        body: JSON.stringify(editLecturerForm),
      });
      setIsEditLecturerModalOpen(false);
      fetchAll();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteLecturer = async (lecturer) => {
    const ok = await dialog.confirm({
      title: 'Hapus dosen?',
      message: `${lecturer.name} (NIP ${lecturer.nip}) akan dihapus dari sistem.`,
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiRequest(`/users/lecturers/${lecturer.id}`, {
        method: 'DELETE',
      });
      dialog.notify('Dosen berhasil dihapus.', 'success');
      fetchAll();
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  // --- Class Handlers ---
  const handleCreateClass = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          code: classForm.code,
          name: classForm.name,
          lecturer_id: classForm.lecturer_id ? Number(classForm.lecturer_id) : null,
          academic_year: classForm.academic_year,
          semester: classForm.semester,
          schedule: {
            day_of_week: classForm.day_of_week,
            start_time: classForm.start_time,
            end_time: classForm.end_time,
            room: classForm.room || 'Lab Komputer 1',
          },
        }),
      });

      const newId = res.classId;
      const newName = classForm.name;
      const newCode = classForm.code;

      setIsClassModalOpen(false);
      setClassForm({
        code: '',
        name: '',
        lecturer_id: lecturers[0]?.id || '',
        academic_year: '2026/2027',
        semester: 'Ganjil',
        day_of_week: 'Senin',
        start_time: '08:00',
        end_time: '10:00',
        room: 'Lab Komputer 1',
      });
      await fetchAll();

      if (newId) {
        const ok = await dialog.confirm({
          title: 'Kelas berhasil dibuat',
          message: `${newName} (${newCode}) sudah tersimpan. Daftarkan mahasiswa ke kelas ini sekarang?`,
          confirmLabel: 'Atur Peserta',
          cancelLabel: 'Nanti',
          tone: 'primary',
        });
        if (ok) setRosterClass({ id: newId, name: newName, code: newCode });
      }
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleOpenEditClass = (cls) => {
    setFormError(null);
    setEditingClass(cls);
    const sched = cls.schedules && cls.schedules.length > 0 ? cls.schedules[0] : {};
    setEditClassForm({
      code: cls.code || '',
      name: cls.name || '',
      lecturer_id: cls.lecturer_id || (lecturers[0]?.id || ''),
      academic_year: cls.academic_year || '2026/2027',
      semester: cls.semester || 'Ganjil',
      day_of_week: sched.day_of_week || 'Senin',
      start_time: sched.start_time || '08:00',
      end_time: sched.end_time || '10:00',
      room: sched.room || 'Ruang Kuliah',
    });
    setIsEditClassModalOpen(true);
  };

  const handleUpdateClass = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await apiRequest(`/classes/${editingClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          code: editClassForm.code,
          name: editClassForm.name,
          lecturer_id: editClassForm.lecturer_id ? Number(editClassForm.lecturer_id) : null,
          academic_year: editClassForm.academic_year,
          semester: editClassForm.semester,
          schedule: {
            day_of_week: editClassForm.day_of_week,
            start_time: editClassForm.start_time,
            end_time: editClassForm.end_time,
            room: editClassForm.room,
          },
        }),
      });
      setIsEditClassModalOpen(false);
      fetchAll();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteClass = async (cls) => {
    const ok = await dialog.confirm({
      title: 'Hapus kelas?',
      message: `${cls.name} (${cls.code}) beserta seluruh sesi dan rekap presensinya akan dihapus permanen.`,
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    try {
      await apiRequest(`/classes/${cls.id}`, {
        method: 'DELETE',
      });
      dialog.notify('Kelas berhasil dihapus.', 'success');
      fetchAll();
    } catch (err) {
      dialog.notify(err.message, 'error');
    }
  };

  const adminFilteredSessions = (sessions || []).filter((ses) => {
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
        (ses.lecturer_name || '').toLowerCase().includes(q) ||
        (ses.meeting_date || '').toLowerCase().includes(q) ||
        (ses.session_code || '').toLowerCase().includes(q) ||
        (ses.room || '').toLowerCase().includes(q) ||
        String(ses.meeting_number).includes(q);
      if (!match) return false;
    }
    return true;
  });

  const { metrics, recentAttendances } = stats || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
      {loadError && <LoadErrorBanner error={loadError} onRetry={fetchAll} />}

      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-rose-950/80 to-slate-900 text-white p-7 shadow-xl shadow-slate-900/10 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-rose-200 backdrop-blur-md border border-white/10">
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            <span>Super Administrator</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Panel Kontrol & Master Data
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Kelola master data mahasiswa, dosen, alokasi kelas, jadwal perkuliahan, dan audit log presensi.
          </p>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="modern-card p-5 rounded-3xl bg-white border border-slate-200/70 hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">Mahasiswa</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{metrics?.totalStudents || 0}</div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Terdaftar di sistem</span>
        </div>

        <div className="modern-card p-5 rounded-3xl bg-white border border-slate-200/70 hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">Dosen Pengajar</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <School className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{metrics?.totalLecturers || 0}</div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Dosen aktif</span>
        </div>

        <div className="modern-card p-5 rounded-3xl bg-white border border-slate-200/70 hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">Mata Kuliah / Kelas</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{metrics?.totalClasses || 0}</div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">Kelas dibuka</span>
        </div>

        <div className="modern-card p-5 rounded-3xl bg-white border border-slate-200/70 hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">Log Presensi</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{metrics?.totalAttendanceLogs || 0}</div>
          <span className="text-[11px] font-semibold text-emerald-600 mt-1 block">Data log tercatat</span>
        </div>
      </div>

      {/* Tabs Navigation: di HP bisa digeser ke samping */}
      <div
        ref={tabBarRef}
        role="tablist"
        aria-label="Menu panel admin"
        className="relative flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 overflow-x-auto snap-x snap-mandatory scroll-px-1.5 text-xs font-bold"
      >
        {[
          { id: 'overview', label: 'Audit Log Presensi' },
          { id: 'students', label: <>Data Mahasiswa ({students.length})</> },
          { id: 'lecturers', label: <>Data Dosen ({lecturers.length})</> },
          { id: 'classes', label: <>Data Kelas & Jadwal ({classes.length})</> },
          { id: 'sessions', label: <>Sesi Perkuliahan ({sessions.length})</> },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 snap-start min-h-11 sm:min-h-0 px-4 py-2 rounded-xl cursor-pointer transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm shadow-slate-200 border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Audit Log */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-bold text-slate-800">10 Log Aktivitas Presensi Terbaru</h3>
            <span className="text-xs text-slate-400">Pencatatan real-time</span>
          </div>

          {/* Tampilan kartu untuk layar HP */}
          <ul className="md:hidden divide-y divide-slate-100">
            {recentAttendances?.map((r) => (
              <li key={r.id} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 break-words">{r.student_name}</div>
                    <div className="text-xs text-slate-500 font-mono">NIM: {r.student_nim}</div>
                  </div>
                  <AttendanceStatusBadge status={r.status} />
                </div>
                <div className="text-xs font-semibold text-slate-700 break-words">
                  {r.class_name} • Pertemuan #{r.meeting_number}
                </div>
                <div className="text-xs text-slate-500">
                  Scan <span className="font-mono font-bold text-slate-700">{r.scan_time}</span> • Direkam{' '}
                  <span className="font-mono">{r.recorded_at}</span>
                </div>
              </li>
            ))}
            {!recentAttendances?.length && (
              <li className="p-6 text-center text-xs text-slate-400">Belum ada aktivitas presensi.</li>
            )}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Waktu Scan</th>
                  <th className="py-3 px-4">Mahasiswa</th>
                  <th className="py-3 px-4">Kelas & Sesi</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Waktu Rekam Sistem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAttendances?.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{r.scan_time}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{r.student_name}</div>
                      <div className="text-slate-400 font-mono text-[10px]">NIM: {r.student_nim}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{r.class_name}</div>
                      <div className="text-slate-400 text-[10px]">Pertemuan #{r.meeting_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      {r.status === 'PRESENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Hadir
                        </span>
                      )}
                      {r.status === 'LATE' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3 h-3" /> Telat
                        </span>
                      )}
                      {r.status === 'ABSENT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                          <XCircle className="w-3 h-3" /> Absen
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{r.recorded_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Students */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Total {students.length} mahasiswa terdaftar. Anda dapat menambah, mengedit identitas / akun, melihat QR code, atau menghapus mahasiswa.
            </p>
            <button
              onClick={() => setIsStudentModalOpen(true)}
              className="flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" /> Tambah Mahasiswa
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Tampilan kartu untuk layar HP */}
            <ul className="md:hidden divide-y divide-slate-100">
              {students.map((s) => (
                <li key={s.id} className={`p-4 space-y-3 ${s.is_active ? '' : 'bg-slate-50/80'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`font-bold text-sm break-words ${s.is_active ? 'text-slate-900' : 'text-slate-500'}`}>{s.name}</div>
                      <div className="text-xs text-slate-500 font-mono break-all">NIM {s.nim} • {s.username}</div>
                      <div className="text-xs text-slate-500">{s.major}</div>
                    </div>
                    {s.is_active ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Aktif</span>
                    ) : (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Nonaktif</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentForQR(s)}
                    title="Lihat / Cetak QR Code Mahasiswa"
                    className="w-full flex items-center gap-3 p-2 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 rounded-2xl text-left cursor-pointer transition-colors"
                  >
                    <span className="p-1 bg-white rounded-xl border border-slate-200 shrink-0">
                      {s.permanent_qr_token ? (
                        <QRCodeSVG value={s.permanent_qr_token} size={40} level="M" />
                      ) : (
                        <QrCode className="w-10 h-10 text-slate-300" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-bold text-slate-900 break-all">{s.permanent_qr_token || '—'}</span>
                      <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1 mt-0.5">
                        <Eye className="w-3.5 h-3.5" /> Perbesar & Cetak
                      </span>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOpenEditStudent(s)}
                      title="Edit Data Mahasiswa"
                      className={`${MOBILE_ACTION} bg-amber-50 hover:bg-amber-100 text-amber-700`}
                    >
                      <Edit className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => handleToggleStudentActive(s)}
                      title={s.is_active ? 'Nonaktifkan Mahasiswa (tidak bisa presensi)' : 'Aktifkan Kembali Mahasiswa'}
                      className={`${MOBILE_ACTION} ${s.is_active ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}
                    >
                      {s.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      onClick={() => handleRegenerateQr(s)}
                      title="Buat Ulang QR (QR lama tidak berlaku lagi)"
                      className={`${MOBILE_ACTION} bg-violet-50 hover:bg-violet-100 text-violet-700`}
                    >
                      <RefreshCw className="w-4 h-4" /> QR Baru
                    </button>
                    <button
                      onClick={() => handleDeleteStudent(s)}
                      title="Hapus Mahasiswa"
                      className={`${MOBILE_ACTION} bg-rose-50 hover:bg-rose-100 text-rose-700`}
                    >
                      <Trash2 className="w-4 h-4" /> Hapus
                    </button>
                  </div>
                </li>
              ))}
              {students.length === 0 && (
                <li className="p-6 text-center text-xs text-slate-400">Belum ada mahasiswa terdaftar.</li>
              )}
            </ul>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">NIM</th>
                    <th className="py-3 px-4">Nama Mahasiswa</th>
                    <th className="py-3 px-4">Program Studi</th>
                    <th className="py-3 px-4">QR Code & Token Mahasiswa</th>
                    <th className="py-3 px-4">Username Akun</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr key={s.id} className={`hover:bg-slate-50/50 ${s.is_active ? '' : 'bg-slate-50/80 text-slate-400'}`}>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.nim}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{s.name}</td>
                      <td className="py-3 px-4 text-slate-600">{s.major}</td>
                      <td className="py-3 px-4">
                        <div
                          onClick={() => setSelectedStudentForQR(s)}
                          className="inline-flex items-center gap-3 p-1.5 pr-3 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 rounded-2xl cursor-pointer transition-all shadow-2xs group"
                          title="Klik untuk melihat Kartu & memperbesar QR Code Mahasiswa"
                        >
                          <div className="p-1 bg-white rounded-xl border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform flex items-center justify-center">
                            {s.permanent_qr_token ? (
                              <QRCodeSVG
                                value={s.permanent_qr_token}
                                size={44}
                                level="M"
                              />
                            ) : (
                              <div className="w-11 h-11 flex items-center justify-center text-slate-300">
                                <QrCode className="w-6 h-6" />
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-indigo-600 block leading-tight max-w-[180px] truncate">
                              {s.permanent_qr_token || '—'}
                            </span>
                            <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 mt-0.5">
                              <Eye className="w-3 h-3" /> Perbesar & Cetak
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">{s.username}</td>
                      <td className="py-3 px-4">
                        {s.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Aktif</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Nonaktif</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleToggleStudentActive(s)}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${s.is_active ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}
                            title={s.is_active ? 'Nonaktifkan Mahasiswa (tidak bisa presensi)' : 'Aktifkan Kembali Mahasiswa'}
                          >
                            {s.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setSelectedStudentForQR(s)}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg cursor-pointer transition-colors"
                            title="Lihat / Cetak QR Code Mahasiswa"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRegenerateQr(s)}
                            className="p-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg cursor-pointer transition-colors"
                            title="Buat Ulang QR (QR lama tidak berlaku lagi)"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditStudent(s)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg cursor-pointer transition-colors"
                            title="Edit Data Mahasiswa"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg cursor-pointer transition-colors"
                            title="Hapus Mahasiswa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Lecturers */}
      {activeTab === 'lecturers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Total {lecturers.length} dosen pengajar aktif. Anda dapat menambah, mengedit data / akun, atau menghapus dosen.
            </p>
            <button
              onClick={() => setIsLecturerModalOpen(true)}
              className="flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" /> Tambah Dosen
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Tampilan kartu untuk layar HP */}
            <ul className="md:hidden divide-y divide-slate-100">
              {lecturers.map((l) => (
                <li key={l.id} className="p-4 space-y-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 break-words">{l.name}</div>
                    <div className="text-xs text-slate-500 font-mono break-all">NIP {l.nip}</div>
                    <div className="text-xs text-slate-600 break-all">{l.email || '-'}</div>
                    <div className="text-xs text-slate-500">
                      Akun: <span className="font-mono">{l.username}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOpenEditLecturer(l)}
                      title="Edit Data Dosen"
                      className={`${MOBILE_ACTION} bg-amber-50 hover:bg-amber-100 text-amber-700`}
                    >
                      <Edit className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteLecturer(l)}
                      title="Hapus Dosen"
                      className={`${MOBILE_ACTION} bg-rose-50 hover:bg-rose-100 text-rose-700`}
                    >
                      <Trash2 className="w-4 h-4" /> Hapus
                    </button>
                  </div>
                </li>
              ))}
              {lecturers.length === 0 && (
                <li className="p-6 text-center text-xs text-slate-400">Belum ada dosen terdaftar.</li>
              )}
            </ul>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">NIP</th>
                    <th className="py-3 px-4">Nama Dosen & Gelar</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Username Akun</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lecturers.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{l.nip}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{l.name}</td>
                      <td className="py-3 px-4 text-slate-600">{l.email || '-'}</td>
                      <td className="py-3 px-4 text-slate-500 font-mono">{l.username}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditLecturer(l)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg cursor-pointer transition-colors"
                            title="Edit Data Dosen"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLecturer(l)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg cursor-pointer transition-colors"
                            title="Hapus Dosen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Classes */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Total {classes.length} kelas perkuliahan. Anda dapat menambah, mengedit kode/jadwal, atau menghapus kelas.
            </p>
            <button
              onClick={() => setIsClassModalOpen(true)}
              className="flex items-center justify-center gap-2 min-h-11 sm:min-h-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" /> Tambah Kelas & Jadwal
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.map((cls) => (
              <div key={cls.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2.5 py-1 rounded bg-indigo-100 text-indigo-800 font-mono font-bold text-xs">
                      {cls.code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {cls.student_count || 0} Mahasiswa
                    </span>
                  </div>
                  <h4 className="font-bold text-base text-slate-900">{cls.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Dosen: {cls.lecturer_name || '-'}</p>

                  {cls.schedules && cls.schedules.length > 0 && (
                    <div className="mt-3 p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600 flex flex-wrap items-center gap-2 font-medium">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      <span>
                        {cls.schedules[0].day_of_week}, {cls.schedules[0].start_time} - {cls.schedules[0].end_time}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">
                        🏢 Ruangan: {cls.schedules[0].room}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between text-xs font-semibold">
                  <button
                    onClick={() => setRosterClass(cls)}
                    className="flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer transition-colors font-bold whitespace-nowrap"
                    title="Tentukan & Kelola Mahasiswa di Kelas Ini"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="sm:hidden">Peserta</span>
                    <span className="hidden sm:inline">Kelola Mahasiswa</span>
                  </button>
                  <div className="contents sm:flex sm:items-center sm:gap-2">
                    <button
                      onClick={() => onViewClassReport(cls.id)}
                      className="flex items-center justify-center gap-1 min-h-11 sm:min-h-0 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                      title="Lihat rekap presensi & nilai kelas ini"
                    >
                      <FileText className="w-3.5 h-3.5" /> Rekap
                    </button>
                    <button
                      onClick={() => handleOpenEditClass(cls)}
                      className="flex items-center justify-center gap-1 min-h-11 sm:min-h-0 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span className="sm:hidden">Edit</span>
                      <span className="hidden sm:inline">Edit Kelas</span>
                    </button>
                    <button
                      onClick={() => handleDeleteClass(cls)}
                      className="flex items-center justify-center gap-1 min-h-11 sm:min-h-0 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Sesi Perkuliahan (Attendance Sessions) */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Manajemen & Kontrol Sesi Perkuliahan</h3>
              <p className="text-xs text-slate-500">
                Total {sessions.length} sesi pertemuan tercatat di sistem. Admin dapat memantau atau menghapus sesi perkuliahan agar basis data tetap bersih dan rapih terstruktur.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Cari berdasarkan nama kelas, kode sesi, tanggal..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs sm:flex sm:flex-wrap sm:items-center">
              {/* Filter Class */}
              <div className="flex items-center gap-1.5 min-w-0 min-h-11 sm:min-h-0 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sessionClassFilter}
                  onChange={(e) => setSessionClassFilter(e.target.value)}
                  className="w-full min-w-0 sm:w-auto bg-transparent text-xs text-slate-700 font-semibold focus:outline-hidden"
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
              <div className="flex sm:block items-center min-w-0 min-h-11 sm:min-h-0 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
                <select
                  value={sessionStatusFilter}
                  onChange={(e) => setSessionStatusFilter(e.target.value)}
                  className="w-full min-w-0 sm:w-auto bg-transparent text-xs text-slate-700 font-semibold focus:outline-hidden"
                >
                  <option value="all">Semua Status</option>
                  {SESSION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label} Saja</option>
                  ))}
                </select>
              </div>

              {/* Sort Order */}
              <div className="flex items-center gap-1.5 min-w-0 min-h-11 sm:min-h-0 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 text-indigo-800">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
                <select
                  value={sessionSortOrder}
                  onChange={(e) => setSessionSortOrder(e.target.value)}
                  className="w-full min-w-0 sm:w-auto bg-transparent text-xs font-bold text-indigo-900 focus:outline-hidden cursor-pointer"
                >
                  <option value="date_asc">Urut Tanggal: Terlama → Terbaru (Kronologis)</option>
                  <option value="date_desc">Urut Tanggal: Terbaru → Terlama</option>
                  <option value="meeting_asc">Nomor Pertemuan (1, 2, 3...)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sessions Table / List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Tampilan kartu untuk layar HP */}
            <ul className="md:hidden divide-y divide-slate-100">
              {adminFilteredSessions.length === 0 ? (
                <li className="p-8 text-center text-xs text-slate-400">Tidak ada sesi pertemuan yang ditemukan.</li>
              ) : (
                adminFilteredSessions.map((ses) => (
                  <li key={ses.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono font-bold rounded text-[10px]">
                            {ses.class_code}
                          </span>
                          <span className="font-bold text-sm text-slate-900">Pertemuan #{ses.meeting_number}</span>
                        </div>
                        <div className="font-semibold text-sm text-slate-800 mt-0.5 break-words">{ses.class_name}</div>
                      </div>
                      <SessionStatusBadge status={ses.status} size="sm" />
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      <div>
                        <span className="font-mono">{ses.meeting_date}</span> •{' '}
                        <span className="font-mono">{ses.start_time} - {ses.end_time}</span> (telat s/d{' '}
                        <span className="font-mono">{ses.late_until}</span>)
                      </div>
                      <div className="break-words">
                        {ses.lecturer_name || '-'} • {ses.room || 'Ruang Kuliah'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
                      <span className="text-emerald-700">{ses.present_count || 0} Hadir</span>
                      <span className="text-amber-700">{ses.late_count || 0} Telat</span>
                      <span className="text-rose-700">{ses.absent_count || 0} Absen</span>
                      <span className="text-slate-400 font-medium">dari {ses.total_students || 0} mhs</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {onSelectSession && (
                        <button
                          onClick={() => onSelectSession(ses.id)}
                          title="Buka Detail & Monitor Sesi"
                          className={`${MOBILE_ACTION} bg-indigo-50 hover:bg-indigo-100 text-indigo-700`}
                        >
                          <Eye className="w-4 h-4" /> Monitor
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSession(ses)}
                        title="Hapus Sesi Ini Dari Sistem"
                        className={`${MOBILE_ACTION} bg-rose-50 hover:bg-rose-100 text-rose-700 ${onSelectSession ? '' : 'col-span-2'}`}
                      >
                        <Trash2 className="w-4 h-4" /> Hapus
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Pertemuan & Tanggal</th>
                    <th className="py-3 px-4">Kelas & Mata Kuliah</th>
                    <th className="py-3 px-4">Dosen & Ruangan</th>
                    <th className="py-3 px-4">Waktu (Jam)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Presensi Mhs</th>
                    <th className="py-3 px-4 text-center">Aksi Kontrol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminFilteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Tidak ada sesi pertemuan yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    adminFilteredSessions.map((ses) => (
                      <tr key={ses.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">Pertemuan #{ses.meeting_number}</span>
                          <span className="text-slate-500 font-mono text-[11px] block">{ses.meeting_date}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{ses.session_code}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono font-bold rounded text-[10px]">
                              {ses.class_code}
                            </span>
                          </div>
                          <span className="font-bold text-slate-800">{ses.class_name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 block">{ses.lecturer_name || '-'}</span>
                          <span className="text-indigo-600 font-semibold text-[11px] inline-flex items-center gap-1 mt-0.5">
                            🏢 {ses.room || 'Ruang Kuliah'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          <div>{ses.start_time} - {ses.end_time}</div>
                          <div className="text-[10px] text-slate-400">Tenggat Telat: {ses.late_until}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <SessionStatusBadge status={ses.status} size="sm" />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5 font-bold text-[11px]">
                            <span className="text-emerald-700" title="Hadir">{ses.present_count || 0} H</span>
                            <span>•</span>
                            <span className="text-amber-700" title="Telat">{ses.late_count || 0} T</span>
                            <span>•</span>
                            <span className="text-rose-700" title="Absen">{ses.absent_count || 0} A</span>
                          </div>
                          <span className="block text-[10px] text-slate-400">
                            dari {ses.total_students || 0} mhs
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {onSelectSession && (
                              <button
                                onClick={() => onSelectSession(ses.id)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
                                title="Buka Detail & Monitor Sesi"
                              >
                                Monitor
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteSession(ses)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg cursor-pointer transition-colors"
                              title="Hapus Sesi Ini Dari Sistem"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS SECTION --- */}

      {/* 1. Add Student Modal */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Tambah Mahasiswa Baru</h3>
              <button onClick={() => setIsStudentModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateStudent} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">NIM</label>
                <input
                  type="text"
                  required
                  value={studentForm.nim}
                  onChange={(e) => setStudentForm({ ...studentForm, nim: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  placeholder="220101099"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nama Mahasiswa"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Program Studi</label>
                <input
                  type="text"
                  required
                  value={studentForm.major}
                  onChange={(e) => setStudentForm({ ...studentForm, major: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={studentForm.username}
                    onChange={(e) => setStudentForm({ ...studentForm, username: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                    placeholder="mhs_user"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowStudentPass(!showStudentPass)}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      {showStudentPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showStudentPass ? 'Tutup' : 'Lihat'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showStudentPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={studentForm.password}
                      onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                      className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                      placeholder="password123"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPass(!showStudentPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showStudentPass ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showStudentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-indigo-600 italic">
                * Permanent QR Token akan otomatis dibuatkan secara unik.
              </p>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStudentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Mahasiswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit Student Modal */}
      {isEditStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Edit Data Mahasiswa</h3>
              <button onClick={() => setIsEditStudentModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateStudent} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">NIM</label>
                <input
                  type="text"
                  required
                  value={editStudentForm.nim}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, nim: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editStudentForm.name}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Program Studi</label>
                <input
                  type="text"
                  required
                  value={editStudentForm.major}
                  onChange={(e) => setEditStudentForm({ ...editStudentForm, major: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={editStudentForm.username}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, username: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Password Baru</label>
                    <button
                      type="button"
                      onClick={() => setShowEditStudentPass(!showEditStudentPass)}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      {showEditStudentPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showEditStudentPass ? 'Tutup' : 'Lihat'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showEditStudentPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={editStudentForm.password}
                      onChange={(e) => setEditStudentForm({ ...editStudentForm, password: e.target.value })}
                      className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                      placeholder="(Kosongkan jika tetap)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditStudentPass(!showEditStudentPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showEditStudentPass ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showEditStudentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between max-sm:gap-3">
                <p className="text-[11px] text-slate-400">
                  * Kosongkan password baru jika tidak ingin mengubah kata sandi mahasiswa ini.
                </p>
                <button
                  type="button"
                  onClick={() => setEditStudentForm({ ...editStudentForm, password: 'mhs123' })}
                  className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer shrink-0"
                >
                  Set "mhs123"
                </button>
              </div>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditStudentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add Lecturer Modal */}
      {isLecturerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Tambah Dosen Pengajar</h3>
              <button onClick={() => setIsLecturerModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateLecturer} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">NIP</label>
                <input
                  type="text"
                  required
                  value={lecturerForm.nip}
                  onChange={(e) => setLecturerForm({ ...lecturerForm, nip: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  placeholder="198501012010..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap & Gelar</label>
                <input
                  type="text"
                  required
                  value={lecturerForm.name}
                  onChange={(e) => setLecturerForm({ ...lecturerForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="Dr. Nama Dosen, M.Kom"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={lecturerForm.email}
                  onChange={(e) => setLecturerForm({ ...lecturerForm, email: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="dosen@univ.ac.id"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={lecturerForm.username}
                    onChange={(e) => setLecturerForm({ ...lecturerForm, username: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                    placeholder="dosen_user"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => setShowLecturerPass(!showLecturerPass)}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      {showLecturerPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showLecturerPass ? 'Tutup' : 'Lihat'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showLecturerPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={lecturerForm.password}
                      onChange={(e) => setLecturerForm({ ...lecturerForm, password: e.target.value })}
                      className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                      placeholder="password123"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLecturerPass(!showLecturerPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showLecturerPass ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showLecturerPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLecturerModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Dosen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Lecturer Modal */}
      {isEditLecturerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Edit Data Dosen</h3>
              <button onClick={() => setIsEditLecturerModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateLecturer} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">NIP</label>
                <input
                  type="text"
                  required
                  value={editLecturerForm.nip}
                  onChange={(e) => setEditLecturerForm({ ...editLecturerForm, nip: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap & Gelar</label>
                <input
                  type="text"
                  required
                  value={editLecturerForm.name}
                  onChange={(e) => setEditLecturerForm({ ...editLecturerForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editLecturerForm.email}
                  onChange={(e) => setEditLecturerForm({ ...editLecturerForm, email: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={editLecturerForm.username}
                    onChange={(e) => setEditLecturerForm({ ...editLecturerForm, username: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Password Baru</label>
                    <button
                      type="button"
                      onClick={() => setShowEditLecturerPass(!showEditLecturerPass)}
                      className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      {showEditLecturerPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showEditLecturerPass ? 'Tutup' : 'Lihat'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showEditLecturerPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={editLecturerForm.password}
                      onChange={(e) => setEditLecturerForm({ ...editLecturerForm, password: e.target.value })}
                      className="w-full text-xs p-2.5 pr-8 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                      placeholder="(Kosongkan jika tetap)"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditLecturerPass(!showEditLecturerPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showEditLecturerPass ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showEditLecturerPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between max-sm:gap-3">
                <p className="text-[11px] text-slate-400">
                  * Kosongkan password baru jika tidak ingin mengubah kata sandi dosen ini.
                </p>
                <button
                  type="button"
                  onClick={() => setEditLecturerForm({ ...editLecturerForm, password: 'dosen123' })}
                  className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer shrink-0"
                >
                  Set "dosen123"
                </button>
              </div>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditLecturerModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add Class Modal */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Tambah Kelas & Jadwal Baru</h3>
              <button onClick={() => setIsClassModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kode Kelas</label>
                  <input
                    type="text"
                    required
                    value={classForm.code}
                    onChange={(e) => setClassForm({ ...classForm, code: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-indigo-500"
                    placeholder="SI-08"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dosen Pengampu</label>
                  <select
                    value={classForm.lecturer_id}
                    onChange={(e) => setClassForm({ ...classForm, lecturer_id: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    {lecturers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Mata Kuliah</label>
                <input
                  type="text"
                  required
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="Pemrograman Mobile"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Hari</label>
                  <select
                    value={classForm.day_of_week}
                    onChange={(e) => setClassForm({ ...classForm, day_of_week: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mulai</label>
                  <input
                    type="time"
                    value={classForm.start_time}
                    onChange={(e) => setClassForm({ ...classForm, start_time: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Selesai</label>
                  <input
                    type="time"
                    value={classForm.end_time}
                    onChange={(e) => setClassForm({ ...classForm, end_time: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ruangan Kuliah / Lab <span className="text-indigo-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={classForm.room}
                  onChange={(e) => setClassForm({ ...classForm, room: e.target.value })}
                  placeholder="Contoh: Lab Komputer 1, Ruang Teori 204"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['Lab Komputer 1', 'Lab Jaringan', 'Ruang Teori 204', 'Auditorium 1'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setClassForm({ ...classForm, room: preset })}
                      className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md cursor-pointer transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Class Modal */}
      {isEditClassModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 sticky top-0 z-10">
              <h3 className="font-bold text-sm">Edit Data Kelas & Jadwal</h3>
              <button onClick={() => setIsEditClassModalOpen(false)} className="p-2 -m-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateClass} className="p-6 space-y-3">
              {formError && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-xl">{formError}</div>}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kode Kelas</label>
                  <input
                    type="text"
                    required
                    value={editClassForm.code}
                    onChange={(e) => setEditClassForm({ ...editClassForm, code: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dosen Pengampu</label>
                  <select
                    value={editClassForm.lecturer_id}
                    onChange={(e) => setEditClassForm({ ...editClassForm, lecturer_id: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    {lecturers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Mata Kuliah</label>
                <input
                  type="text"
                  required
                  value={editClassForm.name}
                  onChange={(e) => setEditClassForm({ ...editClassForm, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Hari</label>
                  <select
                    value={editClassForm.day_of_week}
                    onChange={(e) => setEditClassForm({ ...editClassForm, day_of_week: e.target.value })}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mulai</label>
                  <input
                    type="time"
                    value={editClassForm.start_time}
                    onChange={(e) => setEditClassForm({ ...editClassForm, start_time: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Selesai</label>
                  <input
                    type="time"
                    value={editClassForm.end_time}
                    onChange={(e) => setEditClassForm({ ...editClassForm, end_time: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ruangan Kuliah / Lab <span className="text-indigo-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editClassForm.room}
                  onChange={(e) => setEditClassForm({ ...editClassForm, room: e.target.value })}
                  placeholder="Contoh: Lab Komputer 1, Ruang Teori 204"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['Lab Komputer 1', 'Lab Jaringan', 'Ruang Teori 204', 'Auditorium 1'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditClassForm({ ...editClassForm, room: preset })}
                      className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md cursor-pointer transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:px-6 max-sm:pb-6 max-sm:bg-white pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditClassModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer shadow-xs">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Class Roster Management Modal (Admin View) */}
      {rosterClass && (
        <ClassRosterModal
          classId={rosterClass.id}
          className={`${rosterClass.name} (${rosterClass.code})`}
          isOpen={Boolean(rosterClass)}
          onClose={() => setRosterClass(null)}
          onRosterChanged={fetchAll}
        />
      )}

      {/* 8. Student QR Code Card Preview Modal */}
      {selectedStudentForQR && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative max-w-md w-full">
            <button
              onClick={() => setSelectedStudentForQR(null)}
              className="absolute -top-2 -right-1 sm:-top-3 sm:-right-3 z-20 w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center font-bold text-sm shadow-xl cursor-pointer border-2 border-white transition-all"
            >
              ✕
            </button>
            <StudentCard student={selectedStudentForQR} />
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => handleRegenerateQr(selectedStudentForQR)}
                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-4 py-2 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Buat Ulang QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
