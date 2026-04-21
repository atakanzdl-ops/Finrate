'use client'

import React, { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Building2, Filter, Download, Loader2,
  LayoutDashboard, BarChart3, Sliders, Star, TrendingUp,
  ChevronDown, Info,
} from 'lucide-react'
import clsx from 'clsx'
import FinrateShell from '@/components/layout/FinrateShell'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'
import SubjectiveForm from '@/components/analysis/SubjectiveForm'
import OptimizationPanel from '@/components/analysis/OptimizationPanel'
import TrendChart from '@/components/analysis/TrendChart'
import { getSectorBenchmark } from '@/lib/scoring/benchmarks'
import type { RatioResult } from '@/lib/scoring/ratios'
import { combineScores } from '@/lib/scoring/subjective'
import { scoreToRating } from '@/lib/scoring/score'

/* ─── Types ─────────────────────────────────────── */

interface FinData {
  revenue: number | null; cogs: number | null; grossProfit: number | null
  ebit: number | null; ebitda: number | null; netProfit: number | null
  totalAssets: number | null; totalEquity: number | null
  totalCurrentAssets: number | null; totalCurrentLiabilities: number | null
  totalNonCurrentAssets: number | null; totalNonCurrentLiabilities: number | null
  cash: number | null; tradeReceivables: number | null; inventory: number | null
  shortTermFinancialDebt: number | null; longTermFinancialDebt: number | null
}

interface Analysis {
  id: string; year: number; period: string
  finalScore: number; finalRating: string
  liquidityScore: number; profitabilityScore: number
  leverageScore: number; activityScore: number
  overallCoverage?: number | null
  insufficientCategories?: string[]
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
  AAA: '#0B3C5D', AA: '#0B3C5D', A: '#0B3C5D',
  BBB: '#0B3C5D', BB: '#0B3C5D',
  B: '#0B3C5D',
  CCC: '#0B3C5D',
  CC: '#0B3C5D',
  C: '#0B3C5D',
  D: '#0B3C5D',
}

function prussianBlue(score: number): string {
  if (score > 80) return '#0B3C5D'
  if (score > 50) return '#0B3C5D'
  return '#EF4444'
}

/* ─── RatioInfoCell ─────────────────────────────── */
function RatioInfoCell({ label, desc }: { label: string; desc?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {desc && (
        <span className="relative inline-flex">
          <button
            onClick={() => setOpen(v => !v)}
            className="text-slate-300 hover:text-[#0B3C5D] transition-colors leading-none"
            style={{ lineHeight: 1 }}
          >
            <Info size={11} />
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                className="absolute left-full top-1/2 -translate-y-1/2 ml-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-left"
                style={{ width: 240, minWidth: 200 }}
              >
                <p className="text-[11px] font-bold text-[#0B3C5D] mb-1">{label}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">{desc}</p>
              </div>
            </>
          )}
        </span>
      )}
    </span>
  )
}

/* ─── BarMetricChart ─────────────────────────────── */
type BarPeriod = { label: string; primary: number | null; secondary: number | null }

