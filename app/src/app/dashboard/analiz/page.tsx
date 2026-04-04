'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Building2, Filter, Download, MousePointer2, Loader2
} from 'lucide-react'
import clsx from 'clsx'
import DashboardShell from '@/components/layout/DashboardShell'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'
import SubjectiveForm from '@/components/analysis/SubjectiveForm'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'

/* ─── Types ───────────────────────────────────── */

interface FinData {
  revenue: number | null; cogs: number | null; grossProfit: number | null
  ebit: number | null; ebitda: number | null; netProfit: number | null
  totalAssets: number | null; totalEquity: number | null
  totalCurrentAssets: number | null; totalCurrentLiabilities: number | null
}

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
  entity?: { id: string; name: string; sector?: string | null }
  financialData?: FinData
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
  const offset = circumference - (score / 100) * circumference

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
          <span className="text-[10px] font-bold text-[#3d5a80] tracking-widest mt-0.5">/ 100</span>
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
  const searchParams = useSearchParams()
  const entityId = searchParams.get('entityId')

  useEffect(() => {
    fetch('/api/analyses')
      .then(r => r.json())
      .then(d => {
        const list: Analysis[] = d.analyses ?? []
        setAnalyses(list)
        // entityId varsa o entity'nin ilk analizini seç, yoksa genel ilki
        const initial = entityId
          ? (list.find(a => a.entity?.id === entityId) ?? list[0] ?? null)
          : (list[0] ?? null)
        setSelected(initial)
      })
      .finally(() => setLoading(false))
  }, [entityId])

  if (loading) return (
    <DashboardShell>
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
      </div>
    </DashboardShell>
  )

  if (analyses.length === 0) return (
    <DashboardShell>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-white">Analizler</h1>
        <div className="glass-card rounded-xl p-10 text-center">
          <p className="text-white/40 text-sm">Henüz analiz yok. Bir şirkete finansal veri girerek başlayın.</p>
        </div>
      </div>
    </DashboardShell>
  )

  function fmtN(v: number | null | undefined, dec = 2) {
    if (v == null) return '—'
    return v.toFixed(dec)
  }
  function fmtTL(v: number | null | undefined) {
    if (v == null) return '—'
    if (Math.abs(v) >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000)    return `₺${(v / 1_000).toFixed(0)}K`
    return `₺${v.toFixed(0)}`
  }
  function fmtPct(v: number | null | undefined) {
    if (v == null) return '—'
    return `%${(v * 100).toFixed(1)}`
  }

  const bm = getSectorBenchmark(selected?.entity?.sector)
  const ratioRows = selected ? [
    // Likidite
    { id: "Cari Oran",                val: fmtN(selected.ratios?.currentRatio),    avg: fmtN(bm.currentRatio),            st: selected.ratios?.currentRatio != null && selected.ratios.currentRatio >= bm.currentRatio * 0.85 ? "İyi" : "Zayıf",          c: selected.ratios?.currentRatio != null && selected.ratios.currentRatio >= bm.currentRatio * 0.85 ? "status-good" : "status-bad" },
    { id: "Likidite Oranı (Hızlı)",   val: fmtN(selected.ratios?.quickRatio),      avg: fmtN(bm.quickRatio),              st: selected.ratios?.quickRatio != null && selected.ratios.quickRatio >= bm.quickRatio * 0.85 ? "Yeterli" : "Zayıf",            c: selected.ratios?.quickRatio != null && selected.ratios.quickRatio >= bm.quickRatio * 0.85 ? "status-good" : "status-bad" },
    // Karlılık
    { id: "Brüt Kar Marjı",           val: fmtPct(selected.ratios?.grossMargin),   avg: fmtPct(bm.grossMargin),           st: selected.ratios?.grossMargin != null && selected.ratios.grossMargin >= bm.grossMargin * 0.8 ? "İyi" : "Zayıf",              c: selected.ratios?.grossMargin != null && selected.ratios.grossMargin >= bm.grossMargin * 0.8 ? "status-good" : "status-warn" },
    { id: "FAVÖK Marjı",              val: fmtPct(selected.ratios?.ebitdaMargin),   avg: fmtPct(bm.ebitdaMargin),          st: selected.ratios?.ebitdaMargin != null && selected.ratios.ebitdaMargin >= bm.ebitdaMargin * 0.8 ? "İyi" : "Zayıf",           c: selected.ratios?.ebitdaMargin != null && selected.ratios.ebitdaMargin >= bm.ebitdaMargin * 0.8 ? "status-good" : "status-warn" },
    { id: "Net Kar Marjı",            val: fmtPct(selected.ratios?.netProfitMargin),avg: fmtPct(bm.netProfitMargin),       st: selected.ratios?.netProfitMargin != null && selected.ratios.netProfitMargin >= bm.netProfitMargin * 0.8 ? "Yeterli" : "Zayıf",c: selected.ratios?.netProfitMargin != null && selected.ratios.netProfitMargin >= bm.netProfitMargin * 0.8 ? "status-good" : "status-bad" },
    { id: "Öz Kaynak Karlılığı (ROE)",val: fmtPct(selected.ratios?.roe),            avg: fmtPct(bm.roe),                   st: selected.ratios?.roe != null && selected.ratios.roe >= bm.roe * 0.8 ? "İyi" : "Zayıf",                                      c: selected.ratios?.roe != null && selected.ratios.roe >= bm.roe * 0.8 ? "status-good" : "status-warn" },
    { id: "Aktif Karlılığı (ROA)",    val: fmtPct(selected.ratios?.roa),            avg: fmtPct(bm.roa),                   st: selected.ratios?.roa != null && selected.ratios.roa >= bm.roa * 0.8 ? "İyi" : "Zayıf",                                      c: selected.ratios?.roa != null && selected.ratios.roa >= bm.roa * 0.8 ? "status-good" : "status-warn" },
    // Kaldıraç
    { id: "Borç / Özkaynak",          val: fmtN(selected.ratios?.debtToEquity),     avg: fmtN(bm.debtToEquity),            st: selected.ratios?.debtToEquity != null && selected.ratios.debtToEquity <= bm.debtToEquity * 1.2 ? "İyi" : "Riskli",          c: selected.ratios?.debtToEquity != null && selected.ratios.debtToEquity <= bm.debtToEquity * 1.2 ? "status-great" : "status-bad" },
    { id: "Borç / Aktif",             val: fmtN(selected.ratios?.debtToAssets),     avg: fmtN(bm.debtToAssets),            st: selected.ratios?.debtToAssets != null && selected.ratios.debtToAssets <= bm.debtToAssets * 1.2 ? "İyi" : "Riskli",          c: selected.ratios?.debtToAssets != null && selected.ratios.debtToAssets <= bm.debtToAssets * 1.2 ? "status-great" : "status-bad" },
    { id: "Net Borç / FAVÖK",         val: selected.ratios?.debtToEbitda != null ? fmtN(selected.ratios.debtToEbitda, 1) + "x" : "—", avg: "2.5x", st: selected.ratios?.debtToEbitda != null && selected.ratios.debtToEbitda <= 3 ? "Makul" : "Yüksek",   c: selected.ratios?.debtToEbitda != null && selected.ratios.debtToEbitda <= 3 ? "status-warn" : "status-bad" },
    { id: "Faiz Karşılama",           val: selected.ratios?.interestCoverage != null ? fmtN(selected.ratios.interestCoverage, 1) + "x" : "—", avg: fmtN(bm.interestCoverage, 1) + "x", st: selected.ratios?.interestCoverage != null && selected.ratios.interestCoverage >= bm.interestCoverage * 0.8 ? "İyi" : "Zayıf", c: selected.ratios?.interestCoverage != null && selected.ratios.interestCoverage >= bm.interestCoverage * 0.8 ? "status-good" : "status-bad" },
    // Faaliyet
    { id: "Aktif Devir Hızı",         val: fmtN(selected.ratios?.assetTurnover),    avg: fmtN(bm.assetTurnover),           st: selected.ratios?.assetTurnover != null && selected.ratios.assetTurnover >= bm.assetTurnover * 0.8 ? "İyi" : "Düşük",        c: selected.ratios?.assetTurnover != null && selected.ratios.assetTurnover >= bm.assetTurnover * 0.8 ? "status-good" : "status-warn" },
  ] : []

  // KPI kartları için
  const fd = selected?.financialData

  return (
    <DashboardShell>
    <div className="space-y-6 max-w-[1440px] mx-auto">

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
          <div className="lg:col-span-9 space-y-6">

            {/* KPI Kartları */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "FİNRATE SKORU", value: `${Math.round(selected.finalScore)} / 100`, sub: selected.finalRating, color: "#2dd4bf" },
                { label: "AKTİF TOPLAM",  value: fmtTL(fd?.totalAssets), sub: fd?.totalCurrentAssets != null ? `Dönen: ${fmtTL(fd.totalCurrentAssets)}` : undefined, color: "#0ea5e9" },
                { label: "CARİ ORAN",     value: fmtN(selected.ratios?.currentRatio), sub: `Sektör ort: ${fmtN(bm.currentRatio)}`, color: "#2dd4bf" },
                { label: "BORÇ / ÖZKAYNAK", value: fmtN(selected.ratios?.debtToEquity), sub: `Sektör ort: ${fmtN(bm.debtToEquity)}`, color: selected.ratios?.debtToEquity != null && selected.ratios.debtToEquity > bm.debtToEquity * 1.5 ? "#f87171" : "#2dd4bf" },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white/72 backdrop-blur-[30px] border border-white/65 rounded-[20px] p-5 relative overflow-hidden shadow-[0_8px_32px_rgba(10,30,60,0.08)]" style={{ boxShadow: '0 8px 32px rgba(10, 30, 60, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)' }}>
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-[#3d5a80] mb-2">{kpi.label}</div>
                  <div className="text-2xl font-black text-[#0a1727] font-display tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>{kpi.value}</div>
                  {kpi.sub && <div className="text-[10px] font-bold mt-1" style={{ color: kpi.color }}>{kpi.sub}</div>}
                </div>
              ))}
            </div>

            {/* Skor + Kategoriler */}
            <div className="space-y-8">

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

            {/* WhatIf Simülatör */}
            <div>
              <div className="mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Senaryo Simülatörü</h3>
              </div>
              <WhatIfSimulator
                baseData={selected.ratios ?? {}}
                baseScore={selected.finalScore}
                rawFinancialData={selected.financialData as Record<string, number | null> | undefined}
              />
            </div>

            {/* Subjektif Değerlendirme */}
            {selected.entity?.id && (
              <div>
                <div className="mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Subjektif Değerlendirme</h3>
                </div>
                <SubjectiveForm entityId={selected.entity.id} />
              </div>
            )}

            </div>
          </div>
        )}
      </div>
    </div>
    </DashboardShell>
  )
}
