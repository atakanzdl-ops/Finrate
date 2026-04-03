'use client'

import React, { useEffect, useState } from 'react';
import { 
  Building2, LayoutDashboard, Database, PieChart, 
  Settings, LogOut, ChevronRight, Search, Bell, User 
} from 'lucide-react';
import clsx from 'clsx';

export default function AlternativeLayout({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState('ana-panel');

  const menuItems = [
    { id: 'ana-panel', label: 'Ana Panel', icon: LayoutDashboard },
    { id: 'sirketler', label: 'Şirketler', icon: Building2 },
    { id: 'gruplar', label: 'Gruplar', icon: Database },
    { id: 'analizler', label: 'Analizler', icon: PieChart },
    { id: 'ayarlar', label: 'Ayarlar', icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden text-white font-display">
      {/* ─── Premium Mesh Aura Background ─── */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-20 blur-[120px] bg-[#2dd4bf]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-10 blur-[120px] bg-[#0ea5e9]"></div>
        <div className="absolute inset-0 bg-[#0a1727]/95"></div>
        <div className="absolute inset-0 bg-[url('/grain.png')] opacity-[0.03] mix-blend-overlay"></div>
      </div>

      {/* ─── SIDEBAR (Left Menu) ─── */}
      <aside className="w-64 flex flex-col border-r border-white/5 bg-black/10 backdrop-blur-3xl z-40">
        <div className="p-8 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
             <span className="text-2xl font-black text-white">F</span>
          </div>
          <span className="text-xl font-bold tracking-tight">Finrate</span>
        </div>

        <nav className="flex-1 px-4 mt-8 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
                activeTab === item.id 
                  ? "bg-white/10 text-cyan-400 border border-white/5 shadow-inner" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} className={clsx("transition-transform", activeTab === item.id ? "scale-110" : "group-hover:scale-110")} />
                <span className="text-sm font-bold">{item.label}</span>
              </div>
              {activeTab === item.id && <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-glow animate-pulse"></div>}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-white/5 mt-auto">
          <button className="flex items-center gap-3 w-full p-3 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
            <LogOut size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header Section */}
        <header className="h-20 px-8 flex items-center justify-between border-b border-white/5 bg-white/2 overflow-hidden">
          <div className="flex items-center gap-8 min-w-0">
             <h2 className="text-lg font-bold truncate leading-none capitalize">{activeTab.replace('-', ' ')}</h2>
             <div className="relative group hidden lg:block">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Şirket, vergi no, grup ara..." 
                  className="bg-white/5 border border-white/5 rounded-xl px-10 py-2 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                />
             </div>
          </div>
          <div className="flex items-center gap-4">
             <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                <Bell size={18} className="text-slate-400" />
             </button>
             <div className="w-[1px] h-6 bg-white/10 mx-2"></div>
             <div className="flex items-center gap-3 p-1 pl-3 rounded-xl bg-white/5 border border-white/5">
                <div className="text-right">
                   <p className="text-[10px] font-black leading-none">AÖ</p>
                   <p className="text-[8px] text-slate-500 uppercase tracking-widest mt-1">Yönetici</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                   <User size={14} className="text-slate-400" />
                </div>
             </div>
          </div>
        </header>

        {/* Content Scrolling Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 pt-8 scroll-smooth">
           {children}
        </div>
      </main>

      <style jsx global>{`
        .shadow-glow { box-shadow: 0 0 10px rgba(45, 212, 191, 0.5); }
        .font-display { font-family: 'Outfit', 'Inter', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
}