function BarMetricChart({ periods, primaryLabel, secondaryLabel, tab, onTab }: {
  periods: BarPeriod[]
  primaryLabel: string; secondaryLabel: string
  tab: 'gelir' | 'borc'; onTab: (t: 'gelir' | 'borc') => void
}) {
  const [hoveredBar, setHoveredBar] = React.useState<string | null>(null)

  const vals = periods.flatMap(p => [p.primary ?? 0, p.secondary ?? 0])
  const maxVal = Math.max(...vals, 1)
  const pct = (v: number | null) => maxVal > 0 ? Math.round(((v ?? 0) / maxVal) * 100) : 0

  const fmtV = (v: number) => {
    const sign = v < 0 ? '-' : ''
    const abs  = Math.abs(v)
    if (abs >= 1_000_000_000) return `${sign}₺${(abs / 1_000_000_000).toFixed(1)}B`
    if (abs >= 1_000_000)     return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)         return `${sign}₺${(abs / 1_000).toFixed(0)}K`
    return `${sign}₺${abs.toFixed(0)}`
  }

  const n = periods.length
  const trendPoints = periods.map((p, i) => {
    const x = n === 1 ? 200 : 50 + i * (300 / Math.max(n - 1, 1))
    const y = 200 - (pct(p.primary) / 100) * 200
    return [x, y] as [number, number]
  })

  const pathD = trendPoints.length < 2 ? '' : trendPoints.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`
    const [px, py] = trendPoints[i - 1]
    const cx = (px + x) / 2
    return acc + ` C${cx},${py} ${cx},${y} ${x},${y}`
  }, '')
  const areaD = pathD ? pathD + ` L${trendPoints[trendPoints.length-1][0]},200 L${trendPoints[0][0]},200 Z` : ''

  // Son dönem değeri — büyüme % yerine sadece değer
  const lastPrimary = periods[periods.length - 1]?.primary
  const hasSec = periods.some(p => p.secondary != null && p.secondary !== 0)

  return (
    <div className="card card-chart">
      <div className="card-head">
        <div className="card-head-left">
          <h2 className="card-title">Gelir &amp; Performans Analizi</h2>
          <p className="card-desc">{periods.length} Dönemlik mukayeseli trend</p>
        </div>
        <div className="card-head-right">
          <div className="tab-group">
            <button className={`tab ${tab==='gelir'?'active':''}`} onClick={() => onTab('gelir')}>Gelir</button>
            <button className={`tab ${tab==='borc' ?'active':''}`} onClick={() => onTab('borc')}>Borç/Öz</button>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="chart-area">
          <div className="chart-y-axis">
            {[1, 0.75, 0.5, 0.25, 0].map(f => (
              <span key={f}>{fmtV(maxVal * f)}</span>
            ))}
          </div>
          <div className="chart-canvas">
            {[100,75,50,25,0].map(b => <div key={b} className="chart-grid-line" style={{ bottom:`${b}%` }}/>)}
            {periods.map((p) => {
              const hKey = p.label
              const isHov = hoveredBar === hKey
              return (
                <div key={p.label} className="bar-group"
                  onMouseEnter={() => setHoveredBar(hKey)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{ position:'relative' }}>
                  {/* Hover tooltip */}
                  {isHov && (
                    <div style={{
                      position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
                      background:'#0B3C5D', color:'#fff', borderRadius:8,
                      padding:'5px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap',
                      zIndex:10, marginBottom:4, pointerEvents:'none',
                      boxShadow:'0 8px 18px rgba(11,60,93,0.14)',
                    }}>
                      <div style={{ color:'#2EC4B6' }}>{p.label}</div>
                      <div>{primaryLabel}: {p.primary != null ? fmtV(p.primary) : '—'}</div>
                      {hasSec && <div style={{ color:'rgba(255,255,255,0.6)' }}>{secondaryLabel}: {p.secondary != null ? fmtV(p.secondary) : 'Veri yok'}</div>}
                    </div>
                  )}
                  <div className="bar-pair">
                    <motion.div className="bar"
                      style={{ background: '#0B3C5D', width: '10px', borderRadius: '2px' }}
                      initial={{ height:0 }} animate={{ height:`${pct(p.primary)}%` }}
                      transition={{ duration:0.7, ease:[0.16,1,0.3,1] }}>
                    </motion.div>
                    {hasSec && (
                      <motion.div className="bar"
                        style={{ background: '#2EC4B6', width: '10px', borderRadius: '2px', marginLeft: '2px' }}
                        initial={{ height:0 }} animate={{ height:`${pct(p.secondary)}%` }}
                        transition={{ duration:0.7, delay:0.05, ease:[0.16,1,0.3,1] }}/>
                    )}
                  </div>
                  <span className="bar-label">{p.label}</span>
                </div>
              )
            })}
            {pathD && (
              <svg className="trend-overlay" viewBox="0 0 400 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="trendGradBM" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2EC4B6" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="#2EC4B6" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={pathD} fill="none" stroke="#2EC4B6" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                <path d={areaD} fill="url(#trendGradBM)"/>
                <circle cx={trendPoints[trendPoints.length-1][0]} cy={trendPoints[trendPoints.length-1][1]}
                  r="4" fill="#2EC4B6" />
              </svg>
            )}
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item"><span className="legend-dot" style={{ background: '#0B3C5D' }}/><span>{primaryLabel}</span></div>
          {hasSec && <div className="legend-item"><span className="legend-dot" style={{ background: '#2EC4B6' }}/><span>{secondaryLabel}</span></div>}
          <div className="legend-item"><span className="legend-dot" style={{ background: '#2EC4B6' }}/><span>Trend</span></div>
          {lastPrimary != null && (
            <div className="chart-summary">
              <span className="summary-label">Son Dönem:</span>
              <span className="summary-value">{fmtV(lastPrimary)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── DonutSegChart ──────────────────────────────── */
function DonutSegChart({ title, totalLabel, segments, displayTotal }: {
  title: string
  totalLabel: string
  segments: { label: string; value: number; color: string }[]
  displayTotal?: number  // merkezde gösterilecek gerçek toplam (ör: totalAssets)
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null)

  const fmtM = (v: number) => {
    if (v >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `₺${(v / 1_000).toFixed(0)}K`
    return `₺${v.toFixed(0)}`
  }

  // Denominator = sum of segments (not external total → avoids >100% bug)
  const total = segments.reduce((s, x) => s + x.value, 0)

  const r = 60; const cx = 80; const cy = 80
  const circ = 2 * Math.PI * r

  let offset = 0
  const segs = segments.map((s, i) => {
    const frac = total > 0 ? s.value / total : 0
    const len  = frac * circ
    const seg  = { ...s, idx: i, dasharray: `${len} ${circ - len}`, dashoffset: circ - offset, pct: (frac * 100).toFixed(1) }
    offset += len
    return seg
  })

  return (
    <div className="card card-donut" style={{ flex: 1 }}>
      <div className="card-head"><h2 className="card-title">{title}</h2></div>
      <div className="card-body">
        <div className="donut-wrap">
          <svg className="donut-chart" viewBox="0 0 160 160" style={{ overflow: 'visible' }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={20}/>
            {segs.map(s => {
              const isHov = hoveredIdx === s.idx
              return (
                <motion.circle
                  key={s.label}
                  className="donut-seg"
                  cx={cx} cy={cy} r={r}
                  stroke={s.color}
                  strokeDasharray={s.dasharray}
                  initial={{ strokeDashoffset: circ, strokeWidth: 20 }}
                  animate={{ strokeDashoffset: s.dashoffset, strokeWidth: isHov ? 26 : 20 }}
                  transition={{ strokeDashoffset: { duration: 1.2, ease: [0.16,1,0.3,1] }, strokeWidth: { duration: 0.2 } }}
                  transform="rotate(-90 80 80)"
                  style={{
                    cursor: 'pointer',
                    filter: 'none',
                    transition: 'filter 0.2s',
                  }}
                  onMouseEnter={() => setHoveredIdx(s.idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              )
            })}
          </svg>
          <div className="donut-center">
            <div className="donut-total">{fmtM(displayTotal ?? total)}</div>
            <span className="donut-label">{totalLabel}</span>
          </div>
        </div>
        <div className="donut-legend">
          {segs.map(s => (
            <div
              key={s.label}
              className="donut-legend-item"
              style={{
                fontWeight: hoveredIdx === s.idx ? 700 : undefined,
                opacity: hoveredIdx !== null && hoveredIdx !== s.idx ? 0.45 : 1,
                transition: 'opacity 0.2s, font-weight 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={() => setHoveredIdx(s.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="legend-color" style={{ background: s.color, transform: hoveredIdx === s.idx ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.2s' }}/>
              <span className="legend-text" style={{ color: hoveredIdx === s.idx ? s.color : undefined }}>{s.label}</span>
              <span className="legend-val" style={{ color: hoveredIdx === s.idx ? s.color : undefined }}>%{s.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── InsufficientBanner ─────────────────────────── */
function InsufficientBanner({ categories }: { categories?: string[] }) {
  if (!categories || categories.length === 0) return null
  const labels: Record<string, string> = {
    likidite: 'Likidite', karlılık: 'Karlılık', borçluluk: 'Borçluluk', faaliyet: 'Faaliyet',
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8, marginBottom: 12,
      background: 'rgba(234,88,12,0.08)',
      border: '1px solid rgba(234,88,12,0.35)',
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.4 }}>⚠️</span>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#9a3412' }}>
        Bazı rasyolar hesaplanamadı — skor güvenilirliği düşük.{' '}
        Yetersiz veri kategorisi: <strong>{categories.map(c => labels[c] ?? c).join(', ')}</strong>.
      </p>
    </div>
  )
}

/* ─── SubjectiveMissingBanner ───────────────────────── */
function SubjectiveMissingBanner({ missing }: { missing?: boolean }) {
  if (!missing) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8, marginBottom: 12,
      background: 'rgba(99,102,241,0.07)',
      border: '1px solid rgba(99,102,241,0.30)',
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.4 }}>ℹ️</span>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#3730a3' }}>
        Niteliksel veriler girilmedi — skor güvenilirliği düşük.{' '}
        Subjektif sekmesindan KKB, banka ilişkileri ve kurumsal yapı bilgilerini doldurun.
      </p>
    </div>
  )
}

/* ─── CoverageBanner ─────────────────────────────── */
function CoverageBanner({ coverage }: { coverage: number | null | undefined }) {
  if (coverage == null || coverage >= 0.5) return null
  const pct  = Math.round(coverage * 100)
  const low  = coverage < 0.25
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8, marginBottom: 12,
      background: low ? 'rgba(234,88,12,0.08)' : 'rgba(234,179,8,0.08)',
      border: `1px solid ${low ? 'rgba(234,88,12,0.35)' : 'rgba(234,179,8,0.35)'}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.4 }}>{low ? '🟠' : '🟡'}</span>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: low ? '#9a3412' : '#854d0e' }}>
        {low
          ? `Veri kapsamı çok düşük (%${pct}). Skor güvenilirliği sınırlıdır, eksik verileri tamamlayın.`
          : `Veri kapsamı düşük (%${pct}). Bazı metrikler hesaplanamadı — skor tahmini niteliğindedir.`
        }
      </p>
    </div>
  )
}

