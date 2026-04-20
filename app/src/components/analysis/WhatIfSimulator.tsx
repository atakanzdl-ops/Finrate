'use client'

import { useState, useMemo } from 'react'
import { Sliders, ChevronDown, ChevronUp,
         Zap, Target, BarChart2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { calculateScore, getRatingMinimum, scoreToRating } from '@/lib/scoring/score'
import type { RatioResult } from '@/lib/scoring/ratios'

interface Props {
  baseData: Record<string, number | null>
  baseScore: number
  rawFinancialData?: Record<string, number | null>  // TL tutarları için
}

// ─── Kaldıraç tanımları ───────────────────────────────────
const LEVERS = [
  { key: 'cash',                   label: 'Nakit Artışı',         category: 'Aktif',  primaryRatio: 'cashRatio',              primaryLabel: 'Nakit Oranı' },
  { key: 'tradeReceivables',       label: 'Alacak Tahsilatı',     category: 'Aktif',  primaryRatio: 'receivablesTurnoverDays', primaryLabel: 'Alacak Devir (gün)' },
  { key: 'inventory',              label: 'Stok Optimizasyonu',   category: 'Aktif',  primaryRatio: 'inventoryTurnoverDays',   primaryLabel: 'Stok Devir (gün)' },
  { key: 'shortTermFinancialDebt', label: 'KV Borç Azaltma',      category: 'Pasif',  primaryRatio: 'debtToEquity',            primaryLabel: 'Borç/Özkaynak' },
  { key: 'longTermFinancialDebt',  label: 'UV Borç Azaltma',      category: 'Pasif',  primaryRatio: 'debtToAssets',            primaryLabel: 'Borç/Aktif' },
  { key: 'debtMigration',          label: 'KV→UV Borç Dönüşümü', category: 'Pasif',  primaryRatio: 'currentRatio',            primaryLabel: 'Cari Oran' },
  { key: 'tradePayables',          label: 'Tedarikçi Borçları',   category: 'Pasif',  primaryRatio: 'payablesTurnoverDays',    primaryLabel: 'Borç Devir (gün)' },
  { key: 'totalEquity',            label: 'Sermaye Artırımı',     category: 'Pasif',  primaryRatio: 'equityRatio',             primaryLabel: 'Özkaynak Oranı' },
  { key: 'revenue',                label: 'Ciro Artışı',          category: 'Gelir',  primaryRatio: 'assetTurnover',           primaryLabel: 'Aktif Devir' },
  { key: 'ebitda',                 label: 'FAVÖK İyileştirme',    category: 'Gelir',  primaryRatio: 'ebitdaMargin',            primaryLabel: 'FAVÖK Marjı' },
  { key: 'netProfit',              label: 'Net Kar İyileştirme',  category: 'Gelir',  primaryRatio: 'netProfitMargin',         primaryLabel: 'Net Kâr Marjı' },
  { key: 'cogs',                   label: 'Maliyet Azaltma (SMM)', category: 'Gelir', primaryRatio: 'grossMargin',             primaryLabel: 'Brüt Kâr Marjı' },
]

// ─── Hızlı Senaryo tanımları ──────────────────────────────
const PRESET_SCENARIOS: Array<{ id: string; label: string; desc: string; color: string; changes: Record<string, number> }> = [
  {
    id: 'conservative',
    label: 'Muhafazakar',
    desc: 'Risksiz, mevcut yapıyla kademeli iyileşme',
    color: 'text-cyan-600 border-cyan-500/40 bg-cyan-500/8',
    changes: { ebitda: 10, shortTermFinancialDebt: -10, tradeReceivables: 15 },
  },
  {
    id: 'growth',
    label: 'Büyüme Odaklı',
    desc: 'Agresif büyüme — ciro + karlılık artışı',
    color: 'text-emerald-600 border-emerald-500/40 bg-emerald-500/8',
    changes: { revenue: 25, ebitda: 20, totalEquity: 15 },
  },
  {
    id: 'debt_restructuring',
    label: 'Borç Yapılandırma',
    desc: 'Kısa vadeli borçları erteleyerek likidite iyileştir',
    color: 'text-[#0B3C5D] border-[#0B3C5D]/30 bg-[#0B3C5D]/5',
    changes: { shortTermFinancialDebt: -30, longTermFinancialDebt: -10, totalEquity: 20 },
  },
]

const CATEGORY_STYLES: Record<string, { header: string; slider: string }> = {
  Aktif: { header: 'text-cyan-700 border-cyan-500/30 bg-cyan-500/6',    slider: 'accent-cyan-500' },
  Pasif: { header: 'text-[#0B3C5D] border-[#0B3C5D]/20 bg-[#0B3C5D]/5', slider: 'accent-slate-500' },
  Gelir: { header: 'text-emerald-700 border-emerald-500/30 bg-emerald-500/6', slider: 'accent-emerald-500' },
}

const RATING_ORDER = ['D', 'C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']
const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-600', AA: 'text-emerald-600', A: 'text-green-600',
  BBB: 'text-teal-500', BB: 'text-slate-500', B: 'text-red-400',
  CCC: 'text-red-500', CC: 'text-red-500', C: 'text-red-600', D: 'text-red-700',
}

