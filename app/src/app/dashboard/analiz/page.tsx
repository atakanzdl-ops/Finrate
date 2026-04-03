'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Building2, Filter, Download, MousePointer2, Loader2
} from 'lucide-react'
import clsx from 'clsx'

/* ─── Types ───────────────────────────────────── */

interface Analysis {
  id: string
  year: number
  period: string
  finalScore: number
  finalRating: string
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
  ratios: Record<string, number | null>
  entity?: { id: string; name: string }
}

const RATING_LABEL: Record<string, string> = {
  'AAA': 'Mükemmel Kredi Notu',   'AA+': 'Çok Yüksek Kredi Notu', 'AA': 'Yüksek Kredi Notu',
  'AA-': 'Yüksek Kredi Notu',     'A+': 'İyi Kredi Notu',          'A': 'İyi Kredi Notu',
  'A-': 'İyi Kredi Notu',         'BBB': 'Yeterli Kredi Notu',     'BB': 'Spekülatif',
  'B': 'Riskli',                   'CCC': 'Çok Riskli',             'D': 'Temerrüt',
}

/* ─── Components ──────────────────────────────── */

function CircularScore({ score, rating }: { score: number; rating: string }) {
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 1000) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48 mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r={radius} fill="none"
            stroke="url(#scoreGradAnaliz)" strokeWidth="6" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="scoreGradAnaliz" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black text-[#0a1727] tracking-tighter" style={{ fontFamily: 'Outfit, sans-serif' }}>{Math.round(score)}</span>
          <span className="text-[10px] font-bold text-[#3d5a80] tracking-widest mt-0.5">/ 1000</span>
          <span className="text-[9px] font-black text-[#8da4bf] tracking-[0.2em] mt-1 uppercase">FİNRATE SKORU</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-black font-display italic tracking-tight leading-none mb-2" style={{ color: '#14b8a6', fontFamily: 'Outfit, sans-serif' }}>{rating}</div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {RATING_LABEL[rating] ?? 'Kredi Notu'}
        </div>
      </div>
    </div>
  )
}

