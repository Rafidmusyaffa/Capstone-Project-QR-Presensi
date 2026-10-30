// Siklus hidup sesi: SCHEDULED -> ACTIVE -> ATTENDANCE_CLOSED -> CLOSED -> FINALIZED
export const SESSION_STATUSES = [
  {
    value: 'SCHEDULED',
    label: 'Terjadwal',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  {
    value: 'ACTIVE',
    label: 'Aktif',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse',
    dot: 'bg-emerald-500',
  },
  {
    value: 'ATTENDANCE_CLOSED',
    label: 'Presensi Ditutup',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  {
    value: 'CLOSED',
    label: 'Ditutup',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  {
    value: 'FINALIZED',
    label: 'Final',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
];
