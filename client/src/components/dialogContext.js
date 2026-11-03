import { createContext, useContext } from 'react';

export const DialogContext = createContext(null);

/**
 * Pengganti window.confirm/alert milik aplikasi:
 * - confirm({ title, message, confirmLabel, cancelLabel, tone }) -> Promise<boolean>
 * - notify(message, tone) menampilkan toast singkat (tone: 'success' | 'error' | 'info')
 */
export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog harus dipakai di dalam <DialogProvider>.');
  return ctx;
}
