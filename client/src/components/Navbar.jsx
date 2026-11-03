import React, { useState, useEffect } from 'react';
import { QrCode, LogOut, Clock, User } from 'lucide-react';
import UserProfileModal from './UserProfileModal';
import { serverNowParts } from '../serverClock';

export default function Navbar({ user, onLogout, onUserUpdated }) {
  const [currentTime, setCurrentTime] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    // Jam server WIB (bukan jam perangkat), sama dengan acuan validasi presensi
    const updateTime = () => setCurrentTime(serverNowParts().time);
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/70">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Admin
          </span>
        );
      case 'dosen':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/70">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Dosen
          </span>
        );
      case 'mahasiswa':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Mahasiswa
          </span>
        );
    }
  };

  return (
    <>
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base text-slate-900 tracking-tight truncate">PresensiQR</span>
                  <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Sistem Kampus
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
                  Manajemen Sesi & Presensi Berbasis Waktu
                </p>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Live Clock */}
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/60 text-slate-600 font-mono text-[11px] sm:text-xs font-semibold">
                <Clock className="hidden sm:block w-3.5 h-3.5 text-indigo-600" />
                <span title="Jam server (Asia/Jakarta)">
                  {currentTime || '00:00:00'}
                  <span className="hidden min-[400px]:inline"> WIB</span>
                </span>
              </div>

              {/* User Profile Button */}
              {user && (
                <div className="flex items-center gap-1 sm:gap-2 pl-2 sm:pl-3 border-l border-slate-200/80">
                  <button
                    onClick={() => setIsProfileOpen(true)}
                    aria-label="Profil akun"
                    className="flex items-center justify-center gap-2.5 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-1 sm:pl-2.5 hover:bg-slate-100/60 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-200/80 text-left group"
                    title="Klik untuk melihat Profil & Pengaturan Akun"
                  >
                    <div className="text-right hidden sm:block">
                      <div className="text-xs font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">
                        {user.name || user.username}
                      </div>
                      <div className="mt-0.5">{getRoleBadge(user.role)}</div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-violet-100 text-indigo-700 flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-xs group-hover:from-indigo-600 group-hover:to-violet-600 group-hover:text-white transition-all">
                      <User className="w-4 h-4" />
                    </div>
                  </button>

                  <button
                    onClick={onLogout}
                    title="Logout (Keluar)"
                    aria-label="Keluar"
                    className="p-3.5 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-xl transition-all cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* User Profile Modal */}
      {isProfileOpen && (
        <UserProfileModal
          user={user}
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          onUserUpdated={onUserUpdated}
        />
      )}
    </>
  );
}
