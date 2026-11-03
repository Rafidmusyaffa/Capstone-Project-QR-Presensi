import React from 'react';
import { MoveHorizontal } from 'lucide-react';

// Petunjuk di HP bahwa tabel lebar bisa digeser ke samping di dalam kotaknya
export default function ScrollHint() {
  return (
    <p className="md:hidden flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-500 bg-slate-50/80 border-b border-slate-100">
      <MoveHorizontal className="w-4 h-4 text-indigo-500 shrink-0" />
      Geser untuk melihat kolom lain
    </p>
  );
}
