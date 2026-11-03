import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

// Dialog konfirmasi milik aplikasi (pengganti window.confirm). Fokus awal di "Batal", Esc = batal.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const isDanger = tone === 'danger';

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onCancel]);

  const Icon = isDanger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 p-5 sm:p-6 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
              isDanger ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 id="confirm-dialog-title" className="font-bold text-base text-slate-900">
              {title}
            </h3>
            {message && (
              <p id="confirm-dialog-message" className="mt-1 text-sm text-slate-600 whitespace-pre-line break-words">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 sm:min-h-0 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 sm:min-h-0 px-4 py-2.5 text-sm font-bold text-white rounded-xl cursor-pointer transition-colors shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500'
                : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
