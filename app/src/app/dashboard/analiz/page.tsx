'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Filter, Download, Loader2,
  LayoutDashboard, BarChart3, Sliders, Star, TrendingUp,
  ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import DashboardShell from '@/components/layout/DashboardShell'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'
import SubjectiveForm from '@/components/analysis/SubjectiveForm'
import OptimizationPanel from '@/components/analysis/OptimizationPanel'
import TrendChart from '@/components/analysis/TrendChart'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'
import type { RatioResult } from '@/lib/scoring/ratios'
import { combineScores } from '@/lib/scoring/subjective'

/* ─── Types ─────────────────────────────────────── */

interface FinData {
  revenue: number | null; cogs: number | null; grossProfit: number | null
  ebit: number | null; ebitda: number | null; netProfit: number | null
  totalAssets: number | null; totalEquity: number | null
  totalCurrentAssets: number | null; totalCurrentLiabilities: number | null
}

interface Analysis {
  id: string; year: number; period: string
  finalScore: number; finalRating: string
  liquidityScore: number; profitabilityScore: number
  leverageScore: number; activityScore: number
  ratios: Record<string, number | null>
  entity?: { id: string; name: string; sector?: string | null }
  financialData?: FinData
}

type TabId = 'overview' | 'ratios' | 'scenario' | 'subjective' | 'trend'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',   label: 'Genel Bakış',   icon: <LayoutDashboard size={14} /> },
  { id: 'ratios',     label: 'Rasyolar',       icon: <BarChart3       size={14} /> },
  { id: 'scenario',   label: 'Senaryo',        icon: <Sliders         size={14} /> },
  { id: 'subjective', label: 'Subjektif',      icon: <Star            size={14} /> },
  { id: 'trend',      label: 'Trend',          icon: <TrendingUp      size={14} /> },
]

const RATING_LABEL: Record<string, string> = {
  AAA: 'Mükemmel', AA: 'Yüksek', A: 'İyi', BBB: 'Yeterli',
  BB: 'Spekülatif', B: 'Riskli', CCC: 'Çok Riskli', CC: 'Çok Riskli', C: 'Kritik', D: 'Temerrüt',
}

const RATING_COLOR: Record<string, string> = {
  AAA: '#10b981', AA: '#10b981', A: '#34d399',
  BBB: '#a3e635', BB: '#facc15', B: '#fb923c',
  CCC: '#f97316', CC: '#f87171', C: '#ef4444', D: '#dc2626',
}

const GLASS = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(20px) saturate(160%)',
  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.65)',
  boxShadow: '0 8px 32px rgba(10,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
} as React.CSSProperties

