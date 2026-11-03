import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { DialogContext } from './dialogContext';
import { APP_ERROR_EVENT } from '../globalErrors';

const TOAST_STYLES = {
  success: { icon: CheckCircle2, className: 'bg-emerald-50 border-emerald-200 text-emerald-900', iconClass: 'text-emerald-600' },
  error: { icon: AlertCircle, className: 'bg-rose-50 border-rose-200 text-rose-900', iconClass: 'text-rose-600' },
  info: { icon: Info, className: 'bg-white border-slate-200 text-slate-800', iconClass: 'text-indigo-600' },
};

export default function DialogProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const nextToastId = useRef(0);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setConfirmState({ ...options, resolve })),
    []
  );

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, tone = 'info') => {
    const id = ++nextToastId.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => dismissToast(id), tone === 'error' ? 6000 : 4000);
  }, [dismissToast]);

  // Error JavaScript asli dari aplikasi (lihat globalErrors.js): cukup toast singkat, tanpa detail teknis
  useEffect(() => {
    const onAppError = () => notify('Terjadi kesalahan. Coba muat ulang halaman.', 'error');
    window.addEventListener(APP_ERROR_EVENT, onAppError);
    return () => window.removeEventListener(APP_ERROR_EVENT, onAppError);
  }, [notify]);

  const settleConfirm = useCallback((result) => {
    setConfirmState((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);
  const handleCancel = useCallback(() => settleConfirm(false), [settleConfirm]);
  const handleConfirm = useCallback(() => settleConfirm(true), [settleConfirm]);

  const value = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          tone={confirmState.tone}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-[70] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.tone] || TOAST_STYLES.info;
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-2.5 p-3 pl-3.5 rounded-2xl border shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${style.className}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.iconClass}`} />
              <span className="flex-1 min-w-0 break-words py-0.5">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="shrink-0 -m-1 p-2 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </DialogContext.Provider>
  );
}
