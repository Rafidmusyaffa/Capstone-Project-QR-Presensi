import { useState, useEffect, useCallback } from 'react';

/**
 * Navigasi sederhana berbasis URL hash agar refresh dan tombol Back browser/HP berfungsi.
 *   #/              -> dashboard
 *   #/sesi/:id      -> detail sesi
 *   #/rekap/:id     -> rekap kelas
 */
export function parseHash(hash = window.location.hash) {
  const [, page, id] = hash.replace(/^#/, '').split('/');
  if ((page === 'sesi' || page === 'rekap') && /^\d+$/.test(id || '')) {
    return { page, id: Number(id) };
  }
  return { page: 'dashboard', id: null };
}

// Jumlah halaman yang dibuka dari dalam aplikasi; menentukan apakah "Kembali" cukup history.back()
let inAppDepth = 0;

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash());

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHash();
      if (next.page === 'dashboard') inAppDepth = 0;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((page, id) => {
    inAppDepth += 1;
    window.location.hash = `/${page}/${id}`;
  }, []);

  // Kembali ke dashboard: pakai history.back() bila halaman dibuka dari aplikasi,
  // selain itu (link langsung / setelah refresh) ganti hash tanpa menambah riwayat
  const goBack = useCallback(() => {
    if (inAppDepth > 0) {
      inAppDepth -= 1;
      window.history.back();
    } else {
      window.location.replace('#/');
    }
  }, []);

  // Reset ke dashboard tanpa jejak riwayat (login/logout)
  const resetRoute = useCallback(() => {
    inAppDepth = 0;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setRoute({ page: 'dashboard', id: null });
  }, []);

  return { route, navigate, goBack, resetRoute };
}