/* ─── CircularScore ──────────────────────────────── */
function CircularScore({ score, rating }: { score: number; rating: string }) {
  const circ   = 2 * Math.PI * 34
  const offset = circ - (score / 100) * circ

  return (
    <div className="flex flex-col items-center">
      <div className="score-ring-wrap mb-4">
        <svg className="score-ring" viewBox="0 0 80 80">
          <defs>
            <linearGradient id="scoreGradAn" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2dd4bf"/>
              <stop offset="100%" stopColor="#14b8a6"/>
            </linearGradient>
          </defs>
          <circle className="ring-bg" cx="40" cy="40" r="34" />
          <motion.circle
            className="ring-fill"
            cx="40" cy="40" r="34"
            stroke="url(#scoreGradAn)"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="score-value">
          <div className="score-num" style={{ color: '#2dd4bf' }}>{Math.round(score)}</div>
          <div className="score-max">/ 100</div>
        </div>
      </div>
      <div className="text-center">
        <div className="score-grade" style={{ color: RATING_COLOR[rating] ?? '#2dd4bf' }}>{rating}</div>
        <div className="score-label mt-1">{RATING_LABEL[rating] ?? 'Kredi Notu'}</div>
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────── */
function AnalizPageContent() {
  const [analyses,        setAnalyses]        = useState<Analysis[]>([])
  const [selected,        setSelected]        = useState<Analysis | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [activeTab,       setActiveTab]       = useState<TabId>('overview')
  const [chartTab,        setChartTab]        = useState<'gelir' | 'borc'>('gelir')
  const [subjectiveScores,  setSubjectiveScores]  = useState<Record<string, number>>({})
  const [subjectiveMissing, setSubjectiveMissing] = useState<Record<string, boolean>>({})
  const [yearOpen,        setYearOpen]        = useState(false)
  const searchParams = useSearchParams()
  const entityId     = searchParams.get('entityId')
  const router       = useRouter()

  useEffect(() => {
    const doLoad = () => {
      fetch('/api/analyses')
        .then(r => r.json())
        .then(d => {
          const list: Analysis[] = d.analyses ?? []
          setAnalyses(list)
          const storedEid = sessionStorage.getItem('finrate_last_entity')
          const initial = entityId
            ? (list.filter(a => a.entity?.id === entityId).sort((a, b) => b.year - a.year)[0] ?? list[0] ?? null)
            : storedEid
              ? (list.filter(a => a.entity?.id === storedEid).sort((a, b) => b.year - a.year)[0] ?? list[0] ?? null)
              : (list[0] ?? null)
          setSelected(initial)
          if (initial?.entity?.id) sessionStorage.setItem('finrate_last_entity', initial.entity.id)
          const eids = [...new Set(list.map(a => a.entity?.id).filter(Boolean))] as string[]
          eids.forEach(eid => {
            fetch(`/api/entities/${eid}/subjective`)
              .then(r => r.ok ? r.json() : null)
              .then(d => {
                if (d?.score?.total != null) {
                  setSubjectiveScores(prev => ({ ...prev, [eid]: d.score.total }))
                  setSubjectiveMissing(prev => ({ ...prev, [eid]: false }))
                } else {
                  setSubjectiveMissing(prev => ({ ...prev, [eid]: true }))
                }
              })
          })
        })
        .finally(() => setLoading(false))
    }
    // Recalculate en fazla 3 dakikada bir (sayfa geçişlerini yavaşlatmamak için)
    // Race condition önlemi: timestamp'i fetch ÖNCE yaz, böylece paralel sekme de tetiklemez
    const RECALC_KEY    = 'finrate_recalc_ts'
    const RECALC_VER    = 'finrate_recalc_ver'
    const CURRENT_VER   = '2'  // Rasyo motoru değiştiğinde artır → önbellek temizlenir
    const lastTs        = sessionStorage.getItem(RECALC_KEY)
    const lastVer       = sessionStorage.getItem(RECALC_VER)
    const stale         = !lastTs || Date.now() - parseInt(lastTs) > 3 * 60 * 1000 || lastVer !== CURRENT_VER
    if (stale) {
      sessionStorage.setItem(RECALC_KEY, Date.now().toString())
      sessionStorage.setItem(RECALC_VER, CURRENT_VER)
      fetch('/api/analyses/recalculate', { method: 'POST' })
        .catch(() => { sessionStorage.removeItem(RECALC_KEY) }) // Hata olursa kilit kaldır
        .finally(() => doLoad())
    } else {
      doLoad()
    }
  }, [entityId])

  function combinedScore(a: Analysis) {
    const subj = a.entity?.id ? (subjectiveScores[a.entity.id] ?? 0) : 0
    return combineScores(a.finalScore, subj)
  }
  function combinedRating(s: number) { return scoreToRating(s) }

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
    <FinrateShell>
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-prussian-900" />
      </div>
    </FinrateShell>
  )
  if (analyses.length === 0) return (
    <FinrateShell>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-[#0B3C5D]">Analizler</h1>
        <div className="card rounded-xl p-10 text-center">
          <p className="text-sm text-slate-500">Henüz analiz yok. Bir şirkete finansal veri girerek başlayın.</p>
        </div>
      </div>
    </FinrateShell>
  )

  /* ─── Derived ─────────────────────────────────── */
  const bm  = getSectorBenchmark(selected?.entity?.sector)
  const fd  = selected?.financialData
  const cs  = selected ? combinedScore(selected) : 0
  const cr  = combinedRating(cs)
  const r   = selected?.ratios ?? {}
  const whyItems = selected ? [
    {
      tone: r.currentRatio != null && r.currentRatio >= bm.currentRatio * 0.9 ? 'positive' : 'warning',
      category: 'Likidite',
      metric: 'Cari Oran:',
      val: fmtN(r.currentRatio),
      comment: r.currentRatio != null
        ? (r.currentRatio >= bm.currentRatio * 0.9 ? 'Sektör ortalaması üzerinde, likidite güçlü.' : 'Sektör ortalaması altında, işletme sermaye açığı riski.')
        : 'Veri eksik',
    },
    {
      tone: r.netProfitMargin != null && r.netProfitMargin >= 0 ? 'positive' : 'negative',
      category: 'Karlılık',
      metric: 'Net Marj:',
      val: fmtPct(r.netProfitMargin),
      comment: r.netProfitMargin != null
        ? (r.netProfitMargin >= 0 ? 'Pozitif faaliyet karlılığı, sürdürülebilir büyüme.' : 'Negatif net marj, maliyet baskısı.')
        : 'Veri eksik',
    },
    {
      tone: r.debtToEquity != null && r.debtToEquity <= bm.debtToEquity * 1.2 ? 'positive' : 'negative',
      category: 'Kaldıraç',
      metric: 'Borç / Özkaynak:',
      val: fmtN(r.debtToEquity),
      comment: r.debtToEquity != null
        ? (r.debtToEquity <= bm.debtToEquity * 1.2 ? 'Güvenli borçluluk aralığı, kredi genişlemesine uygun.' : 'Yüksek kaldıraç, riskli borçluluk yapısı.')
        : 'Veri eksik',
    },
  ] : []

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
  const ratioSections = selected ? [
    {
      label: 'Likidite', color: '#2dd4bf',
      rows: [
        { id: 'Cari Oran',              desc: 'Dönen varlıklar / kısa vadeli borçlar. Firmanın kısa vadeli yükümlülüklerini dönen varlıklarıyla ne ölçüde karşılayabildiğini gösterir. 1.5x üzeri sağlıklıdır.',             val: fmtN(r.currentRatio),             avg: fmtN(bm.currentRatio),              good: r.currentRatio != null && r.currentRatio >= bm.currentRatio * 0.85 },
        { id: 'Asit-Test (Hızlı)',      desc: '(Dönen varlıklar − Stoklar) / kısa vadeli borçlar. Stok satışına gerek kalmadan anlık yükümlülükleri karşılama gücü. 1.0x üzeri iyi sayılır.',                               val: fmtN(r.quickRatio),               avg: fmtN(bm.quickRatio),                good: r.quickRatio != null && r.quickRatio >= bm.quickRatio * 0.85 },
        { id: 'Nakit Oran',             desc: 'Nakit & benzerleri / kısa vadeli borçlar. En katı likidite ölçüsüdür; yalnızca eldeki nakitle borç karşılanabilirliğini gösterir.',                                           val: fmtN(r.cashRatio),                avg: fmtN(bm.cashRatio),                 good: r.cashRatio != null && r.cashRatio >= 0.10 },
        { id: 'Net Çal. Ser. / Aktif',  desc: 'Net çalışma sermayesi (dönen − kısa vadeli borç) / toplam aktif. Pozitif olması, işletmenin kendi kendini finanse edebildiğine işaret eder.',                                 val: fmtN(r.netWorkingCapitalRatio),   avg: fmtN(bm.netWorkingCapitalRatio),    good: r.netWorkingCapitalRatio != null && r.netWorkingCapitalRatio > 0 },
        { id: 'Nakit İhtiyaç Süresi',   desc: 'Stok devir + alacak tahsil − borç ödeme süresi (gün). Düşük değer daha hızlı nakit döngüsü anlamına gelir.',                                                                   val: r.cashConversionCycle != null ? fmtN(r.cashConversionCycle, 0) + ' gün' : '—', avg: fmtN(bm.cashConversionCycle, 0) + ' gün', good: r.cashConversionCycle != null && r.cashConversionCycle < 120 },
        ...(r.customerAdvanceDays != null ? [
          { id: 'Alınan Avans Süresi (İnş.)',   desc: 'Müşteri avanslarının (340) net satışlara oranı × 365. İnşaat şirketlerinde müşteri ön ödemesinin işletme döngüsüne katkısını gösterir.',                                val: fmtN(r.customerAdvanceDays, 0) + ' gün',             avg: '—', good: r.customerAdvanceDays != null && r.customerAdvanceDays > 0 },
          { id: 'Düzeltilmiş NDS (İnş.)',       desc: 'Nakit İhtiyaç Süresi − Alınan Avans Süresi. Müşteri avansları indirilmiş gerçek finansman ihtiyacı. İnşaat sektörüne özel gösterge.',                                  val: r.adjustedCashConversionCycle != null ? fmtN(r.adjustedCashConversionCycle, 0) + ' gün' : '—', avg: '—', good: r.adjustedCashConversionCycle != null && r.adjustedCashConversionCycle < 90 },
        ] : []),
      ]
    },
    {
      label: 'Karlılık', color: '#818cf8',
      rows: [
        { id: 'Brüt Kar Marjı',                   desc: '(Satışlar − SMM) / Satışlar. Üretim/tedarik maliyeti düşüldükten sonra kalan kâr payı. Yükseldikçe rekabet gücü artar.',                                          val: fmtPct(r.grossMargin),            avg: fmtPct(bm.grossMargin),             good: r.grossMargin != null && r.grossMargin >= bm.grossMargin * 0.8 },
        { id: 'FAVÖK Marjı',                       desc: 'Faiz, vergi ve amortisman öncesi kâr / satışlar. Şirketin nakit üretme kapasitesini gösterir; borç ödeme gücünün temel göstergesidir.',                            val: fmtPct(r.ebitdaMargin),           avg: fmtPct(bm.ebitdaMargin),           good: r.ebitdaMargin != null && r.ebitdaMargin >= bm.ebitdaMargin * 0.8 },
        { id: 'FVÖK Marjı (EBIT)',                 desc: 'Faiz ve vergi öncesi kâr / satışlar. Amortismanı dahil eden operasyonel karlılık ölçüsüdür. %5 üzeri kabul edilebilir.',                                          val: fmtPct(r.ebitMargin),             avg: fmtPct(bm.ebitMargin),              good: r.ebitMargin != null && r.ebitMargin >= 0.05 },
        { id: 'Net Kar Marjı',                     desc: 'Net kâr / satışlar. Tüm giderler, faiz ve vergi sonrası kalan kâr payı. Bankaların en çok izlediği karlılık göstergesidir.',                                       val: fmtPct(r.netProfitMargin),        avg: fmtPct(bm.netProfitMargin),        good: r.netProfitMargin != null && r.netProfitMargin >= bm.netProfitMargin * 0.8 },
        { id: 'Aktif Karlılığı (ROA)',             desc: 'Net kâr / toplam aktif. Varlıkların ne kadar verimli kullanıldığını gösterir. %4+ iyi, %8+ çok iyi kabul edilir.',                                                 val: fmtPct(r.roa),                    avg: fmtPct(bm.roa),                     good: r.roa != null && r.roa >= bm.roa * 0.8 },
        { id: 'Özkaynak Karlılığı (ROE)',          desc: 'Net kâr / özkaynak. Hissedar yatırımının getirisidir. %10+ iyi, sektör ortalamasının üzeri çok iyi sayılır.',                                                      val: fmtPct(r.roe),                    avg: fmtPct(bm.roe),                     good: r.roe != null && r.roe >= bm.roe * 0.8 },
        { id: 'Yatırım Getirisi (ROIC)',           desc: 'FVÖK×(1-vergi) / yatırılan sermaye. Tüm finanse edilmiş sermayenin verimliliğini ölçer. Sermaye maliyetinin üzerinde olması gerekir.',                             val: fmtPct(r.roic),                   avg: fmtPct(bm.roic),                    good: r.roic != null && r.roic >= 0.10 },
        { id: 'Nominal Gelir Büyümesi',            desc: 'Cironun yıllık büyüme oranı (enflasyon dahil). Pozitif büyüme şirketin büyüdüğüne işaret eder.',                                                                   val: r.revenueGrowth != null ? fmtPct(r.revenueGrowth) : '—', avg: fmtPct(bm.revenueGrowth), good: r.revenueGrowth != null && r.revenueGrowth >= 0 },
        { id: 'Reel Büyüme (ÜFE Arındırılmış)',   desc: 'Nominal büyümeden ÜFE (üretici fiyat endeksi) çıkarılan reel büyüme. Enflasyondan arındırılmış gerçek büyümeyi gösterir.',                                         val: r.realGrowth != null ? fmtPct(r.realGrowth) : '—', avg: '—', good: r.realGrowth != null && r.realGrowth >= 0 },
      ]
    },
    {
      label: 'Kaldıraç', color: '#0ea5e9',
      rows: [
        { id: 'Borç / Özkaynak',        desc: 'Toplam borç / özkaynak. 1.0x altı dengeli, 2.0x üzeri yüksek kaldıraçlıdır. Bankaların en çok dikkat ettiği kaldıraç göstergesidir.',                                        val: fmtN(r.debtToEquity),             avg: fmtN(bm.debtToEquity),              good: r.debtToEquity != null && r.debtToEquity <= bm.debtToEquity * 1.2 },
        { id: 'Borç / Aktif',           desc: 'Toplam borç / toplam aktif. Varlıkların ne kadarının borçla finanse edildiğini gösterir. 0.50 altı tercih edilir.',                                                           val: fmtN(r.debtToAssets),             avg: fmtN(bm.debtToAssets),              good: r.debtToAssets != null && r.debtToAssets <= bm.debtToAssets * 1.2 },
        { id: 'Özkaynak Oranı',         desc: 'Özkaynak / toplam aktif. Öz finansman gücüdür. %30 üzeri sağlıklı kabul edilir; yükseldikçe mali bağımsızlık artar.',                                                        val: fmtN(r.equityRatio),              avg: '—',                                good: r.equityRatio != null && r.equityRatio >= 0.30 },
        { id: 'KV Borç Oranı',          desc: 'Kısa vadeli borçlar / toplam borçlar. %50 altı dengeli; yüksek oran yakın vadeli yeniden finansman riskine işaret eder.',                                                     val: fmtN(r.shortTermDebtRatio),       avg: fmtN(bm.shortTermDebtRatio),        good: r.shortTermDebtRatio != null && r.shortTermDebtRatio < 0.5 },
        { id: 'Net Borç / FAVÖK',        desc: 'Net finansal borç / FAVÖK. Mevcut FAVÖK ile borcun kaç yılda ödenebileceğini gösterir. 3.0x altı iyi, 5.0x üzeri kritik sayılır.',                                           val: r.debtToEbitda != null ? fmtN(r.debtToEbitda, 1) + 'x' : '—', avg: fmtN(bm.debtToEbitda, 1) + 'x', good: r.debtToEbitda != null && r.debtToEbitda <= 3 },
        { id: 'Faiz Karşılama',         desc: 'FVÖK / faiz giderleri. Faiz ödemelerinin kaç katı FVÖK üretildiğini gösterir. 2.0x altı riskli, 4.0x üzeri rahat kabul edilir.',                                              val: r.interestCoverage === Infinity ? '∞x (Faiz Yok)' : r.interestCoverage != null ? fmtN(r.interestCoverage, 1) + 'x' : '—', avg: fmtN(bm.interestCoverage, 1) + 'x', good: r.interestCoverage === Infinity || (r.interestCoverage != null && r.interestCoverage >= bm.interestCoverage * 0.8) },
      ]
    },
    {
      label: 'Faaliyet', color: '#6366f1',
      rows: [
        { id: 'Aktif Devir Hızı',       desc: 'Satışlar / toplam aktif. Varlıkların ne kadar etkin kullanıldığının ölçüsüdür. Yükseldikçe operasyonel verimlilik artar.',                                                    val: fmtN(r.assetTurnover),            avg: fmtN(bm.assetTurnover),             good: r.assetTurnover != null && r.assetTurnover >= bm.assetTurnover * 0.8 },
        { id: 'Sabit Aktif Devir',      desc: 'Satışlar / duran varlıklar. Makine, bina gibi sabit varlıkların kaç kat satış ürettiğini gösterir. 1.0x üzeri beklenir.',                                                     val: fmtN(r.fixedAssetTurnover),       avg: fmtN(bm.fixedAssetTurnover),        good: r.fixedAssetTurnover != null && r.fixedAssetTurnover >= 1.0 },
        { id: 'Stok Devir Süresi',      desc: 'Stokların kaç günde satıldığını gösterir. Düşük gün = stok hızlı dönüyor = nakite çevrim hızlı. Sektöre göre 30-90 gün arasında değişir.',                                    val: r.inventoryTurnoverDays != null ? fmtN(r.inventoryTurnoverDays, 0) + ' gün' : '—', avg: r.inventoryTurnoverDays != null ? fmtN(bm.inventoryDays, 0) + ' gün' : '—', good: r.inventoryTurnoverDays != null && r.inventoryTurnoverDays <= bm.inventoryDays * 1.2 },
        { id: 'Alacak Tahsil Süresi',   desc: 'Müşteri alacaklarının kaç günde tahsil edildiği. Düşük = para hızlı geliyor. Yüksek oran nakit akışı sıkışıklığına yol açar.',                                                val: r.receivablesTurnoverDays != null ? fmtN(r.receivablesTurnoverDays, 0) + ' gün' : '—', avg: r.receivablesTurnoverDays != null ? fmtN(bm.receivablesDays, 0) + ' gün' : '—', good: r.receivablesTurnoverDays != null && r.receivablesTurnoverDays <= bm.receivablesDays * 1.2 },
        { id: 'Borç Ödeme Süresi',      desc: 'Tedarikçi borçlarının kaç günde ödendiği. Yüksek = tedarikçi finansmanı uzun kullanılıyor (likidite için iyi, ama ilişki yönetimi önemli).',                                  val: r.payablesTurnoverDays != null ? fmtN(r.payablesTurnoverDays, 0) + ' gün' : '—', avg: fmtN(bm.payablesTurnoverDays, 0) + ' gün', good: r.payablesTurnoverDays != null && r.payablesTurnoverDays >= 30 },
        { id: 'Faaliyet Gid. Oranı',    desc: 'Faaliyet giderleri / satışlar. Satışların ne kadarının genel gider (personel, kira vb.) olarak harcandığını gösterir. %30 altı verimli kabul edilir.',                        val: fmtN(r.operatingExpenseRatio),    avg: fmtPct(bm.operatingExpenseRatio),   good: r.operatingExpenseRatio != null && r.operatingExpenseRatio < 0.30 },
      ]
    },
  ] : []

  /* ─── Render ──────────────────────────────────── */
  return (
    <FinrateShell>
    <div className="flex flex-col gap-6">

      <div className="flex items-center justify-between gap-4">
        <div className="page-header-left">
          <h1>Analizler</h1>
          <p className="page-subtitle">Şirket finansal analizleri ve skor değerlendirmeleri</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text" placeholder="Şirket, Dönem Ara..."
              className="h-10 w-56 rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-xs font-semibold text-[#1E293B] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1FA4A9]/20"
            />
          </div>
          <button
            onClick={async () => {
              if (!selected) return
              await fetch(`/api/analyses/${selected.id}/report`, { method: 'POST' })
              router.push(`/dashboard/analiz/rapor?id=${selected.id}`)
            }}
            disabled={!selected}
            className="btn btn-primary disabled:opacity-40"
          >
            <Download size={14} /> Rapor Oluştur
          </button>
        </div>
      </div>

      {selected && (
        <div className="bg-white border border-slate-200 rounded-[4px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-bold text-[#0B3C5D]">Hızlı Teşhis (Quick Screen)</h2>
          </div>
          <div className="p-0">
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <div className="col-span-3">METRİK</div>
                  <div className="col-span-2">DURUM</div>
                  <div className="col-span-7">YORUM</div>
              </div>
              {whyItems.map((item) => (
                <div key={item.category} className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                  <div className="col-span-3 flex flex-col">
                    <span className="text-sm font-bold text-[#0B3C5D]">{item.metric} {item.val}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-widest ${
                      item.tone === 'positive' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                      item.tone === 'negative' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-warning/10 text-warning border border-warning/20'
                    }`}>
                      {item.tone === 'positive' ? '✅ İYİ' : item.tone === 'negative' ? '❌ RİSK' : '⚠️ İZLE'}
                    </span>
                  </div>
                  <div className="col-span-7">
                    <p className="text-sm text-slate-600">{item.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* ── Sol: Şirket Listesi ─────────────── */}
        <div className="lg:col-span-3">
          <div className="card p-5">
            <p className="card-desc uppercase tracking-[0.3em] mb-4">Şirketler</p>
            <div className="space-y-2">
              {Object.entries(entityGroups).map(([, group]) => {
                const best = group[0] // en yeni (sorted desc by year)
                const isActive = selected?.entity?.id === best.entity?.id
                const score = Math.round(combinedScore(best))
                const rating = combinedRating(combinedScore(best))
                return (
                  <div key={best.entity?.id}>
                  <button
                    onClick={() => { setSelected(best); if (best.entity?.id) sessionStorage.setItem('finrate_last_entity', best.entity.id) }}
                    className={clsx(
                      "w-full p-3.5 rounded-xl border transition-all text-left",
                      isActive
                        ? "border-slate-300 bg-slate-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border",
                        isActive ? "border-slate-300 bg-[#EDF4F8]" : "border-slate-200 bg-slate-50")}>
                        <Building2 size={14} className={isActive ? "text-[#0B3C5D]" : "text-slate-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={clsx("truncate text-[11px] font-semibold", isActive ? "text-[#0B3C5D]" : "text-slate-600")}>
                          {best.entity?.name ?? 'Şirket'}
                        </p>
                        <p className="mt-0.5 font-mono text-[9px] font-semibold text-slate-400">
                          {group.length > 1 ? `${group.length} dönem` : `${best.year} · ${best.period}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-black font-mono" style={{ color: RATING_COLOR[rating] ?? '#94A3B8' }}>
                          {score}
                        </div>
                        <div className="text-[9px] font-black" style={{ color: RATING_COLOR[rating] ?? '#94A3B8' }}>{rating}</div>
                      </div>
                    </div>
                  </button>
                  {isActive && group.length > 0 && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-2">
                      <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Yüklenen Yıllar
                      </p>
                      <div className="space-y-1">
                        {[...group]
                          .sort((a, b) => b.year - a.year || b.period.localeCompare(a.period))
                          .map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setSelected(item)}
                              className={clsx(
                                "w-full rounded-md px-2 py-1.5 text-left text-[11px] font-mono transition-colors",
                                selected?.id === item.id ? "bg-[#EDF4F8] text-[#0B3C5D] font-semibold" : "text-slate-600 hover:bg-slate-50",
                              )}
                            >
                              {item.year} · {item.period}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Sağ: İçerik ─────────────────────── */}
        {selected && (
          <div className="lg:col-span-9 space-y-4">

            {/* Şirket başlığı + Yıl seçici */}
            <div className="card px-6 py-4 flex items-center justify-between" style={{ overflow: 'visible' }}>
              <div>
                <p className="card-desc uppercase tracking-[0.3em]">{selected.entity?.sector ?? 'Sektör belirtilmemiş'}</p>
                <h2 className="card-title mt-0.5" style={{ fontSize: '18px' }}>
                  {selected.entity?.name ?? 'Şirket'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Sektör benchmark etiketi */}
                {selected.entity?.sector && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-semibold text-slate-600">
                    {bm.label} · TCMB Sektör Ort.
                  </span>
                )}
                {/* Yıl seçici */}
                {entityAnalyses.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setYearOpen(v => !v)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-[#0B3C5D] transition-colors hover:bg-slate-50"
                    >
                      {selected.year} · {selected.period}
                      <ChevronDown size={12} className={clsx("transition-transform", yearOpen && "rotate-180")} />
                    </button>
                    {yearOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20 min-w-[140px]"
                        style={{ background: '#ffffff', border: '1px solid #e5e9f0', boxShadow: '0 8px 18px rgba(15,23,42,0.08)', padding: 0 }}
                      >
                        {entityAnalyses.map(a => (
                          <button
                            key={a.id}
                            onClick={() => { setSelected(a); setYearOpen(false) }}
                            className={clsx(
                              "w-full px-4 py-2.5 text-left font-mono text-xs font-semibold transition-colors hover:bg-slate-50",
                              selected.id === a.id ? "bg-[#EDF4F8] text-[#0B3C5D]" : "text-slate-600"
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
            <div className="tab-group p-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "tab",
                    activeTab === tab.id && "active"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline ml-2">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ── Tab İçerikleri ────────────────── */}
            <div>

                {/* ── GENEL BAKIŞ ─────────────── */}
                {activeTab === 'overview' && (() => {
                  // ── hesaplamalar ──────────────────────────────────────
                  const de        = r.debtToEquity ?? 0
                  const deBench   = bm.debtToEquity ?? 1
                  const deStatus  = de > 2.0 ? 'danger' : de > 1.0 ? 'warning' : 'normal'
                  const deTrend   = de <= deBench ? 'up' : 'down'
                  const deColor   = de > 2.0 ? '#ef4444' : de > 1.0 ? '#94a3b8' : '#10b981'

                  const crRatio     = r.currentRatio ?? 0
                  const crBench     = bm.currentRatio ?? 1.5
                  const crBarPct    = Math.min(crRatio / 3, 1) * 100
                  const crMarkPct   = Math.min(crBench / 3, 1) * 100
                  const crStatus    = crRatio < 1 ? 'warning' : 'normal'

                  const activeRating = cr.replace(/[+\-]/g, '')
                  const RATING_SCALE = ['AAA','AA','A','BBB','BB','B','CCC']
                  const RISK_LABEL: Record<string,string> = {
                    AAA:'Çok Düşük', AA:'Düşük', A:'Düşük', BBB:'Orta',
                    BB:'Orta-Yüksek', B:'Yüksek', CCC:'Çok Yüksek', CC:'Kritik', C:'Kritik', D:'İflas',
                  }
                  const catItems = [
                    { label: 'Likidite',  value: Math.round(selected.liquidityScore),     color: '#0ea5e9', fill: 'fill-cyan'   },
                    { label: 'Karlılık',  value: Math.round(selected.profitabilityScore), color: '#6366f1', fill: 'fill-indigo' },
                    { label: 'Kaldıraç', value: Math.round(selected.leverageScore),      color: '#2dd4bf', fill: 'fill-teal'   },
                    { label: 'Faaliyet', value: Math.round(selected.activityScore),      color: '#10b981', fill: 'fill-emerald'},
                  ]

                  return (
                  <div className="space-y-4">

                    {/* ── Row 1: KPI kartları — kompakt boyut ─────────── */}
                    <div className="kpi-row" style={{ fontSize: '0.85em' }}>

                      {/* KPI 1 — Finrate Skoru */}
                      <div className={clsx('kpi-card kpi-score', cs < 60 && 'kpi-card-warning')}>
                        <div className="kpi-header">
                          <span className="kpi-label">Finrate Skoru</span>
                          <span className={clsx('kpi-badge', cs >= 60 ? 'badge-up' : 'badge-down')}>
                            {cr}
                          </span>
                        </div>
                        <div className="kpi-body-score">
                          <div className="score-ring-wrap" style={{ width:80, height:80 }}>
                            <svg className="score-ring" viewBox="0 0 120 120">
                              <defs>
                                <linearGradient id="scoreGradOv" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#2dd4bf"/>
                                  <stop offset="100%" stopColor="#14b8a6"/>
                                </linearGradient>
                              </defs>
                              <circle className="ring-bg" cx="60" cy="60" r="50"/>
                              <motion.circle className="ring-fill" cx="60" cy="60" r="50"
                                stroke="url(#scoreGradOv)"
                                strokeDasharray="314.16"
                                initial={{ strokeDashoffset: 314.16 }}
                                animate={{ strokeDashoffset: 314.16 - (cs / 100) * 314.16 }}
                                transition={{ duration:1.5, ease:[0.16,1,0.3,1] }}
                              />
                            </svg>
                            <div className="score-value">
                              <span className="score-num" style={{ color:'#2dd4bf', fontSize:20 }}>{Math.round(cs)}</span>
                              <span className="score-max">/100</span>
                            </div>
                          </div>
                          <div className="score-meta">
                            <span className="score-grade" style={{ color: RATING_COLOR[cr] ?? '#2dd4bf', fontSize:18 }}>{cr}</span>
                            <span className="score-label">{RATING_LABEL[cr] ?? 'Kredi Notu'}</span>
                          </div>
                        </div>
                      </div>

                      {/* KPI 2 — Aktif Toplam */}
                      <div className="kpi-card">
                        <div className="kpi-header">
                          <span className="kpi-label">Aktif Toplam</span>
                        </div>
                        <div className="kpi-body">
                          <span className="kpi-value" style={{ fontSize:22 }}>{fmtTL(fd?.totalAssets)}</span>
                          <div className="kpi-sparkline">
                            <svg viewBox="0 0 80 30" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="spGrad1" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3"/>
                                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"/>
                                </linearGradient>
                              </defs>
                              <polyline points="0,25 20,20 40,16 60,11 80,5" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round"/>
                              <polygon points="0,25 20,20 40,16 60,11 80,5 80,30 0,30" fill="url(#spGrad1)"/>
                            </svg>
                          </div>
                        </div>
                        <div className="kpi-footer">
                          <span>{fd?.totalCurrentAssets != null ? `Dönen: ${fmtTL(fd.totalCurrentAssets)}` : '—'}</span>
                        </div>
                      </div>

                      {/* KPI 3 — Cari Oran */}
                      <div className={clsx('kpi-card', crStatus === 'warning' && 'kpi-card-warning')}>
                        <div className="kpi-header">
                          <span className="kpi-label">Cari Oran</span>
                          <span className={clsx('kpi-badge', crRatio >= crBench ? 'badge-up' : 'badge-down')}>
                            {crRatio >= crBench ? '+' : '−'}{Math.abs(crRatio - crBench).toFixed(2)}
                          </span>
                        </div>
                        <div className="kpi-body" style={{ flexDirection:'column', alignItems:'flex-start', gap:6 }}>
                          <span className="kpi-value" style={{ fontSize:22 }}>{fmtN(crRatio)}</span>
                          <div style={{ width:'100%' }}>
                            <div style={{ position:'relative', height:5, background:'rgba(0,0,0,0.08)', borderRadius:3 }}>
                              <motion.div initial={{ width:0 }} animate={{ width:`${crBarPct}%` }}
                                style={{ position:'absolute', left:0, top:0, height:'100%', borderRadius:3,
                                         background: crRatio>=1.5 ? '#0ea5e9' : crRatio>=1 ? '#94a3b8' : '#ef4444' }}/>
                              <div style={{ position:'absolute', top:-3, width:2, height:11, background:'#94a3b8', borderRadius:1,
                                            left:`${crMarkPct}%`, transform:'translateX(-50%)' }}/>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#94a3b8', marginTop:3 }}>
                              <span>Düşük</span><span>Hedef</span><span>Yüksek</span>
                            </div>
                          </div>
                        </div>
                        <div className="kpi-footer"><span>Sektör ort: {fmtN(crBench)}</span></div>
                      </div>

                      {/* KPI 4 — Borç/Özkaynak */}
                      <div className={clsx('kpi-card', deStatus==='danger'&&'kpi-card-danger', deStatus==='warning'&&'kpi-card-warning')}>
                        <div className="kpi-header">
                          <span className="kpi-label">Borç / Özkaynak</span>
                          <span className={clsx('kpi-badge', deTrend==='up'?'badge-up':'badge-down')}>
                            {deTrend==='up' ? '↓ İyi' : '↑ Yük'}
                          </span>
                        </div>
                        <div className="kpi-body">
                          <span className="kpi-value" style={{ fontSize:22, color:deColor }}>{fmtN(de)}</span>
                          <div className="kpi-sparkline">
                            <svg viewBox="0 0 80 30" preserveAspectRatio="none">
                              {de <= deBench
                                ? <polyline points="0,22 20,18 40,13 60,9 80,5"  fill="none" stroke={deColor} strokeWidth="2" strokeLinecap="round"/>
                                : <polyline points="0,8  20,12 40,16 60,21 80,25" fill="none" stroke={deColor} strokeWidth="2" strokeLinecap="round"/>}
                            </svg>
                          </div>
                        </div>
                        <div className="kpi-footer"><span>Sektör ort: {fmtN(deBench)}</span></div>
                      </div>
                    </div>

                    {/* ── Row 2: Chart + Rating ──────────────────────── */}
                    <div className="content-grid">

                      {/* Sol: Finansal bar chart — dönem × metrik */}
                      {(() => {
                        const sorted4 = [...entityAnalyses]
                          .sort((a, b) => a.year - b.year || a.period.localeCompare(b.period))
                          .slice(-4)
                        const PERIOD_S: Record<string,string> = { ANNUAL:'', Q1:'Q1', Q2:'Q2', Q3:'Q3', Q4:'Q4' }
                        const periods: BarPeriod[] = sorted4.map(a => {
                          const fd = a.financialData as FinData | undefined
                          const p  = PERIOD_S[a.period] ?? a.period
                          const lbl = p ? `${a.year}/${p}` : String(a.year)
                          const totalDebt = ((fd?.totalCurrentLiabilities ?? 0) + (fd?.totalNonCurrentLiabilities ?? 0)) || null
                          return chartTab === 'gelir'
                            ? { label: lbl, primary: fd?.revenue ?? null,     secondary: fd?.ebit ?? null }
                            : { label: lbl, primary: totalDebt,                secondary: fd?.totalEquity ?? null }
                        })
                        const pLabel = chartTab === 'gelir' ? 'Net Satışlar'  : 'Toplam Borç'
                        const sLabel = chartTab === 'gelir' ? 'Faaliyet Karı' : 'Özsermaye'
                        return (
                          <BarMetricChart
                            periods={periods}
                            primaryLabel={pLabel}
                            secondaryLabel={sLabel}
                            tab={chartTab}
                            onTab={setChartTab}
                          />
                        )
                      })()}

                      {/* Sağ sidebar: Kredi Derecelendirme */}
                      {(() => {
                        const ratingColor: Record<string, { bg: string; text: string; border: string; glow: string }> = {
                          AAA: { bg: '#e4f6f5', text: '#0B7A72', border: '#2EC4B6', glow: 'rgba(46,196,182,0.25)' },
                          AA:  { bg: '#e9f7f6', text: '#1aab9e', border: '#4ECFC4', glow: 'rgba(46,196,182,0.20)' },
                          A:   { bg: '#edf8f7', text: '#2EC4B6', border: '#7de0d9', glow: 'rgba(46,196,182,0.15)' },
                          BBB: { bg: '#e8f0f6', text: '#0B3C5D', border: '#7BA8C4', glow: 'rgba(11,60,93,0.18)' },
                          BB:  { bg: '#f0f5f8', text: '#5A7A96', border: '#9BB5C8', glow: 'rgba(11,60,93,0.10)' },
                          B:   { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5', glow: 'rgba(220,38,38,0.15)' },
                          CCC: { bg: '#fef2f2', text: '#b91c1c', border: '#f87171', glow: 'rgba(185,28,28,0.20)' },
                        }
                        const rc = ratingColor[activeRating] ?? ratingColor['BB']
                        const riskColor = activeRating === 'AAA' || activeRating === 'AA' || activeRating === 'A'
                          ? '#2EC4B6' : activeRating === 'BBB' ? '#0B3C5D'
                          : activeRating === 'BB' ? '#5A7A96'
                          : '#dc2626'
                        return (
                        <div className="sidebar-stack">
                          <div className="card card-rating" style={{ overflow: 'hidden' }}>
                            {/* Renkli üst şerit */}
                            <div style={{ height: 4, background: `linear-gradient(90deg, ${rc.text}, ${rc.border})`, margin: '-1px -1px 0' }} />
                            <div className="card-head" style={{ paddingBottom: 10 }}>
                              <h2 className="card-title">Kredi Derecelendirme</h2>
                            </div>
                            <div className="card-body" style={{ paddingTop: 0 }}>
                              {/* Büyük derecelendirme badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                <div style={{
                                  background: rc.bg, color: rc.text, border: `2px solid ${rc.border}`,
                                  borderRadius: 12, padding: '6px 18px',
                                  fontSize: 26, fontWeight: 800, letterSpacing: 1,
                                  boxShadow: `0 4px 16px ${rc.glow}`,
                                  lineHeight: 1.2,
                                }}>
                                  {cr}
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Risk Seviyesi</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: riskColor }}>
                                    {RISK_LABEL[activeRating] ?? '—'}
                                  </div>
                                </div>
                              </div>

                              {/* Rating ölçeği */}
                              <div className="rating-scale" style={{ marginBottom: 14, marginTop: 0 }}>
                                {RATING_SCALE.map(rt => (
                                  <div key={rt}
                                    className={clsx('rating-pill', (activeRating === rt || cr === rt) && 'active')}
                                    data-rating={rt}>
                                    {rt === activeRating ? cr : rt}
                                  </div>
                                ))}
                              </div>

                              {/* Detaylar */}
                              <div className="rating-info">
                                {[
                                  { label: 'EBITDA Marjı',   val: r.ebitdaMargin,     fmt: (v: number) => fmtPct(v) },
                                  { label: 'Net Kâr Marjı',  val: r.netProfitMargin,  fmt: (v: number) => fmtPct(v) },
                                  { label: 'Faiz Karşılama', val: r.interestCoverage === Infinity ? null : r.interestCoverage, fmt: (v: number) => `${v.toFixed(1)}x`, special: r.interestCoverage === Infinity ? '∞x' : null },
                                ].map(({ label, val, fmt, special }) => {
                                  const display = special ?? (val != null ? fmt(val) : '—')
                                  const isNeg   = val != null && val < 0
                                  const isPos   = special != null || (val != null && val > 0)
                                  return (
                                    <div key={label} className="rating-detail">
                                      <span className="rating-detail-label">{label}</span>
                                      <span className="rating-detail-value" style={{
                                        color: isNeg ? '#dc2626' : isPos ? '#059669' : '#0B3C5D',
                                        fontSize: 13,
                                      }}>
                                        {display}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        )
                      })()}

                    </div>{/* /content-grid */}

                    <InsufficientBanner categories={selected?.insufficientCategories} />
                    <CoverageBanner coverage={selected?.overallCoverage} />
                    <SubjectiveMissingBanner missing={selected?.entity?.id ? subjectiveMissing[selected.entity.id] : undefined} />

                    {/* ── Row 3: Aktif & Pasif Dağılımı ──────────────── */}
                    {fd && (
                      <div style={{ display:'flex', gap:16 }}>
                        {/* Aktif Dağılımı */}
                        {(() => {
                          const duran   = fd.totalNonCurrentAssets ?? 0
                          const nakit   = fd.cash ?? 0
                          const alacak  = fd.tradeReceivables ?? 0
                          const stok    = fd.inventory ?? 0
                          const diger   = Math.max(0, (fd.totalCurrentAssets ?? 0) - nakit - alacak - stok)
                          const segs = [
                            { label:'Duran Varlıklar',    value: duran,  color:'#1e3a8a' },
                            { label:'Ticari Mallar/Stok',  value: stok,   color:'#f59e0b' },
                            { label:'Ticari Alacaklar',    value: alacak, color:'#0ea5e9' },
                            { label:'Nakit & Benzerleri',  value: nakit,  color:'#6366f1' },
                            { label:'Diğer Dönen',         value: diger,  color:'#2dd4bf' },
                          ].filter(s => s.value > 0)
                          const realTotal = fd.totalAssets ?? (duran + (fd.totalCurrentAssets ?? (nakit + alacak + stok + diger)))
                          return <DonutSegChart title="Aktif Dağılımı" totalLabel="Toplam Aktif" segments={segs} displayTotal={realTotal}/>
                        })()}

                        {/* Pasif Dağılımı */}
                        {(() => {
                          const kvBorc  = fd.totalCurrentLiabilities ?? 0
                          const uvBorc  = fd.totalNonCurrentLiabilities ?? 0
                          const ozkay   = fd.totalEquity ?? 0
                          const segs = [
                            { label:'Kısa Vadeli Borç',   value: kvBorc, color:'#ef4444' },
                            { label:'Uzun Vadeli Borç',   value: uvBorc, color:'#f87171' },
                            { label:'Özkaynaklar',         value: ozkay,  color:'#10b981' },
                          ].filter(s => s.value > 0)
                          const realPasif = fd.totalAssets ?? (kvBorc + uvBorc + ozkay)
                          return <DonutSegChart title="Pasif Dağılımı" totalLabel="Toplam Pasif" segments={segs} displayTotal={realPasif}/>
                        })()}
                      </div>
                    )}

                  </div>
                  )
                })()}

                {/* ── RASYOLAR ────────────────── */}
                {activeTab === 'ratios' && (
                  <div className="card" style={{ overflow: 'visible' }}>
                    <InsufficientBanner categories={selected?.insufficientCategories} />
                    <CoverageBanner coverage={selected?.overallCoverage} />
                    <SubjectiveMissingBanner missing={selected?.entity?.id ? subjectiveMissing[selected.entity.id] : undefined} />
                    {/* Başlık */}
                    <div className="card-head">
                      <div className="card-head-left">
                        <h4 className="card-title">Finansal Oran Analizi</h4>
                        <p className="card-desc">{ratioSections.reduce((s, sec) => s + sec.rows.length, 0)} rasyo · Tümü</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                        Sektör: {bm.label} · TCMB Sektör Ort.
                      </span>
                    </div>

                    <div className="card-body !p-0 mt-4">
                      <table className="fin-table">
                        <thead>
                          <tr>
                            <th>Oran</th>
                            <th className="text-right">Firma Değeri</th>
                            <th className="text-right">Sektör Ort.</th>
                            <th className="text-center">Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ratioSections.map(sec => (
                            <React.Fragment key={sec.label}>
                              {/* Kategori Satırı */}
                              <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                                <td colSpan={4} className="py-2 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: sec.color }} />
                                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: sec.color }}>
                                      {sec.label}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {/* Rasyo Satırları */}
                              {sec.rows.map(row => (
                                <tr key={row.id}>
                                  <td className="indicator-name px-4"><RatioInfoCell label={row.id} desc={row.desc} /></td>
                                  <td className="indicator-val text-right px-4 font-mono">{row.val}</td>
                                  <td className="indicator-avg text-right px-4 font-mono">{row.avg}</td>
                                  <td className="text-center px-4">
                                    {row.val !== '—' && (
                                      <span className={clsx(
                                        "status-chip",
                                        row.good ? "status-great" : "status-bad"
                                      )}>
                                        {row.good ? 'İyi' : 'Zayıf'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── SENARYO ─────────────────── */}
                {activeTab === 'scenario' && (
                  <div className="space-y-5">
                    <div className="card overflow-hidden">
                      <div className="card-head">
                        <div className="card-head-left">
                          <h4 className="card-title">Senaryo Simülatörü</h4>
                          <p className="card-desc">Finansal kalemleri değiştirerek skor etkisini anlık görün</p>
                        </div>
                      </div>
                      <div className="card-body">
                        <WhatIfSimulator
                          baseData={selected.ratios ?? {}}
                          baseScore={cs}
                          rawFinancialData={selected.financialData as Record<string, number | null> | undefined}
                        />
                      </div>
                    </div>
                    <div className="card overflow-hidden">
                      <div className="card-head">
                        <div className="card-head-left">
                          <h4 className="card-title">Hedef Nota Ulaş</h4>
                          <p className="card-desc">Hangi iyileştirme en çok puan kazandırır?</p>
                        </div>
                      </div>
                      <div className="card-body">
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
                  <SubjectiveForm
                    entityId={selected.entity.id}
                    onScoreChange={(total) => {
                      if (selected.entity?.id) {
                        setSubjectiveScores(prev => ({ ...prev, [selected.entity!.id]: total }))
                        setSubjectiveMissing(prev => ({ ...prev, [selected.entity!.id]: false }))
                      }
                    }}
                  />
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

              </div>
          </div>
        )}
      </div>
    </div>
    </FinrateShell>
  )
}

export default function AnalizPage() {
  return (
    <Suspense
      fallback={
        <FinrateShell>
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-cyan-600" />
          </div>
        </FinrateShell>
      }
    >
      <AnalizPageContent />
    </Suspense>
  )
}
