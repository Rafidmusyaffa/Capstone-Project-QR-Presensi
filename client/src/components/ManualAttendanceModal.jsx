import React, { useState } from 'react';
import { apiRequest } from '../api';
import { X, CheckCircle2, AlertTriangle, XCircle, UserCheck, AlertCircle } from 'lucide-react';

// Form diisi dari props saat modal dipasang; pemanggil memasang ulang modal per mahasiswa (prop key)
export default function ManualAttendanceModal({ session, student, isOpen, onClose, onSuccess }) {
  const [selectedStudentId, setSelectedStudentId] = useState(student?.student_id ?? '');
  const [status, setStatus] = useState(student?.attendance_status || 'PRESENT');
  const [remarks, setRemarks] = useState(student?.remarks || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setError('Pilih mahasiswa terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiRequest('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({
          session_id: session.id,
          student_id: Number(selectedStudentId),
          status,
          remarks: remarks || 'Dicatat manual oleh Dosen',
        }),
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm">Input / Ubah Presensi Manual</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Mahasiswa:</label>
            {student ? (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800">
                {student.name} ({student.nim})
              </div>
            ) : (
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
              >
                <option value="">-- Pilih Mahasiswa --</option>
                {session?.students?.map((s) => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.name} ({s.nim}) - {s.attendance_status || 'Belum Presensi'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Status Kehadiran:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus('PRESENT')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  status === 'PRESENT'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>PRESENT</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('LATE')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  status === 'LATE'
                    ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-400/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>LATE</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('ABSENT')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  status === 'ABSENT'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-400/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>ABSENT</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan / Alasan:</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Contoh: Izin Sakit, Hadir Manual, dll."
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer shadow-xs"
            >
              {loading ? 'Menyimpan...' : 'Simpan Presensi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