function KPIBox({ label, value, change, isPositive = true }: { label: string; value: string; change: string; isPositive?: boolean }) {
  return (
    <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] p-6 relative overflow-hidden group shadow-[0_8px_32px_rgba(10,30,60,0.12)] shadow-inner-highlight">
      <style jsx>{`
        .shadow-inner-highlight {
          box-shadow: 0 8px 32px rgba(10, 30, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }
      `}</style>
      <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-cyan-500/10 transition-all"></div>
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#3d5a80]">{label}</span>
        <span className={clsx("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
          isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")}>
          {change}
        </span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-black text-[#0a1727] font-display tracking-tight">{value}</span>
        <div className="h-8 w-20 opacity-40">
          <svg viewBox="0 0 80 30" preserveAspectRatio="none" className="w-full h-full">
            <polyline points="0,20 20,10 40,25 60,5 80,15" fill="none" stroke={isPositive ? "#2dd4bf" : "#f87171"} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ───────────────────────────────── */

export default function AnalizPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [selected, setSelected]  = useState<Analysis | null>(null)
  const [loading, setLoading]    = useState(true)

  useEffect(() => {
    fetch('/api/analyses')
      .then(r => r.json())
      .then(d => {
        const list: Analysis[] = d.analyses ?? []
        setAnalyses(list)
        setSelected(list[0] ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 size={24} className="animate-spin text-cyan-400" />
    </div>
  )

  if (analyses.length === 0) return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">Analizler</h1>
      <div className="glass-card rounded-xl p-10 text-center">
        <p className="text-white/40 text-sm">Henüz analiz yok. Bir şirkete finansal veri girerek başlayın.</p>
      </div>
    </div>
  )

  const ratioRows = selected ? [
    { id: "Cari Oran",        val: selected.ratios?.currentRatio?.toFixed(2) ?? "—",    avg: "1.42", st: "İyi",    c: "status-good" },
    { id: "Likidite Oranı",   val: selected.ratios?.quickRatio?.toFixed(2) ?? "—",      avg: "0.95", st: "Yeterli", c: "status-good" },
    { id: "Borç / Özkaynak",  val: selected.ratios?.debtToEquity?.toFixed(2) ?? "—",    avg: "0.95", st: "İyi",    c: "status-great" },
    { id: "Net Borç / FAVÖK", val: selected.ratios?.netDebtToEbitda?.toFixed(1) + "x" ?? "—", avg: "2.5x", st: "Makul", c: "status-warn" },
  ] : []

  return (
    <div className="p-8 space-y-6 max-w-[1440px] mx-auto min-h-screen">

      {/* Üst Bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-black text-white tracking-tight font-display">Analizler</h1>
        <div className="flex gap-3">
          <div className="relative group">
            <Filter className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Şirket, Dönem Ara..."
              className="h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white w-64 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder-slate-500"
            />
          </div>
          <button className="h-10 px-6 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 hover:bg-black transition-all shadow-lg border border-white/10">
            <Download size={14} /> Rapor Oluştur
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Sol: Şirket Listesi */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] p-6 shadow-[0_8px_32px_rgba(10,30,60,0.08)]" style={{ boxShadow: '0 8px 32px rgba(10, 30, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#3d5a80] mb-6">Aktif Analizler</p>
            <div className="space-y-3">
              {analyses.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={clsx(
                    "w-full flex items-center justify-between p-4 rounded-xl transition-all border",
                    selected?.id === a.id
                      ? "bg-white/40 border-cyan-400/50 text-[#0a1727] shadow-lg shadow-cyan-500/10"
                      : "bg-white/20 border-white/10 hover:bg-white/30 text-[#3d5a80]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center border transition-colors",
                      selected?.id === a.id ? "bg-cyan-500/20 border-cyan-400/30" : "bg-white/5 border-white/5")}>
                      <Building2 size={16} className={selected?.id === a.id ? "text-cyan-400" : "text-slate-500"} />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold leading-none mb-1.5 truncate max-w-[100px]">
                        {a.entity?.name ?? 'Şirket'}
                      </p>
                      <p className={clsx("text-[9px] font-bold uppercase tracking-wider",
                        selected?.id === a.id ? "text-cyan-400" : "text-slate-500")}>
                        {a.year} · {a.period}
                      </p>
                    </div>
                  </div>
                  <span className={clsx("text-xs font-black", selected?.id === a.id ? "text-[#0a1727]" : "text-[#3d5a80]")}>
                    {Math.round(a.finalScore)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ: Detay */}
        {selected && (
          <div className="lg:col-span-9 space-y-8">

            {/* Skor Kartı - 1:1 Prestige Glass */}
            <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] p-12 shadow-[0_8px_32px_rgba(10,30,60,0.08)] grid grid-cols-1 md:grid-cols-2 gap-12 items-center relative" style={{ boxShadow: '0 8px 32px rgba(10, 30, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)' }}>
              <div className="flex flex-col items-center border-r border-black/5 pr-12">
                <CircularScore score={selected.finalScore} rating={selected.finalRating} />
              </div>

              <div className="space-y-8">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[#3d5a80] mb-6">Teminat Koşulu Değerlemesi</h3>
                  <div className="flex items-center justify-between mb-3 text-[#0a1727]">
                    <span className="text-xs font-bold uppercase tracking-wider">Borç Ödeme Gücü Endeksi</span>
                    <span className="text-xl font-black text-emerald-400 font-display">
                      {selected.ratios?.debtServiceCoverage?.toFixed(1) ?? '—'}x
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((selected.leverageScore), 100)}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {[
                    { label: "Likidite Skoru",  value: Math.round(selected.liquidityScore),      color: "#2dd4bf" },
                    { label: "Kârlılık Skoru",  value: Math.round(selected.profitabilityScore),  color: "#0ea5e9" },
                    { label: "Kaldıraç Skoru",  value: Math.round(selected.leverageScore),       color: "#6366f1" },
                    { label: "Faaliyet Skoru",  value: Math.round(selected.activityScore),       color: "#f59e0b" },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col gap-2">
                      <div className="flex justify-between text-[11px] font-bold px-1">
                        <span className="text-[#3d5a80]">{item.label}</span>
                        <span className="text-[#0a1727]">{item.value} / 100</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          className="h-full rounded-full"
                          style={{ background: item.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Oran Tablosu - 1:1 Prestige Glass */}
            <div className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] shadow-[0_8px_32px_rgba(10,30,60,0.08)] overflow-hidden relative" style={{ boxShadow: '0 8px 32px rgba(10, 30, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)' }}>
              <div className="p-8 border-b border-black/5 bg-white/20 flex justify-between items-center">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">Finansal Oran Analizi</h4>
                  <p className="text-[9px] font-bold text-[#8da4bf] mt-1 uppercase tracking-widest">Rapor tarihi itibariyle güncel veriler</p>
                </div>
                <MousePointer2 size={16} className="text-slate-500" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-black/20">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Gösterge</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Dönem Değeri</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Sektör Ort.</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {ratioRows.map((row) => (
                      <tr key={row.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-8 py-5 text-xs font-bold text-[#3d5a80] flex items-center gap-4">
                          <div className="w-2 h-2 rounded-full bg-cyan-500 group-hover:scale-125 transition-transform" />
                          {row.id}
                        </td>
                        <td className="px-8 py-5 text-xs font-black text-[#0a1727] text-right font-display">{row.val}</td>
                        <td className="px-8 py-5 text-xs font-bold text-[#8da4bf] text-right font-display">{row.avg}</td>
                        <td className="px-8 py-5 text-center">
                          <span className={clsx("status-chip font-black uppercase tracking-widest !text-[9px] px-3 py-1", row.c)}>
                            {row.st}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
