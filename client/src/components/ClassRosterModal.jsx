import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { X, Search, UserCheck, UserPlus, UserMinus, Users, Check, AlertCircle } from 'lucide-react';

export default function ClassRosterModal({ classId, className, isOpen, onClose, onRosterChanged }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [activeFilterTab, setActiveFilterTab] = useState('all'); // 'all', 'enrolled', 'not_enrolled'

  useEffect(() => {
    if (isOpen && classId) {
      fetchRoster();
    }
  }, [isOpen, classId]);

  const fetchRoster = async () => {
    try {
      setLoading(true);
      const data = await apiRequest(`/classes/${classId}/students-roster`);
      setStudents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnrollment = async (student) => {
    setActionMessage(null);
    try {
      if (student.is_enrolled) {
        // Remove from class
        await apiRequest(`/classes/${classId}/students/${student.id}`, {
          method: 'DELETE',
        });
        setActionMessage(`${student.name} dikeluarkan dari kelas.`);
      } else {
        // Add to class
        await apiRequest(`/classes/${classId}/students`, {
          method: 'POST',
          body: JSON.stringify({ student_id: student.id }),
        });
        setActionMessage(`${student.name} berhasil didaftarkan ke kelas.`);
      }

      // Update local state
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_enrolled: s.is_enrolled ? 0 : 1 } : s))
      );

      if (onRosterChanged) onRosterChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!isOpen) return null;

  const filtered = (students || []).filter((s) => {
    const sName = (s.name || '').toLowerCase();
    const sNim = (s.nim || '').toLowerCase();
    const sMajor = (s.major || '').toLowerCase();
    const q = search.toLowerCase();

    const matchesSearch = sName.includes(q) || sNim.includes(q) || sMajor.includes(q);
    if (!matchesSearch) return false;

    if (activeFilterTab === 'enrolled') return Boolean(s.is_enrolled);
    if (activeFilterTab === 'not_enrolled') return !s.is_enrolled;
    return true;
  });

  const enrolledCount = (students || []).filter((s) => s.is_enrolled).length;

  const handleEnrollAll = async () => {
    if (!confirm('Apakah Anda ingin mendaftarkan seluruh mahasiswa yang belum terdaftar ke dalam kelas ini?')) return;
    try {
      const notEnrolled = students.filter((s) => !s.is_enrolled);
      for (const st of notEnrolled) {
        await apiRequest(`/classes/${classId}/students`, {
          method: 'POST',
          body: JSON.stringify({ student_id: st.id }),
        });
      }
      setActionMessage(`Berhasil mendaftarkan ${notEnrolled.length} mahasiswa ke dalam kelas.`);
      fetchRoster();
      if (onRosterChanged) onRosterChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Kelola Mahasiswa Peserta Kelas</h3>
              <p className="text-xs text-slate-400">
                {className} • <strong className="text-indigo-300">{enrolledCount} Mahasiswa Terdaftar</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar & Quick Actions */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIM, atau prodi..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg text-[11px] font-semibold">
              <button
                onClick={() => setActiveFilterTab('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeFilterTab === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({students.length})
              </button>
              <button
                onClick={() => setActiveFilterTab('enrolled')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeFilterTab === 'enrolled' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Terdaftar ({enrolledCount})
              </button>
              <button
                onClick={() => setActiveFilterTab('not_enrolled')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeFilterTab === 'not_enrolled' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Belum ({students.length - enrolledCount})
              </button>
            </div>

            {students.length - enrolledCount > 0 && (
              <button
                onClick={handleEnrollAll}
                className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                title="Daftarkan seluruh mahasiswa yang belum ada di kelas ini"
              >
                + Masukkan Semua
              </button>
            )}
          </div>
        </div>

        {actionMessage && (
          <div className="p-2.5 px-6 bg-emerald-50 text-emerald-800 text-xs font-medium flex items-center gap-2 border-b border-emerald-100">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Student List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 p-2">
          {loading ? (
            <div className="text-center py-10 text-xs text-slate-400">Memuat daftar mahasiswa...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              {students.length === 0 ? 'Belum ada mahasiswa terdaftar di database.' : 'Tidak ada mahasiswa yang cocok dengan pencarian.'}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{s.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono font-semibold text-[11px] text-slate-600">
                      {s.nim}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.major || 'Program Studi -'} • QR Token:{' '}
                    <span className="font-mono text-slate-400">{s.permanent_qr_token}</span>
                  </p>
                </div>

                <div>
                  {s.is_enrolled ? (
                    <button
                      onClick={() => handleToggleEnrollment(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer group"
                    >
                      <UserCheck className="w-3.5 h-3.5 group-hover:hidden" />
                      <UserMinus className="w-3.5 h-3.5 hidden group-hover:inline" />
                      <span className="group-hover:hidden">Terdaftar</span>
                      <span className="hidden group-hover:inline">Keluarkan</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleEnrollment(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Masukkan ke Kelas
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Perubahan daftar mahasiswa akan otomatis tersinkronisasi pada pertemuan berikutnya.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
