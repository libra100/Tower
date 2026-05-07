import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface WorkerControlProps {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  count: number;
  onAdjust: (delta: number) => void;
  color: 'amber' | 'blue' | 'emerald' | 'orange' | 'slate';
}

export function WorkerControl({ icon, label, count, onAdjust, color }: WorkerControlProps) {
  const colors = {
    amber: 'text-amber-400 border-amber-400/20 hover:bg-amber-400/5',
    blue: 'text-blue-400 border-blue-400/20 hover:bg-blue-400/5',
    emerald: 'text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/5',
    orange: 'text-orange-400 border-orange-400/20 hover:bg-orange-400/5',
    slate: 'text-slate-400 border-slate-400/20 hover:bg-slate-400/5'
  };

  return (
    <div className={`bg-black/60 backdrop-blur-md border rounded-xl p-2 flex flex-col items-center gap-1 ${colors[color]}`}>
      <div className="p-1.5 rounded-lg bg-white/5">
        {React.cloneElement(icon, { className: 'w-4 h-4' })}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">{label}</span>
        <span className="text-lg font-black font-mono">{count}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onAdjust(-1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
          aria-label="Decrease"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAdjust(1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
          aria-label="Increase"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
