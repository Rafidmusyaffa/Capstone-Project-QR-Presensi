import React, { useState, useEffect } from 'react';
import { getCurrentUser, setCurrentUser, setToken, apiRequest } from './api';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import DosenDashboard from './pages/DosenDashboard';
import SessionDetail from './pages/SessionDetail';
import ClassReport from './pages/ClassReport';
import MahasiswaDashboard from './pages/MahasiswaDashboard';

export default function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeReportClassId, setActiveReportClassId] = useState(null);

  const checkAuth = async () => {
    try {
      const res = await apiRequest('/auth/me');
      setUser(res.user);
      setCurrentUser(res.user);
    } catch (e) {
      setUser(null);
      setCurrentUser(null);
      setToken(null);
    }
  };

  useEffect(() => {
    if (getCurrentUser()) {
      checkAuth();
    }
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveSessionId(null);
    setActiveReportClassId(null);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentUser(null);
    setToken(null);
    setActiveSessionId(null);
    setActiveReportClassId(null);
  };

  if (!user || !user.role || !['admin', 'dosen', 'mahasiswa'].includes(user.role)) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col text-slate-800 selection:bg-indigo-500 selection:text-white">
      <Navbar user={user} onLogout={handleLogout} onUserUpdated={checkAuth} />

      <main className="flex-1 pb-10">
        {user.role === 'admin' && (
          <>
            {activeSessionId ? (
              <SessionDetail
                sessionId={activeSessionId}
                onBack={() => setActiveSessionId(null)}
              />
            ) : activeReportClassId ? (
              <ClassReport
                classId={activeReportClassId}
                onBack={() => setActiveReportClassId(null)}
              />
            ) : (
              <AdminDashboard
                user={user}
                onSelectSession={(id) => setActiveSessionId(id)}
                onViewClassReport={(classId) => setActiveReportClassId(classId)}
              />
            )}
          </>
        )}

        {user.role === 'dosen' && (
          <>
            {activeSessionId ? (
              <SessionDetail
                sessionId={activeSessionId}
                onBack={() => setActiveSessionId(null)}
              />
            ) : activeReportClassId ? (
              <ClassReport
                classId={activeReportClassId}
                onBack={() => setActiveReportClassId(null)}
              />
            ) : (
              <DosenDashboard
                user={user}
                onSelectSession={(id) => setActiveSessionId(id)}
                onViewClassReport={(classId) => setActiveReportClassId(classId)}
              />
            )}
          </>
        )}

        {user.role === 'mahasiswa' && <MahasiswaDashboard user={user} />}
      </main>

      <footer className="border-t border-slate-200/60 bg-white/60 backdrop-blur-sm py-4 text-center text-xs text-slate-400 font-medium">
        <p>
          PresensiQR • Sistem Informasi Presensi Mahasiswa Berbasis QR Code
        </p>
      </footer>
    </div>
  );
}