// ─── Rasyo uygulama fonksiyonu ────────────────────────────
// Varsayılan başlangıç değerleri — null olan oranlar için fallback
const RATIO_DEFAULTS: Record<string, number> = {
  cashRatio: 0.1, currentRatio: 1.0, quickRatio: 0.7,
  debtToEquity: 2.0, debtToAssets: 0.6, debtToEbitda: 4.0,
  equityRatio: 0.4, shortTermDebtRatio: 0.6,
  interestCoverage: 1.5, netWorkingCapitalRatio: 0.1,
  grossMargin: 0.15, ebitdaMargin: 0.08, ebitMargin: 0.05,
  netProfitMargin: 0.03, roa: 0.04, roe: 0.08, roic: 0.06,
  assetTurnover: 0.8, inventoryTurnoverDays: 90, receivablesTurnoverDays: 60,
  payablesTurnoverDays: 30, fixedAssetTurnover: 1.0, operatingExpenseRatio: 0.3,
  cashConversionCycle: 80,
}

function applyLevers(
  base: Record<string, number | null>,
  changes: Record<string, number>,
): RatioResult {
  const m: Record<string, number | null> = { ...base }

  // null olan oranları varsayılan ile doldur — simülasyon için gerekli
  for (const [k, def] of Object.entries(RATIO_DEFAULTS)) {
    if (m[k] == null) m[k] = def
  }

  function adj(k: string, mult: number) {
    const v = m[k]
    if (v != null) m[k] = v * mult
  }

  for (const [key, pct] of Object.entries(changes)) {
    if (pct === 0) continue
    const up = 1 + pct / 100
    const dn = 1 - pct / 100
    switch (key) {
      case 'cash':
        adj('cashRatio', up); adj('currentRatio', 1 + pct / 100 * 0.25); adj('quickRatio', 1 + pct / 100 * 0.25); break
      case 'tradeReceivables':
        adj('receivablesTurnoverDays', dn); adj('cashConversionCycle', 1 - pct / 100 * 0.4); adj('cashRatio', 1 + pct / 100 * 0.2); break
      case 'inventory':
        adj('inventoryTurnoverDays', dn); adj('cashConversionCycle', 1 - pct / 100 * 0.4); break
      case 'shortTermFinancialDebt':
        adj('debtToEquity', dn); adj('debtToAssets', 1 - pct / 100 * 0.6); adj('shortTermDebtRatio', dn);
        adj('currentRatio', 1 + pct / 100 * 0.4); adj('quickRatio', 1 + pct / 100 * 0.3); adj('interestCoverage', 1 + pct / 100 * 0.4); break
      case 'longTermFinancialDebt':
        adj('debtToAssets', 1 - pct / 100 * 0.4); adj('debtToEbitda', dn); adj('interestCoverage', 1 + pct / 100 * 0.5); adj('equityRatio', 1 + pct / 100 * 0.2); break
      case 'tradePayables':
        adj('payablesTurnoverDays', up); adj('cashConversionCycle', 1 - pct / 100 * 0.2); break
      case 'totalEquity':
        adj('equityRatio', up); adj('debtToEquity', dn); adj('debtToAssets', 1 - pct / 100 * 0.3); adj('roa', 1 + pct / 100 * 0.1); break
      case 'revenue':
        adj('assetTurnover', up); adj('grossMargin', 1 + pct / 100 * 0.15); adj('ebitdaMargin', 1 + pct / 100 * 0.15);
        adj('netProfitMargin', 1 + pct / 100 * 0.1); adj('roa', 1 + pct / 100 * 0.15); adj('roe', 1 + pct / 100 * 0.15); adj('debtToEbitda', 1 - pct / 100 * 0.5); break
      case 'ebitda':
        adj('ebitdaMargin', up); adj('ebitMargin', 1 + pct / 100 * 0.8); adj('debtToEbitda', dn);
        adj('interestCoverage', up); adj('roa', 1 + pct / 100 * 0.6); adj('roe', 1 + pct / 100 * 0.6); adj('roic', 1 + pct / 100 * 0.6); break
      case 'netProfit':
        adj('netProfitMargin', up); adj('roa', up); adj('roe', up); adj('roic', 1 + pct / 100 * 0.7); break
      case 'cogs':
        // Maliyet azaltma: SMM düşer → brüt marj, FAVÖK marjı, net kar marjı artar
        adj('grossMargin', 1 + pct / 100 * 0.8); adj('ebitdaMargin', 1 + pct / 100 * 0.7);
        adj('ebitMargin', 1 + pct / 100 * 0.7); adj('netProfitMargin', 1 + pct / 100 * 0.6);
        adj('roa', 1 + pct / 100 * 0.6); adj('roe', 1 + pct / 100 * 0.6); adj('roic', 1 + pct / 100 * 0.5); break
      case 'debtMigration':
        // KV borçlar UV'ye taşınır: toplam borç değişmez, likidite oranları iyileşir
        adj('currentRatio', 1 + pct / 100 * 0.6); adj('quickRatio', 1 + pct / 100 * 0.5);
        adj('shortTermDebtRatio', 1 - pct / 100 * 0.5); adj('netWorkingCapitalRatio', 1 + pct / 100 * 0.4); break
    }
  }
  return m as unknown as RatioResult
}

