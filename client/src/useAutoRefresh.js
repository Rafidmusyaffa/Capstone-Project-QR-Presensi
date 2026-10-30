import { useEffect, useRef } from 'react';

/**
 * Jalankan callback setiap `intervalMs` selama tab terlihat, dan sekali lagi
 * saat pengguna kembali ke tab (mis. membuka HP dari layar kunci).
 */
export default function useAutoRefresh(callback, intervalMs = 30000) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) callbackRef.current();
    };
    const onVisible = () => {
      if (!document.hidden) callbackRef.current();
    };
    const interval = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
}
