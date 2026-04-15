import React from 'react';

interface LogoProps {
  className?: string;
  showSubtext?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "", showSubtext = true }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Icon */}
      <div className="relative flex-shrink-0 w-10 h-10 bg-[#0B3C5D] rounded-xl flex items-center justify-center shadow-lg shadow-[#0b3c5d]/20 overflow-hidden">
        {/* Gauge Arc */}
        <svg viewBox="0 0 100 100" className="absolute inset-2 w-full h-full transform -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#2EC4B6"
            strokeWidth="12"
            strokeDasharray="188 251"
            className="opacity-90"
          />
          {/* White Dot at the end of arc */}
          <circle
            cx="50"
            cy="10"
            r="5"
            fill="white"
            transform="rotate(270 50 50)"
          />
        </svg>
        
        {/* Center F */}
        <span className="relative z-10 text-white font-black text-lg select-none">F</span>
      </div>

      {/* Logo Text */}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline font-black tracking-widest text-[22px]">
          <span className="text-[#0B3C5D]">FIN</span>
          <span className="text-[#2EC4B6]">RATE</span>
        </div>
        {showSubtext && (
          <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-[0.15em] mt-0.5">
            Bankadan Önce Finrate
          </span>
        )}
      </div>
    </div>
  );
};