function fmtRatio(val: number | null | undefined, key: string): string {
  if (val == null) return '—'
  if (key.includes('Days')) return Math.round(val) + ' gün'
  if (Math.abs(val) <= 2) return (val * 100).toFixed(1) + '%'
  return val.toFixed(2)
}

// ─── Otomatik optimizasyon ────────────────────────────────
const MAX_SINGLE_PCT = 300

function getBaseFinancialScore(baseData: Record<string, number | null>): number {
  return calculateScore(applyLevers(baseData, {})).finalScore
}

function findMinChange(
  baseData: Record<string, number | null>,
  leverKey: string,
  financialTargetScore: number,
): { achievable: boolean; minPct: number } {
  const test = (pct: number) => calculateScore(applyLevers(baseData, { [leverKey]: pct })).finalScore
  if (test(MAX_SINGLE_PCT) < financialTargetScore) return { achievable: false, minPct: MAX_SINGLE_PCT }
  let lo = 1, hi = MAX_SINGLE_PCT
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (test(mid) >= financialTargetScore) hi = mid
    else lo = mid + 1
  }
  return { achievable: true, minPct: lo }
}

function sensitivityAt10(
  baseData: Record<string, number | null>,
  leverKey: string,
  _baseScore: number,
): number {
  const bfs = getBaseFinancialScore(baseData)
  return (calculateScore(applyLevers(baseData, { [leverKey]: 10 })).finalScore - bfs) * 0.70
}

// Bir sonraki rating için hedef skor (header display için)
function nextRatingTarget(rating: string): { label: string; targetScore: number } | null {
  const idx = RATING_ORDER.indexOf(rating)
  if (idx >= RATING_ORDER.length - 1) return null
  const nextRating = RATING_ORDER[idx + 1]
  return { label: nextRating, targetScore: getRatingMinimum(nextRating) }
}

// +1 ve +2 not hedefleri
function ratingTargets(rating: string): Array<{ label: string; targetScore: number; levels: number }> {
  const idx = RATING_ORDER.indexOf(rating)
  const results: Array<{ label: string; targetScore: number; levels: number }> = []
  for (let i = 1; i <= 2; i++) {
    if (idx + i >= RATING_ORDER.length) break
    const next = RATING_ORDER[idx + i]
    results.push({ label: next, targetScore: getRatingMinimum(next), levels: i })
  }
  return results
}

