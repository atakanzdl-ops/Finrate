'use client'

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Building2, TrendingUp, ChevronRight, CheckCircle2, 
  AlertTriangle, FileText, ArrowUpRight 
} from 'lucide-react';

export default function AlternativeDashboardPage() {
  
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* ─── PAGE HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-sm font-display">
            Finansal Genel Bakış
          </h1>
          <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">
            Son güncelleme: 3 Nisan 2026 · Dönem: 2025/Q4
          </p>
        </div>
        <div className="flex items-center gap-3">
           <button className="px-6 py-3 rounded-xl bg-white/5 border border-white/5 text-xs font-bold hover:bg-white/10 transition-all flex items-center gap-2">
              <FileText size={14} /> Rapor İndir
           </button>
           <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-black shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all flex items-center gap-2">
              <span>+</span> Yeni Analiz
           </button>
        </div>
      </div>

      {/* ─── TOP KPI GRID ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'FİNRATE SKORU', val: '742', sub: 'Yüksek Kredi Notu', change: '+12 puan', pos: true, type: 'score' },
          { label: 'AKTİF TOPLAM', val: '₺14.8M', sub: 'Önceki dönem: ₺12.5M', change: '+18.2%', pos: true, type: 'chart' },
          { label: 'CARİ ORAN', val: '1.85', sub: 'Sektör ort: 1.42', change: '+0.3', pos: true, type: 'ratio' },
          { label: 'BORÇ / ÖZKAYNAK', val: '0.62', sub: 'Sektör ort: 0.95', change: '-0.15', pos: false, type: 'ratio' },
        ].map((kpi, i) => (
          <div key={i} className="glass-card group p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-cyan-500/10 transition-all"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-black tracking-widest text-slate-500">{kpi.label}</span>
              <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full", kpi.pos ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                {kpi.change}
              </span>
            </div>
            <div className="flex items-center gap-4">
               <span className="text-3xl font-black text-white font-display tracking-tight">{kpi.val}</span>
               {kpi.type === 'score' && <span className="text-sm font-bold text-cyan-400">AA+</span>}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase tracking-widest">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ─── MAIN CHARTS AREA ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Bar Chart (8 Col) */}
        <div className="lg:col-span-8 glass-card p-10">
           <div className="flex items-center justify-between mb-12">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Gelir & Performans Analizi</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">4 Dönemlik mukayeseli trend</p>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-cyan-500 shadow-glow"></div> Gelir</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-800"></div> Kâr</div>
              </div>
           </div>

           <div className="h-[320px] w-full relative flex items-end justify-between px-10">
              <svg className="absolute inset-x-0 bottom-10 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
                 <motion.path 
                   initial={{ pathLength: 0, opacity: 0 }}
                   animate={{ pathLength: 1, opacity: 0.3 }}
                   transition={{ duration: 1.5, delay: 0.5 }}
                   d="M 5,80 Q 20,70 35,65 T 65,45 T 95,20" 
                   fill="none" 
                   stroke="#2dd4bf" 
                   strokeWidth="2"
                 />
              </svg>
              
              {[45, 55, 68, 88].map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-4 group">
                  <div className="flex gap-2">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                      className="w-10 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-lg relative shadow-lg shadow-cyan-500/10"
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg"></div>
                    </motion.div>
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${h * 0.7}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 + 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="w-10 bg-blue-900/60 rounded-t-lg"
                    ></motion.div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 tracking-widest">{2022 + i}/Q4</span>
                </div>
              ))}
           </div>
        </div>

        {/* Right: Score Breakdown (4 Col) */}
        <div className="lg:col-span-4 glass-card p-10 flex flex-col items-center justify-center text-center">
           <div className="relative w-48 h-48 mb-8">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                <motion.circle 
                  cx="50" cy="50" r="45" fill="none" 
                  stroke="url(#scoreGradAlt)" strokeWidth="6" strokeDasharray="283" 
                  initial={{ strokeDashoffset: 283 }}
                  animate={{ strokeDashoffset: 283 - (283 * 0.742) }}
                  transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="scoreGradAlt" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="100%" stopColor="#0ea5e9" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white font-display tracking-tighter">742</span>
                <span className="text-[10px] font-black text-slate-500 tracking-[0.2em] mt-1 uppercase">FİNRATE SKORU</span>
              </div>
           </div>
           <h4 className="text-2xl font-black text-cyan-400 font-display italic">AA+</h4>
           <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-widest">Yüksek Kredi Notu</p>
           
           <div className="w-full mt-10 space-y-4">
              {['Likidite', 'Kârlılık', 'Kaldıraç', 'Faaliyet'].map((label, i) => (
                <div key={i} className="flex flex-col gap-2">
                   <div className="flex justify-between text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                      <span>{label}</span>
                      <span>%{65 + i * 8}</span>
                   </div>
                   <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${65 + i * 8}%` }}
                        transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                        className="h-full bg-cyan-500 shadow-glow"
                      />
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>

      <style jsx global>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .glass-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(45, 212, 191, 0.2);
          transform: translateY(-2px);
        }
        .shadow-glow { box-shadow: 0 0 10px rgba(45, 212, 191, 0.5); }
      `}</style>

    </div>
  );
}
