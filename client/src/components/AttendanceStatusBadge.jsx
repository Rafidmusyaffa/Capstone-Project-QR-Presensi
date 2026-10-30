import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const STYLES = {
  PRESENT: { label: 'Hadir', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  LATE: { label: 'Telat', icon: AlertTriangle, className: 'bg-amber-100 text-amber-800 border-amber-200' },
  ABSENT: { label: 'Absen', icon: XCircle, className: 'bg-rose-100 text-rose-800 border-rose-200' },
};

// Status presensi mahasiswa pada satu sesi (PRESENT/LATE/ABSENT, atau belum tercatat)
export default function AttendanceStatusBadge({ status, emptyLabel = 'Belum Presensi' }) {
  const style = STYLES[status];
  if (!style) {
    return (
      <span className="inline-flex shrink-0 items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
        {emptyLabel}
      </span>
    );
  }
  const Icon = style.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${style.className}`}>
      <Icon className="w-3 h-3" /> {style.label}
    </span>
  );
}