// ─── Greedy kombinasyon yolu ─────────────────────────────
// baseFinancialScore ve financialTargetScore finansal puan cinsinden
function findCombinationPath(
  baseData: Record<string, number | null>,
  baseFinancialScore: number,
  financialTargetScore: number,
): Array<{ lever: typeof LEVERS[number]; pct: number }> {
  const accumulated: Record<string, number> = {}
  const result: Array<{ lever: typeof LEVERS[number]; pct: number }> = []
  let currentFinancialScore = baseFinancialScore
  const testPcts = [10, 25, 50, 100, 150, 200, 300]

  for (let step = 0; step < 6 && currentFinancialScore < financialTargetScore; step++) {
    let bestGain = 0
    let bestLever: typeof LEVERS[number] | null = null
    let bestPct = 0

    for (const lever of LEVERS) {
      if (accumulated[lever.key] != null) continue
      for (const pct of testPcts) {
        const score = calculateScore(applyLevers(baseData, { ...accumulated, [lever.key]: pct })).finalScore
        const gain = score - currentFinancialScore
        if (gain > bestGain) { bestGain = gain; bestLever = lever; bestPct = pct }
      }
    }

    if (!bestLever || bestGain < 0.05) break
    accumulated[bestLever.key] = bestPct
    result.push({ lever: bestLever, pct: bestPct })
    currentFinancialScore = calculateScore(applyLevers(baseData, accumulated)).finalScore
  }

  return result
}

