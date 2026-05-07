import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface WorkerControlProps {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  count: number;
  onAdjust: (delta: number) => void;
  color: 'amber' | 'blue' | 'emerald';
}

export function WorkerControl({ icon, label, count, onAdjust, color }: WorkerControlProps) {
  const colors = {
    amber: 'text-amber-400 border-amber-400/20 hover:bg-amber-400/5',
    blue: 'text-blue-400 border-blue-400/20 hover:bg-blue-400/5',
    emerald: 'text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/5'
  };

  return (
    <div className={`bg-black/60 backdrop-blur-md border rounded-2xl p-3 flex flex-col items-center gap-3 ${colors[color]}`}>
      <div className="p-2 rounded-lg bg-white/5">
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</span>
        <span className="text-xl font-black font-mono">{count}</span>
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onAdjust(1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
          aria-label="Increase"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAdjust(-1)}
          className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
          aria-label="Decrease"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
