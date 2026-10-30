import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { getCurrentUser, setCurrentUser, setToken, apiRequest } from './api';
import { syncServerClock } from './serverClock';
import { useHashRoute } from './hashRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';

// Halaman dimuat sesuai kebutuhan agar unduhan awal kecil (mahasiswa tidak perlu library scanner)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const DosenDashboard = lazy(() => import('./pages/DosenDashboard'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const ClassReport = lazy(() => import('./pages/ClassReport'));
const MahasiswaDashboard = lazy(() => import('./pages/MahasiswaDashboard'));

export default function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [loginNotice, setLoginNotice] = useState(null);
  const { route, navigate, goBack, resetRoute } = useHashRoute();

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiRequest('/auth/me');
      setUser(res.user);
      setCurrentUser(res.user);
    } catch {
      setUser(null);
      setCurrentUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    if (getCurrentUser()) {
      checkAuth();
    }
  }, [checkAuth]);

  // Jam server (WIB) disinkronkan saat start lalu tiap 5 menit
  useEffect(() => {
    syncServerClock();
    const interval = setInterval(syncServerClock, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Halaman baru selalu dibuka dari atas (penting di HP)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, route.id]);

  // Token kedaluwarsa (401 dari API): kembali ke halaman login dengan pesan
  useEffect(() => {
    const onExpired = (e) => {
      setUser(null);
      resetRoute();
      setLoginNotice(e.detail);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [resetRoute]);

  const handleLoginSuccess = (userData) => {
    setLoginNotice(null);
    setUser(userData);
    // Pertahankan halaman tujuan (mis. link #/sesi/5) kecuali untuk mahasiswa
    if (userData?.role === 'mahasiswa') resetRoute();
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentUser(null);
    setToken(null);
    resetRoute();
  };

  if (!user || !user.role || !['admin', 'dosen', 'mahasiswa'].includes(user.role)) {
    return <Login onLoginSuccess={handleLoginSuccess} notice={loginNotice} />;
  }

  const isStaff = user.role === 'admin' || user.role === 'dosen';
  const openSession = (id) => navigate('sesi', id);
  const openClassReport = (classId) => navigate('rekap', classId);

  let content;
  if (!isStaff) {
    content = <MahasiswaDashboard user={user} />;
  } else if (route.page === 'sesi') {
    content = <SessionDetail key={route.id} sessionId={route.id} onBack={goBack} />;
  } else if (route.page === 'rekap') {
    content = <ClassReport key={route.id} classId={route.id} onBack={goBack} />;
  } else if (user.role === 'admin') {
    content = <AdminDashboard onSelectSession={openSession} onViewClassReport={openClassReport} />;
  } else {
    content = <DosenDashboard user={user} onSelectSession={openSession} onViewClassReport={openClassReport} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col text-slate-800 selection:bg-indigo-500 selection:text-white">
      <Navbar user={user} onLogout={handleLogout} onUserUpdated={checkAuth} />

      <main className="flex-1 pb-10">
        <Suspense
          fallback={<div className="max-w-7xl mx-auto p-12 text-center text-slate-400 font-medium text-xs">Memuat halaman...</div>}
        >
          {content}
        </Suspense>
      </main>

      <footer className="border-t border-slate-200/60 bg-white/60 backdrop-blur-sm py-4 text-center text-xs text-slate-400 font-medium">
        <p>
          PresensiQR • Sistem Informasi Presensi Mahasiswa Berbasis QR Code
        </p>
      </footer>
    </div>
  );
}
