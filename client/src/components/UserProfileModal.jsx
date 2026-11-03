import React, { useState } from 'react';
import { apiRequest } from '../api';
import {
  X,
  User,
  Shield,
  School,
  GraduationCap,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

export default function UserProfileModal({ user, isOpen, onClose, onUserUpdated }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!isOpen || !user) return null;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!currentPassword) {
      setErrorMessage('Password lama wajib diisi.');
      return;
    }

    if (newPassword.trim().length < 6) {
      setErrorMessage('Password baru minimal 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok dengan password baru.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setStatusMessage(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (onUserUpdated) onUserUpdated();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <Shield className="w-3.5 h-3.5" /> Administrator Sistem
          </span>
        );
      case 'dosen':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <School className="w-3.5 h-3.5" /> Dosen Pengajar
          </span>
        );
      case 'mahasiswa':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <GraduationCap className="w-3.5 h-3.5" /> Mahasiswa
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start sm:items-center-safe justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[calc(100dvh-1.5rem)] flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden sm:block p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Profil Akun Saya</h3>
              <p className="text-xs text-slate-400">Informasi identitas akun & pengaturan kata sandi</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-white p-2 -m-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto overscroll-contain flex-1">
          {/* Identity Information Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="min-w-0">
                <h4 className="font-bold text-base text-slate-900 break-words">{user.name || user.username}</h4>
                <p className="text-xs text-slate-500">Username: <strong className="font-mono text-slate-700">{user.username}</strong></p>
              </div>
              <div>{getRoleBadge(user.role)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {user.role === 'dosen' && (
                <>
                  <div>
                    <span className="text-slate-400 block font-medium">NIP</span>
                    <span className="font-mono font-bold text-slate-800">{user.lecturer?.nip || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Email</span>
                    <span className="font-semibold text-slate-800 break-all block">{user.lecturer?.email || '-'}</span>
                  </div>
                </>
              )}

              {user.role === 'mahasiswa' && (
                <>
                  <div>
                    <span className="text-slate-400 block font-medium">NIM</span>
                    <span className="font-mono font-bold text-slate-800">{user.student?.nim || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Program Studi</span>
                    <span className="font-semibold text-slate-800">{user.student?.major || '-'}</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200">
                    <span className="text-slate-400 block font-medium text-[10px]">Permanent QR Token</span>
                    <span className="font-mono font-bold text-indigo-700 break-all">{user.student?.permanent_qr_token || '-'}</span>
                  </div>
                </>
              )}

              {user.role === 'admin' && (
                <div className="col-span-2">
                  <span className="text-slate-400 block font-medium">Hak Akses</span>
                  <span className="font-semibold text-slate-800">Hak Akses Penuh Manajemen Seluruh Data Master</span>
                </div>
              )}
            </div>
          </div>

          {/* Change Password Form */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-xs">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-indigo-600" /> Ubah Kata Sandi (Password)
            </h4>

            {statusMessage && (
              <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              {/* Current Password (wajib) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Password Saat Ini:
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Masukkan password lama Anda"
                    className="w-full text-xs pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password Baru:
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan password baru (min 6 karakter)"
                    className="w-full text-xs pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={showNewPass ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konfirmasi Password Baru:
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="w-full text-xs pl-3 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={showConfirmPass ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto justify-center min-h-11 sm:min-h-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{loading ? 'Menyimpan...' : 'Perbarui Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer bg-slate-50 border-t border-slate-200 p-3 sm:p-4 px-4 sm:px-6 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