/* ─── CircularScore ──────────────────────────────── */
function CircularScore({ score, rating }: { score: number; rating: string }) {
  const r = 45, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = RATING_COLOR[rating] ?? '#2dd4bf'
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-44 mb-5">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="6" />
          <motion.circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-[#0a1727]" style={{ fontFamily: 'Outfit,sans-serif' }}>
            {Math.round(score)}
          </span>
          <span className="text-[9px] font-bold text-[#8da4bf] tracking-widest">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-black italic" style={{ color, fontFamily: 'Outfit,sans-serif' }}>{rating}</div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
          {RATING_LABEL[rating] ?? 'Kredi Notu'}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────── */
export default function AnalizPage() {
  const [analyses,        setAnalyses]        = useState<Analysis[]>([])
  const [selected,        setSelected]        = useState<Analysis | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [activeTab,       setActiveTab]       = useState<TabId>('overview')
  const [subjectiveScores, setSubjectiveScores] = useState<Record<string, number>>({})
  const [yearOpen,        setYearOpen]        = useState(false)
  const searchParams = useSearchParams()
  const entityId     = searchParams.get('entityId')
  const router       = useRouter()

  useEffect(() => {
    const recalcDone = sessionStorage.getItem('finrate_recalc_v2')
    const doLoad = () => {
      fetch('/api/analyses')
        .then(r => r.json())
        .then(d => {
          const list: Analysis[] = d.analyses ?? []
          setAnalyses(list)
          const initial = entityId
            ? (list.find(a => a.entity?.id === entityId) ?? list[0] ?? null)
            : (list[0] ?? null)
          setSelected(initial)
          const eids = [...new Set(list.map(a => a.entity?.id).filter(Boolean))] as string[]
          eids.forEach(eid => {
            fetch(`/api/entities/${eid}/subjective`)
              .then(r => r.ok ? r.json() : null)
              .then(d => {
                if (d?.score?.total != null)
                  setSubjectiveScores(prev => ({ ...prev, [eid]: d.score.total }))
              })
          })
        })
        .finally(() => setLoading(false))
    }
    if (!recalcDone) {
      fetch('/api/analyses/recalculate', { method: 'POST' })
        .catch(() => {})
        .finally(() => { sessionStorage.setItem('finrate_recalc_v2', '1'); doLoad() })
    } else { doLoad() }
  }, [entityId])

  function combinedScore(a: Analysis) {
    const subj = a.entity?.id ? (subjectiveScores[a.entity.id] ?? 0) : 0
    return combineScores(a.finalScore, subj)
  }
  function combinedRating(s: number) {
    if (s >= 92) return 'AAA'; if (s >= 84) return 'AA'; if (s >= 76) return 'A'
    if (s >= 68) return 'BBB'; if (s >= 60) return 'BB'; if (s >= 52) return 'B'
    if (s >= 44) return 'CCC'; if (s >= 36) return 'CC'; if (s >= 28) return 'C'
    return 'D'
  }

  const fmtN   = (v?: number | null, d = 2) => v == null ? '—' : v.toFixed(d)
  const fmtPct = (v?: number | null) => v == null ? '—' : `%${(v * 100).toFixed(1)}`
  const fmtTL  = (v?: number | null) => {
    if (v == null) return '—'
    if (Math.abs(v) >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000)    return `₺${(v / 1_000).toFixed(0)}K`
    return `₺${v.toFixed(0)}`
  }

  /* ─── Loading / Empty ─────────────────────────── */
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

  /* ─── Derived ─────────────────────────────────── */
  const bm  = getSectorBenchmark(selected?.entity?.sector)
  const fd  = selected?.financialData
  const cs  = selected ? combinedScore(selected) : 0
  const cr  = combinedRating(cs)

  // Aynı entity'nin tüm analizleri (yıl seçici için)
  const entityAnalyses = selected
    ? analyses.filter(a => a.entity?.id === selected.entity?.id)
        .sort((a, b) => b.year - a.year || a.period.localeCompare(b.period))
    : []

  // Unique entity'ler (sol panel için)
  const entityGroups = analyses.reduce<Record<string, Analysis[]>>((acc, a) => {
    const key = a.entity?.id ?? 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  /* ─── Rasyo Tablosu ───────────────────────────── */
  const r = selected?.ratios ?? {}
  const ratioSections = selected ? [
    {
      label: 'Likidite', color: '#2dd4bf',
      rows: [
        { id: 'Cari Oran',              val: fmtN(r.currentRatio),             avg: fmtN(bm.currentRatio),        good: r.currentRatio != null && r.currentRatio >= bm.currentRatio * 0.85 },
        { id: 'Asit-Test (Hızlı)',      val: fmtN(r.quickRatio),               avg: fmtN(bm.quickRatio),          good: r.quickRatio != null && r.quickRatio >= bm.quickRatio * 0.85 },
        { id: 'Nakit Oran',             val: fmtN(r.cashRatio),                avg: '—',                          good: r.cashRatio != null && r.cashRatio >= 0.10 },
        { id: 'Net Çal. Ser. / Aktif',  val: fmtN(r.netWorkingCapitalRatio),   avg: '—',                          good: r.netWorkingCapitalRatio != null && r.netWorkingCapitalRatio > 0 },
        { id: 'Nakit Dönüşüm Süresi',  val: r.cashConversionCycle != null ? fmtN(r.cashConversionCycle, 0) + ' gün' : '—', avg: '—', good: r.cashConversionCycle != null && r.cashConversionCycle < 60 },
      ]
    },
    {
      label: 'Karlılık', color: '#818cf8',
      rows: [
        { id: 'Brüt Kar Marjı',                   val: fmtPct(r.grossMargin),            avg: fmtPct(bm.grossMargin),       good: r.grossMargin != null && r.grossMargin >= bm.grossMargin * 0.8 },
        { id: 'FAVÖK Marjı',                       val: fmtPct(r.ebitdaMargin),           avg: fmtPct(bm.ebitdaMargin),      good: r.ebitdaMargin != null && r.ebitdaMargin >= bm.ebitdaMargin * 0.8 },
        { id: 'FVÖK Marjı (EBIT)',                 val: fmtPct(r.ebitMargin),             avg: '—',                          good: r.ebitMargin != null && r.ebitMargin >= 0.05 },
        { id: 'Net Kar Marjı',                     val: fmtPct(r.netProfitMargin),        avg: fmtPct(bm.netProfitMargin),   good: r.netProfitMargin != null && r.netProfitMargin >= bm.netProfitMargin * 0.8 },
        { id: 'Aktif Karlılığı (ROA)',             val: fmtPct(r.roa),                    avg: fmtPct(bm.roa),               good: r.roa != null && r.roa >= bm.roa * 0.8 },
        { id: 'Özkaynak Karlılığı (ROE)',          val: fmtPct(r.roe),                    avg: fmtPct(bm.roe),               good: r.roe != null && r.roe >= bm.roe * 0.8 },
        { id: 'Yatırım Getirisi (ROIC)',           val: fmtPct(r.roic),                   avg: '—',                          good: r.roic != null && r.roic >= 0.10 },
        { id: 'Nominal Gelir Büyümesi',            val: r.revenueGrowth != null ? fmtPct(r.revenueGrowth) : '—', avg: '—', good: r.revenueGrowth != null && r.revenueGrowth >= 0 },
        { id: 'Reel Büyüme (ÜFE Arındırılmış)',   val: r.realGrowth != null ? fmtPct(r.realGrowth) : '—', avg: '—', good: r.realGrowth != null && r.realGrowth >= 0 },
      ]
    },
    {
      label: 'Kaldıraç', color: '#fb923c',
      rows: [
        { id: 'Borç / Özkaynak',        val: fmtN(r.debtToEquity),             avg: fmtN(bm.debtToEquity),        good: r.debtToEquity != null && r.debtToEquity <= bm.debtToEquity * 1.2 },
        { id: 'Borç / Aktif',           val: fmtN(r.debtToAssets),             avg: fmtN(bm.debtToAssets),        good: r.debtToAssets != null && r.debtToAssets <= bm.debtToAssets * 1.2 },
        { id: 'Özkaynak Oranı',         val: fmtN(r.equityRatio),              avg: '—',                          good: r.equityRatio != null && r.equityRatio >= 0.30 },
        { id: 'KV Borç Oranı',          val: fmtN(r.shortTermDebtRatio),       avg: '—',                          good: r.shortTermDebtRatio != null && r.shortTermDebtRatio < 0.5 },
        { id: 'Net Borç / FAVÖK',       val: r.debtToEbitda != null ? fmtN(r.debtToEbitda, 1) + 'x' : '—', avg: '3.0x', good: r.debtToEbitda != null && r.debtToEbitda <= 3 },
        { id: 'Faiz Karşılama',         val: r.interestCoverage === Infinity ? '∞x (Faiz Yok)' : r.interestCoverage != null ? fmtN(r.interestCoverage, 1) + 'x' : '—', avg: fmtN(bm.interestCoverage, 1) + 'x', good: r.interestCoverage === Infinity || (r.interestCoverage != null && r.interestCoverage >= bm.interestCoverage * 0.8) },
      ]
    },
    {
      label: 'Faaliyet', color: '#fbbf24',
      rows: [
        { id: 'Aktif Devir Hızı',       val: fmtN(r.assetTurnover),            avg: fmtN(bm.assetTurnover),       good: r.assetTurnover != null && r.assetTurnover >= bm.assetTurnover * 0.8 },
        { id: 'Sabit Aktif Devir',      val: fmtN(r.fixedAssetTurnover),       avg: '—',                          good: r.fixedAssetTurnover != null && r.fixedAssetTurnover >= 1.0 },
        { id: 'Stok Devir Süresi',      val: r.inventoryTurnoverDays != null ? fmtN(r.inventoryTurnoverDays, 0) + ' gün' : '—', avg: r.inventoryTurnoverDays != null ? fmtN(bm.inventoryDays, 0) + ' gün' : '—', good: r.inventoryTurnoverDays != null && r.inventoryTurnoverDays <= bm.inventoryDays * 1.2 },
        { id: 'Alacak Tahsil Süresi',   val: r.receivablesTurnoverDays != null ? fmtN(r.receivablesTurnoverDays, 0) + ' gün' : '—', avg: r.receivablesTurnoverDays != null ? fmtN(bm.receivablesDays, 0) + ' gün' : '—', good: r.receivablesTurnoverDays != null && r.receivablesTurnoverDays <= bm.receivablesDays * 1.2 },
        { id: 'Borç Ödeme Süresi',      val: r.payablesTurnoverDays != null ? fmtN(r.payablesTurnoverDays, 0) + ' gün' : '—', avg: '—', good: r.payablesTurnoverDays != null && r.payablesTurnoverDays >= 30 },
        { id: 'Faaliyet Gid. Oranı',    val: fmtN(r.operatingExpenseRatio),    avg: '—',                          good: r.operatingExpenseRatio != null && r.operatingExpenseRatio < 0.30 },
      ]
    },
  ] : []

  /* ─── Render ──────────────────────────────────── */
  return (
    <DashboardShell>
    <div className="space-y-5 max-w-[1440px] mx-auto">

      {/* ── Üst Bar ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: 'Outfit,sans-serif' }}>Analizler</h1>
        <div className="flex gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text" placeholder="Şirket, Dönem Ara..."
              className="h-10 pl-9 pr-4 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white w-56 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500"
            />
          </div>
          <button
            onClick={async () => {
              if (!selected) return
              await fetch(`/api/analyses/${selected.id}/report`, { method: 'POST' })
              router.push(`/dashboard/analiz/rapor?id=${selected.id}`)
            }}
            disabled={!selected}
            className="h-10 px-5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-2 hover:bg-black transition-all border border-white/10 disabled:opacity-40"
          >
            <Download size={14} /> Rapor Oluştur
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ── Sol: Şirket Listesi ─────────────── */}
        <div className="lg:col-span-3">
          <div style={GLASS} className="rounded-[20px] p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3d5a80] mb-4">Şirketler</p>
            <div className="space-y-2">
              {Object.entries(entityGroups).map(([, group]) => {
                const best = group[0] // en yeni (sorted desc by year)
                const isActive = selected?.entity?.id === best.entity?.id
                const score = Math.round(combinedScore(best))
                const rating = combinedRating(combinedScore(best))
                return (
                  <button
                    key={best.entity?.id}
                    onClick={() => setSelected(best)}
                    className={clsx(
                      "w-full p-3.5 rounded-xl border transition-all text-left",
                      isActive
                        ? "bg-white/40 border-cyan-400/40 shadow-lg shadow-cyan-500/10"
                        : "bg-white/15 border-white/10 hover:bg-white/25"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0",
                        isActive ? "bg-cyan-500/15 border-cyan-400/30" : "bg-white/5 border-white/5")}>
                        <Building2 size={14} className={isActive ? "text-cyan-400" : "text-slate-500"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={clsx("text-[11px] font-bold truncate", isActive ? "text-[#0a1727]" : "text-[#3d5a80]")}>
                          {best.entity?.name ?? 'Şirket'}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                          {group.length > 1 ? `${group.length} dönem` : `${best.year} · ${best.period}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-black" style={{ color: RATING_COLOR[rating] ?? '#8da4bf', fontFamily: 'Outfit,sans-serif' }}>
                          {score}
                        </div>
                        <div className="text-[9px] font-black" style={{ color: RATING_COLOR[rating] ?? '#8da4bf' }}>{rating}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Sağ: İçerik ─────────────────────── */}
        {selected && (
          <div className="lg:col-span-9 space-y-4">

            {/* Şirket başlığı + Yıl seçici */}
            <div style={GLASS} className="rounded-[20px] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">{selected.entity?.sector ?? 'Sektör belirtilmemiş'}</p>
                <h2 className="text-lg font-black text-[#0a1727] mt-0.5" style={{ fontFamily: 'Outfit,sans-serif' }}>
                  {selected.entity?.name ?? 'Şirket'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Sektör benchmark etiketi */}
                {selected.entity?.sector && (
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-600 border border-cyan-400/20">
                    {bm.label} · TCMB 2024
                  </span>
                )}
                {/* Yıl seçici */}
                {entityAnalyses.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setYearOpen(v => !v)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-black/10 bg-white/50 text-xs font-black text-[#0a1727] hover:bg-white/70 transition-all"
                    >
                      {selected.year} · {selected.period}
                      <ChevronDown size={12} className={clsx("transition-transform", yearOpen && "rotate-180")} />
                    </button>
                    {yearOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20 min-w-[140px]"
                        style={{ ...GLASS, padding: 0 }}
                      >
                        {entityAnalyses.map(a => (
                          <button
                            key={a.id}
                            onClick={() => { setSelected(a); setYearOpen(false) }}
                            className={clsx(
                              "w-full px-4 py-2.5 text-left text-xs font-bold hover:bg-cyan-500/10 transition-colors",
                              selected.id === a.id ? "text-cyan-600 bg-cyan-500/10" : "text-[#3d5a80]"
                            )}
                          >
                            {a.year} · {a.period}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Tab Bar ───────────────────────── */}
            <div style={GLASS} className="rounded-[20px] p-1.5 flex gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[14px] text-[11px] font-black transition-all",
                    activeTab === tab.id
                      ? "bg-white text-[#0a1727] shadow-md shadow-black/10"
                      : "text-[#8da4bf] hover:text-[#3d5a80]"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ── Tab İçerikleri ────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >

                {/* ── GENEL BAKIŞ ─────────────── */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {/* KPI Kartları */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                      {[
                        { label: "FİNRATE SKORU", value: `${Math.round(cs)} / 100`, sub: cr, color: RATING_COLOR[cr] ?? '#2dd4bf' },
                        { label: "AKTİF TOPLAM",  value: fmtTL(fd?.totalAssets),   sub: fd?.totalCurrentAssets != null ? `Dönen: ${fmtTL(fd.totalCurrentAssets)}` : '—', color: '#0ea5e9' },
                        { label: "CARİ ORAN",     value: fmtN(r.currentRatio),       sub: `Sektör: ${fmtN(bm.currentRatio)}`, color: '#2dd4bf' },
                        { label: "BORÇ/ÖZKAYNAK", value: fmtN(r.debtToEquity),       sub: `Sektör: ${fmtN(bm.debtToEquity)}`, color: r.debtToEquity != null && r.debtToEquity > bm.debtToEquity * 1.5 ? '#f87171' : '#2dd4bf' },
                      ].map(kpi => (
                        <div key={kpi.label} style={GLASS} className="rounded-[20px] p-5 relative overflow-hidden">
                          <div className="text-[9px] font-black uppercase tracking-[0.25em] text-[#3d5a80] mb-2">{kpi.label}</div>
                          <div className="text-2xl font-black text-[#0a1727]" style={{ fontFamily: 'Outfit,sans-serif' }}>{kpi.value}</div>
                          <div className="text-[10px] font-bold mt-1" style={{ color: kpi.color }}>{kpi.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Skor + Kategori Barları */}
                    <div style={GLASS} className="rounded-[20px] p-8 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                      <div className="flex flex-col items-center border-r border-black/5 pr-10">
                        <CircularScore score={cs} rating={cr} />
                      </div>
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3d5a80] mb-4">Finansal Güç Göstergesi</h3>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-[#3d5a80]">Faiz Karşılama</span>
                            <span className="text-lg font-black text-emerald-500" style={{ fontFamily: 'Outfit,sans-serif' }}>
                              {r.interestCoverage != null ? `${r.interestCoverage.toFixed(1)}x` : '—'}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(selected.leverageScore, 100)}%` }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          {[
                            { label: 'Likidite',  value: Math.round(selected.liquidityScore),     color: '#2dd4bf' },
                            { label: 'Karlılık',  value: Math.round(selected.profitabilityScore), color: '#818cf8' },
                            { label: 'Kaldıraç', value: Math.round(selected.leverageScore),      color: '#fb923c' },
                            { label: 'Faaliyet', value: Math.round(selected.activityScore),      color: '#fbbf24' },
                          ].map(item => (
                            <div key={item.label}>
                              <div className="flex justify-between text-[11px] font-bold mb-1.5">
                                <span className="text-[#3d5a80]">{item.label}</span>
                                <span className="text-[#0a1727]">{item.value} / 100</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
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
                  </div>
                )}

                {/* ── RASYOLAR ────────────────── */}
                {activeTab === 'ratios' && (
                  <div style={GLASS} className="rounded-[20px] overflow-hidden">
                    {/* Başlık */}
                    <div className="px-7 py-5 border-b border-black/5 flex items-center justify-between">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">Finansal Oran Analizi</h4>
                        <p className="text-[9px] text-[#8da4bf] mt-0.5">{ratioSections.reduce((s, sec) => s + sec.rows.length, 0)} rasyo · Tümü</p>
                      </div>
                      <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-600 border border-cyan-400/20">
                        Sektör: {bm.label} · TCMB 2024
                      </span>
                    </div>

                    {/* Kolon Başlıkları */}
                    <div className="grid grid-cols-12 px-7 py-2.5 border-b border-black/[0.04]" style={{ background: 'rgba(0,0,0,0.025)' }}>
                      <span className="col-span-6 text-[9px] font-black uppercase tracking-[0.2em] text-[#8da4bf]">Oran</span>
                      <span className="col-span-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#3d5a80] text-right">Firma Değeri</span>
                      <span className="col-span-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#8da4bf] text-right">Sektör Ort.</span>
                      <span className="col-span-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#8da4bf] text-center">Durum</span>
                    </div>

                    {ratioSections.map(sec => (
                      <div key={sec.label}>
                        {/* Kategori Başlığı */}
                        <div className="grid grid-cols-12 px-7 py-2.5 items-center" style={{ background: 'rgba(0,0,0,0.015)' }}>
                          <div className="col-span-12 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: sec.color }} />
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: sec.color }}>
                              {sec.label}
                            </span>
                          </div>
                        </div>
                        {/* Satırlar */}
                        <div className="divide-y divide-black/[0.03]">
                          {sec.rows.map(row => (
                            <div key={row.id} className="grid grid-cols-12 items-center px-0 hover:bg-black/[0.015] transition-colors">
                              <div className="col-span-6 px-7 py-3.5 text-[11px] font-semibold text-[#3d5a80]">{row.id}</div>
                              <div className="col-span-2 px-4 py-3.5 text-[11px] font-black text-[#0a1727] text-right">{row.val}</div>
                              <div className="col-span-2 px-4 py-3.5 text-[11px] font-bold text-[#8da4bf] text-right">{row.avg}</div>
                              <div className="col-span-2 px-7 py-3.5 text-center">
                                {row.val !== '—' && (
                                  <span className={clsx(
                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                    row.good
                                      ? "bg-emerald-500/10 text-emerald-600"
                                      : "bg-red-500/10 text-red-500"
                                  )}>
                                    {row.good ? 'İyi' : 'Zayıf'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── SENARYO ─────────────────── */}
                {activeTab === 'scenario' && (
                  <div className="space-y-5">
                    <div className="rounded-[20px] overflow-hidden" style={{
                      background: 'rgba(255,255,255,0.04)',
                      backdropFilter: 'blur(20px) saturate(140%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(140%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 8px 32px rgba(10,30,60,0.16)',
                    }}>
                      <div className="px-7 py-4 border-b border-white/5">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Senaryo Simülatörü</h4>
                        <p className="text-[9px] text-white/30 mt-0.5">Finansal kalemleri değiştirerek skor etkisini anlık görün</p>
                      </div>
                      <div className="p-5">
                        <WhatIfSimulator
                          baseData={selected.ratios ?? {}}
                          baseScore={cs}
                          rawFinancialData={selected.financialData as Record<string, number | null> | undefined}
                        />
                      </div>
                    </div>
                    <div style={GLASS} className="rounded-[20px] overflow-hidden">
                      <div className="px-7 py-4 border-b border-black/5">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">Hedef Nota Ulaş</h4>
                        <p className="text-[9px] text-[#8da4bf] mt-0.5">Hangi iyileştirme en çok puan kazandırır?</p>
                      </div>
                      <div className="p-5">
                        <OptimizationPanel
                          ratios={selected.ratios as unknown as RatioResult}
                          currentScore={cs}
                          currentRating={cr}
                          sector={selected.entity?.sector}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SUBJEKTİF ───────────────── */}
                {activeTab === 'subjective' && selected.entity?.id && (
                  <SubjectiveForm entityId={selected.entity.id} />
                )}

                {/* ── TREND ───────────────────── */}
                {activeTab === 'trend' && (
                  <TrendChart
                    analyses={entityAnalyses}
                    entityName={selected.entity?.name ?? ''}
                    subjectiveScores={subjectiveScores}
                    entityId={selected.entity?.id}
                  />
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
    </DashboardShell>
  )
}
