import React from 'react';
import { motion } from 'motion/react';

interface ResourceCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  siteValue?: string | number;
  progress: number;
  color: 'amber' | 'blue' | 'emerald' | 'orange' | 'slate';
  isPercent?: boolean;
}

export function ResourceCard({ icon, label, value, siteValue, progress, color, isPercent = false }: ResourceCardProps) {
  const colors: Record<string, string> = {
    amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    emerald: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    orange: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    slate: 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  };

  const barColors: Record<string, string> = {
    amber: 'bg-amber-400',
    blue: 'bg-blue-400',
    emerald: 'bg-emerald-400',
    orange: 'bg-orange-400',
    slate: 'bg-slate-400'
  };

  return (
    <div className={`min-w-[100px] rounded-xl border p-2 backdrop-blur-md ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <div className="flex justify-between items-end mb-1">
        <div className="text-xl font-black font-mono leading-none">
          {value}{isPercent && '%'}
        </div>
        {siteValue !== undefined && (
          <div className="text-[10px] opacity-70">
            工地: {siteValue}
          </div>
        )}
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${barColors[color]}`}
          animate={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