// ─── Ana Bileşen ──────────────────────────────────────────
export function WhatIfSimulator({ baseData, baseScore, rawFinancialData }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<'auto' | 'scenarios' | 'custom' | 'sensitivity'>('auto')
  const [changes, setChanges] = useState<Record<string, number>>(
    () => Object.fromEntries(LEVERS.map((l) => [l.key, 0]))
  )
  const [activePreset, setActivePreset] = useState<string | null>(null)

  const currentRating = scoreToRating(baseScore)
  const nextTarget = nextRatingTarget(currentRating)
  const neededPoints = nextTarget ? nextTarget.targetScore - baseScore : 0

  // Finansal baz skor (combined değil; delta hesabında kullanılır)
  const baseFinancialScore = useMemo(() => getBaseFinancialScore(baseData), [baseData])

  // Simülasyon sonucu
  const simResult = useMemo(() => {
    return calculateScore(applyLevers(baseData, changes))
  }, [baseData, changes])

  // Delta: finansal iyileşmeyi combined score alanına çevir (×0.70)
  const delta = (simResult.finalScore - baseFinancialScore) * 0.70
  // Simülasyon skoru: combined bazından delta ekle
  const simCombinedScore = Math.round(Math.min(100, Math.max(0, baseScore + delta)))
  const simCombinedRating = scoreToRating(simCombinedScore)

  // Otomatik optimizasyon: +1 ve +2 not için minimum değişimler
  const allAutoPaths = useMemo(() => {
    const targets = ratingTargets(currentRating)
    return targets.map(target => {
      // Combined hedefi finansal hedef skoruna çevir
      const combinedGapNeeded = target.targetScore - baseScore
      const financialTarget = baseFinancialScore + combinedGapNeeded / 0.70

      const singlePaths = LEVERS.map(lever => {
        const { achievable, minPct } = findMinChange(baseData, lever.key, financialTarget)
        return { lever, achievable, minPct }
      })
        .filter(p => p.achievable)
        .sort((a, b) => a.minPct - b.minPct)
        .slice(0, 4)

      // Tek kaldıraç yetmiyorsa kombinasyon hesapla
      const combo = singlePaths.length === 0
        ? findCombinationPath(baseData, baseFinancialScore, financialTarget)
        : []

      return { target, singlePaths, combo } as {
        target: { label: string; targetScore: number; levels: number }
        singlePaths: { lever: typeof LEVERS[number]; minPct: number }[]
        combo: { lever: typeof LEVERS[number]; pct: number }[]
      }
    })
  }, [baseData, currentRating, baseScore, baseFinancialScore])

  // Hassasiyet analizi
  const sensitivity = useMemo(() => {
    return LEVERS.map(lever => ({
      lever,
      gain: sensitivityAt10(baseData, lever.key, baseScore),
    }))
      .sort((a, b) => b.gain - a.gain)
  }, [baseData, baseScore])

  function applyPreset(id: string) {
    const preset = PRESET_SCENARIOS.find(s => s.id === id)
    if (!preset) return
    const newChanges = Object.fromEntries(LEVERS.map(l => [l.key, 0]))
    Object.entries(preset.changes).forEach(([k, v]) => { newChanges[k] = v })
    setChanges(newChanges)
    setActivePreset(id)
  }

  function setChange(key: string, value: number) {
    setChanges(prev => ({ ...prev, [key]: value }))
    setActivePreset(null)
  }

  function resetAll() {
    setChanges(Object.fromEntries(LEVERS.map(l => [l.key, 0])))
    setActivePreset(null)
  }

  const hasChanges = Object.values(changes).some(v => v !== 0)

  // TL tutarı hesabı (sermaye için)
  function tlAmount(leverKey: string, pct: number): string | null {
    if (!rawFinancialData || pct === 0) return null
    const base = rawFinancialData[leverKey]
    if (base == null) return null
    const amount = Math.abs(base * pct / 100)
    if (amount >= 1_000_000) return `≈₺${(amount / 1_000_000).toFixed(1)}M`
    if (amount >= 1_000) return `≈₺${(amount / 1_000).toFixed(0)}K`
    return `≈₺${Math.round(amount)}`
  }

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-1 py-3 hover:bg-black/[0.03] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-cyan-600" />
          <p className="text-sm font-semibold text-[#0B3C5D]">Senaryo Simülatörü & Optimizasyon</p>
          {hasChanges && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 font-bold uppercase tracking-wider border border-cyan-500/20">Aktif</span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-[#94A3B8]" /> : <ChevronDown size={16} className="text-[#94A3B8]" />}
      </button>

      {expanded && (
        <div className="pt-2 space-y-4">

          {/* Skor Özeti */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/10 border border-white/5 backdrop-blur-sm">
            <div className="text-center">
              <p className="card-desc uppercase tracking-wider mb-1">Mevcut</p>
              <p className="text-2xl font-black text-[#0B3C5D] font-mono">{Math.round(baseScore)}</p>
              <p className={clsx('text-xs font-bold font-mono', RATING_COLOR[currentRating])}>{currentRating}</p>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className={clsx('text-lg font-black font-mono', delta > 0.5 ? 'text-emerald-600' : delta < -0.5 ? 'text-red-500' : 'text-[#94A3B8]')}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </div>
                {simCombinedRating !== currentRating && (
                  <div className={clsx('text-[9px] font-bold uppercase tracking-wider font-mono', RATING_COLOR[simCombinedRating])}>
                    {simCombinedRating}!
                  </div>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-[#94A3B8] uppercase tracking-wider mb-1">Simülasyon</p>
              <p className="text-2xl font-black text-[#0B3C5D]" style={{ fontFamily: 'Outfit,sans-serif' }}>{simCombinedScore}</p>
              <p className={clsx('text-xs font-bold', RATING_COLOR[simCombinedRating])}>{simCombinedRating}</p>
            </div>
          </div>

          {nextTarget && (
            <div className="px-3 py-2 rounded-lg bg-black/[0.03] border border-black/[0.05] flex items-center justify-between">
              <p className="text-xs text-[#5A7A96]">
                <span className={clsx('font-bold', RATING_COLOR[nextTarget.label])}>{nextTarget.label}</span>
                {' '}için <span className="text-[#0B3C5D] font-bold">+{neededPoints.toFixed(1)} puan</span> gerekiyor
              </p>
              {hasChanges && (
                <button onClick={resetAll} className="flex items-center gap-1 text-[10px] text-[#94A3B8] hover:text-[#5A7A96] transition-colors">
                  <RefreshCw size={10} /> Sıfırla
                </button>
              )}
            </div>
          )}

          {/* Tab seçici */}
          <div className="tab-group p-1">
            {[
              { id: 'auto',        icon: Target,    label: 'Otomatik' },
              { id: 'scenarios',   icon: Zap,       label: 'Senaryolar' },
              { id: 'custom',      icon: Sliders,   label: 'Özelleştir' },
              { id: 'sensitivity', icon: BarChart2, label: 'Etki' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={clsx(
                  'tab flex-1',
                   activeTab === tab.id && 'active'
                )}
              >
                <tab.icon size={11} className="mr-1.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── TAB: Otomatik Yol ─────────────────────────── */}
          {activeTab === 'auto' && (
            <div className="space-y-5">
              {allAutoPaths.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-4">Zaten maksimum notadasınız (AAA).</p>
              ) : (
                allAutoPaths.map(({ target, singlePaths, combo }) => (
                  <div key={target.label} className="space-y-2">
                    {/* Başlık */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8]">
                        +{target.levels} Not:
                      </span>
                      <span className={clsx('text-xs font-black', RATING_COLOR[target.label])}>
                        {currentRating} → {target.label}
                      </span>
                      <span className="text-[9px] text-[#94A3B8] ml-auto">
                        +{(target.targetScore - baseScore).toFixed(1)} puan
                      </span>
                    </div>

                    {singlePaths.length > 0 ? (
                      /* Tek kaldıraç yeterli */
                      <div className="space-y-1.5">
                        <p className="text-[9px] text-[#94A3B8] uppercase tracking-wider">Tek adımda ulaşmak için (herhangi birini seçin):</p>
                        {singlePaths.map(({ lever, minPct }, i) => {
                          const tl = tlAmount(lever.key, minPct)
                          const isHigh = minPct > 100
                          return (
                            <button
                              key={lever.key}
                              onClick={() => { setChange(lever.key, Math.min(minPct, MAX_SINGLE_PCT)); setActiveTab('custom') }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl border border-black/[0.08] hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all text-left group"
                            >
                              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black text-[#94A3B8] group-hover:text-[#0B3C5D] flex-shrink-0">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[#0B3C5D] group-hover:text-cyan-700 transition-colors">{lever.label}</p>
                                <p className="text-[10px] text-[#94A3B8] mt-0.5">
                                  <span className={clsx('font-bold', isHigh ? 'text-sky-500' : 'text-emerald-600')}>
                                    %{minPct} iyileştirme
                                    {isHigh && <span className="ml-1 opacity-70">(×{(minPct/100).toFixed(1)} kat)</span>}
                                  </span>
                                  {tl && <span className="ml-1.5 text-[#94A3B8]">{tl}</span>}
                                  <span className="ml-1.5">→ {lever.primaryLabel}</span>
                                </p>
                              </div>
                              <div className={clsx('text-xs font-black shrink-0', RATING_COLOR[target.label])}>
                                {target.label}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : combo.length > 0 ? (
                      /* Kombinasyon gerekiyor */
                      <div className="space-y-1.5">
                        <p className="text-[9px] text-[#94A3B8] uppercase tracking-wider">Birlikte uygulandığında hedefe ulaşılır:</p>
                        {combo.map(({ lever, pct }, i) => {
                          const tl = tlAmount(lever.key, pct)
                          const isHigh = pct > 100
                          return (
                            <button
                              key={lever.key}
                              onClick={() => { setChange(lever.key, Math.min(pct, MAX_SINGLE_PCT)); setActiveTab('custom') }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#0B3C5D]/15 hover:border-[#0B3C5D]/30 hover:bg-[#0B3C5D]/5 transition-all text-left group"
                            >
                              <div className="w-5 h-5 rounded-full bg-[#0B3C5D]/10 flex items-center justify-center text-[9px] font-black text-[#0B3C5D] flex-shrink-0">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[#0B3C5D] group-hover:text-[#0B3C5D] transition-colors">{lever.label}</p>
                                <p className="text-[10px] text-[#94A3B8] mt-0.5">
                                  <span className={clsx('font-bold', isHigh ? 'text-sky-500' : 'text-[#0B3C5D]')}>
                                    %{pct} iyileştirme
                                    {isHigh && <span className="ml-1 opacity-70">(×{(pct/100).toFixed(1)} kat)</span>}
                                  </span>
                                  {tl && <span className="ml-1.5 text-[#94A3B8]">{tl}</span>}
                                  <span className="ml-1.5">→ {lever.primaryLabel}</span>
                                </p>
                              </div>
                              <div className="text-[9px] text-[#0B3C5D] font-bold shrink-0">KOMBİNE</div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#94A3B8] pl-2">
                        Mevcut verilerle bu hedefe ulaşmak mümkün görünmüyor. Finansal verilerinizi tamamlayın.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── TAB: Senaryolar ───────────────────────────── */}
          {activeTab === 'scenarios' && (
            <div className="space-y-3">
              {PRESET_SCENARIOS.map(scenario => {
                const presetResult = calculateScore(applyLevers(baseData, scenario.changes))
                const presetDelta = presetResult.finalScore - baseScore
                const ratingChanged = presetResult.finalRating !== currentRating
                return (
                  <button
                    key={scenario.id}
                    onClick={() => applyPreset(scenario.id)}
                    className={clsx(
                      'w-full flex items-start justify-between p-4 rounded-xl border transition-all text-left',
                      activePreset === scenario.id
                        ? scenario.color + ' shadow-md'
                        : 'border-black/[0.08] bg-black/[0.02] hover:bg-black/[0.04]'
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-[#0B3C5D]">{scenario.label}</p>
                        {ratingChanged && (
                          <span className={clsx('text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border', scenario.color)}>
                            {presetResult.finalRating}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#94A3B8]">{scenario.desc}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {Object.entries(scenario.changes).map(([k, v]) => (
                          <span key={k} className="text-[9px] px-2 py-0.5 rounded bg-slate-100 text-[#5A7A96] border border-slate-200">
                            {LEVERS.find(l => l.key === k)?.label} {v > 0 ? '+' : ''}{v}%
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className={clsx('text-sm font-black', presetDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {presetDelta > 0 ? '+' : ''}{presetDelta.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-[#94A3B8]">{Math.round(presetResult.finalScore)}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── TAB: Özelleştir ───────────────────────────── */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {(['Aktif', 'Pasif', 'Gelir'] as const).map(cat => {
                const style = CATEGORY_STYLES[cat]
                return (
                  <div key={cat}>
                    <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border mb-2.5', style.header)}>
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {cat === 'Aktif' ? 'Aktif Tarafı' : cat === 'Pasif' ? 'Pasif Tarafı' : 'Gelir Tablosu'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {LEVERS.filter(l => l.category === cat).map(lever => {
                        const pct = changes[lever.key]
                        const before = baseData[lever.primaryRatio]
                        const after = before != null && pct !== 0
                          ? before * (1 + (lever.key.includes('Debt') || lever.key.includes('Payables') ? -pct : pct) / 100)
                          : null
                        const tl = tlAmount(lever.key, Math.abs(pct))
                        return (
                          <div key={lever.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[#5A7A96]">{lever.label}</p>
                              <div className="flex items-center gap-1.5 text-xs">
                                {before != null ? (
                                  <>
                                    <span className="text-[#94A3B8]">{lever.primaryLabel}:</span>
                                    <span className="text-[#5A7A96]">{fmtRatio(before, lever.primaryRatio)}</span>
                                    {after !== null && pct !== 0 && (
                                      <>
                                        <span className="text-[#94A3B8]">→</span>
                                        <span className={clsx('font-bold', after > before ? 'text-emerald-600' : 'text-red-500')}>
                                          {fmtRatio(after, lever.primaryRatio)}
                                        </span>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <span className={clsx('font-semibold', pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-[#94A3B8]')}>
                                    {pct !== 0 ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}
                                  </span>
                                )}
                                {tl && <span className="text-[#94A3B8] ml-1">{tl}</span>}
                              </div>
                            </div>
                              <input
                                type="range" min={-50} max={300} step={5} value={pct}
                                onChange={e => setChange(lever.key, Number(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none bg-black/10 cursor-pointer accent-cyan-500"
                              />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {hasChanges && (
                <button onClick={resetAll} className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#5A7A96] transition-colors">
                  <RefreshCw size={12} /> Tümünü sıfırla
                </button>
              )}
            </div>
          )}

          {/* ── TAB: Hassasiyet Analizi ──────────────────── */}
          {activeTab === 'sensitivity' && (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8]">
                Her kaldıracın %10 değişiminde kazandırılan puan (en etkili → az etkili):
              </p>
              {sensitivity.map(({ lever, gain }, i) => {
                const maxGain = sensitivity.find(s => s.gain > 0)?.gain || 1
                const barWidth = gain > 0 ? Math.min(100, (gain / maxGain) * 100) : 0
                const noData = gain === 0
                return (
                  <div key={lever.key} className={clsx('space-y-1', noData && 'opacity-40')}>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[#94A3B8] w-4">{i + 1}</span>
                        <span className="text-[#5A7A96]">{lever.label}</span>
                        {noData && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-[#94A3B8] font-bold border border-slate-200">Veri eksik</span>
                        )}
                      </div>
                      <span className={clsx('font-bold tabular-nums', gain >= 1 ? 'text-emerald-600' : gain >= 0.5 ? 'text-sky-500' : 'text-[#94A3B8]')}>
                        {noData ? '—' : `+${gain.toFixed(2)} puan`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all', gain >= 1 ? 'bg-emerald-500' : gain >= 0.5 ? 'bg-sky-400' : 'bg-black/10')}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <p className="text-[9px] text-[#94A3B8] pt-1">
                &quot;Veri eksik&quot; — bu kaldıraçlar için hesaplanamayan oranlar mevcut. Finansal verilerinizi tamamlayın.
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
