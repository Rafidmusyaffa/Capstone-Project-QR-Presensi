import React from 'react';
import { SESSION_STATUSES } from '../sessionStatus';

const SIZES = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-0.5 text-[11px] gap-1.5',
  lg: 'px-2.5 py-0.5 text-xs gap-1.5',
};

export default function SessionStatusBadge({ status, size = 'md' }) {
  const config = SESSION_STATUSES.find((s) => s.value === status) || {
    label: status || '-',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border whitespace-nowrap ${SIZES[size] || SIZES.md} ${config.badge}`}
      title={status}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
      {config.label}
    </span>
  );
}
