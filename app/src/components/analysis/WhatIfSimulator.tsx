'use client'

import { useState, useMemo } from 'react'
import { Sliders, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
         Zap, Target, BarChart2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { calculateScore, scoreToRating } from '@/lib/scoring/score'
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
  { key: 'tradePayables',          label: 'Tedarikçi Borçları',   category: 'Pasif',  primaryRatio: 'payablesTurnoverDays',    primaryLabel: 'Borç Devir (gün)' },
  { key: 'totalEquity',            label: 'Sermaye Artırımı',     category: 'Pasif',  primaryRatio: 'equityRatio',             primaryLabel: 'Özkaynak Oranı' },
  { key: 'revenue',                label: 'Ciro Artışı',          category: 'Gelir',  primaryRatio: 'assetTurnover',           primaryLabel: 'Aktif Devir' },
  { key: 'ebitda',                 label: 'FAVÖK İyileştirme',    category: 'Gelir',  primaryRatio: 'ebitdaMargin',            primaryLabel: 'FAVÖK Marjı' },
  { key: 'netProfit',              label: 'Net Kar İyileştirme',  category: 'Gelir',  primaryRatio: 'netProfitMargin',         primaryLabel: 'Net Kâr Marjı' },
]

// ─── Hızlı Senaryo tanımları ──────────────────────────────
const PRESET_SCENARIOS = [
  {
    id: 'conservative',
    label: 'Muhafazakar',
    desc: 'Risksiz, mevcut yapıyla kademeli iyileşme',
    color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
    changes: { ebitda: 10, shortTermFinancialDebt: -10, tradeReceivables: 15 },
  },
  {
    id: 'growth',
    label: 'Büyüme Odaklı',
    desc: 'Agresif büyüme — ciro + karlılık artışı',
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    changes: { revenue: 25, ebitda: 20, totalEquity: 15 },
  },
  {
    id: 'debt_restructuring',
    label: 'Borç Yapılandırma',
    desc: 'Kısa vadeli borçları erteleyerek likidite iyileştir',
    color: 'text-purple-400 border-purple-500/30 bg-purple-500/5',
    changes: { shortTermFinancialDebt: -30, longTermFinancialDebt: -10, totalEquity: 20 },
  },
]

const CATEGORY_STYLES: Record<string, { header: string; slider: string }> = {
  Aktif: { header: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',   slider: 'accent-cyan-500' },
  Pasif: { header: 'text-purple-400 border-purple-500/30 bg-purple-500/5', slider: 'accent-purple-500' },
  Gelir: { header: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', slider: 'accent-emerald-500' },
}

const RATING_ORDER = ['D', 'C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA']
const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-400', AA: 'text-emerald-400', A: 'text-green-400',
  BBB: 'text-lime-400', BB: 'text-yellow-400', B: 'text-orange-400',
  CCC: 'text-orange-500', CC: 'text-red-400', C: 'text-red-500', D: 'text-red-600',
}

// ─── Rasyo uygulama fonksiyonu ────────────────────────────
function applyLevers(
  base: Record<string, number | null>,
  changes: Record<string, number>,
): RatioResult {
  const m: Record<string, number | null> = { ...base }
  function adj(k: string, mult: number) {
    const v = m[k]; if (v != null) m[k] = v * mult
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
function findMinChange(
  baseData: Record<string, number | null>,
  leverKey: string,
  targetScore: number,
): { achievable: boolean; minPct: number } {
  const test = (pct: number) => calculateScore(applyLevers(baseData, { [leverKey]: pct })).finalScore
  if (test(100) < targetScore) return { achievable: false, minPct: 100 }
  let lo = 1, hi = 100
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (test(mid) >= targetScore) hi = mid
    else lo = mid + 1
  }
  return { achievable: true, minPct: lo }
}

function sensitivityAt10(
  baseData: Record<string, number | null>,
  leverKey: string,
  baseScore: number,
): number {
  return calculateScore(applyLevers(baseData, { [leverKey]: 10 })).finalScore - baseScore
}

// Bir sonraki rating için hedef skor
function nextRatingTarget(rating: string): { label: string; targetScore: number } | null {
  const idx = RATING_ORDER.indexOf(rating)
  if (idx >= RATING_ORDER.length - 1) return null

  // score.ts'deki RATING_BANDS tablosuna karşılık gelen eşikler
  const SCORE_FOR_RATING: Record<string, number> = {
    AAA: 92, AA: 84, A: 76, BBB: 68, BB: 60, B: 52, CCC: 44, CC: 36, C: 28, D: 0
  }
  const nextRating = RATING_ORDER[idx + 1]
  return { label: nextRating, targetScore: SCORE_FOR_RATING[nextRating] ?? 60 }
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

  // Simülasyon sonucu
  const simResult = useMemo(() => {
    return calculateScore(applyLevers(baseData, changes))
  }, [baseData, changes])

  const delta = simResult.finalScore - baseScore

  // Otomatik optimizasyon: her kaldıraç için minimum değişim
  const autoPaths = useMemo(() => {
    if (!nextTarget) return []
    return LEVERS.map(lever => {
      const { achievable, minPct } = findMinChange(baseData, lever.key, nextTarget.targetScore)
      return { lever, achievable, minPct }
    })
      .filter(p => p.achievable)
      .sort((a, b) => a.minPct - b.minPct)
      .slice(0, 5)
  }, [baseData, nextTarget])

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
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-cyan-400" />
          <p className="text-sm font-semibold text-white">Senaryo Simülatörü & Optimizasyon</p>
          {hasChanges && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold uppercase tracking-wider">Aktif</span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">

          {/* Skor Özeti */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-center">
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Mevcut</p>
              <p className="text-2xl font-black text-white">{Math.round(baseScore)}</p>
              <p className={clsx('text-xs font-bold', RATING_COLOR[currentRating])}>{currentRating}</p>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className={clsx('text-lg font-black', delta > 0.5 ? 'text-emerald-400' : delta < -0.5 ? 'text-red-400' : 'text-white/30')}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </div>
                {simResult.finalRating !== currentRating && (
                  <div className={clsx('text-[9px] font-bold uppercase tracking-wider', RATING_COLOR[simResult.finalRating])}>
                    {simResult.finalRating}!
                  </div>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Simülasyon</p>
              <p className="text-2xl font-black text-white">{Math.round(simResult.finalScore)}</p>
              <p className={clsx('text-xs font-bold', RATING_COLOR[simResult.finalRating])}>{simResult.finalRating}</p>
            </div>
          </div>

          {nextTarget && (
            <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
              <p className="text-xs text-white/50">
                <span className={clsx('font-bold', RATING_COLOR[nextTarget.label])}>{nextTarget.label}</span>
                {' '}için <span className="text-white font-bold">+{neededPoints.toFixed(1)} puan</span> gerekiyor
              </p>
              {hasChanges && (
                <button onClick={resetAll} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
                  <RefreshCw size={10} /> Sıfırla
                </button>
              )}
            </div>
          )}

          {/* Tab seçici */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            {[
              { id: 'auto',        icon: Target,    label: 'Otomatik Yol' },
              { id: 'scenarios',   icon: Zap,       label: 'Senaryolar' },
              { id: 'custom',      icon: Sliders,   label: 'Özelleştir' },
              { id: 'sensitivity', icon: BarChart2, label: 'Hassasiyet' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-white/40 hover:text-white/60'
                )}
              >
                <tab.icon size={11} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── TAB: Otomatik Yol ─────────────────────────── */}
          {activeTab === 'auto' && (
            <div className="space-y-3">
              {!nextTarget ? (
                <p className="text-xs text-white/40 text-center py-4">Zaten maksimum notadasınız (AAA).</p>
              ) : autoPaths.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-4">
                  {nextTarget.label} notasına tek kaldıraçla ulaşmak mümkün görünmüyor.<br />
                  Özelleştir sekmesinden kombinasyon deneyin.
                </p>
              ) : (
                <>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                    {nextTarget.label} notasına geçmek için minimum tek adım seçenekleri:
                  </p>
                  {autoPaths.map(({ lever, minPct }, i) => {
                    const tl = tlAmount(lever.key, minPct)
                    return (
                      <button
                        key={lever.key}
                        onClick={() => { setChange(lever.key, minPct); setActiveTab('custom') }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 hover:border-cyan-500/30 hover:bg-white/5 transition-all text-left group"
                      >
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white/60 group-hover:text-white flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">{lever.label}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            <span className="text-emerald-400 font-bold">%{minPct} değişim</span>
                            {tl && <span className="ml-1.5 text-white/30">{tl}</span>}
                            {' '}→ {lever.primaryLabel} etkili
                          </p>
                        </div>
                        <div className={clsx('text-xs font-black', RATING_COLOR[nextTarget.label])}>
                          {nextTarget.label}
                        </div>
                      </button>
                    )
                  })}
                </>
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
                        ? scenario.color + ' shadow-lg'
                        : 'border-white/10 bg-white/3 hover:bg-white/5'
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-white">{scenario.label}</p>
                        {ratingChanged && (
                          <span className={clsx('text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border', scenario.color)}>
                            {presetResult.finalRating}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/40">{scenario.desc}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {Object.entries(scenario.changes).map(([k, v]) => (
                          <span key={k} className="text-[9px] px-2 py-0.5 rounded bg-white/10 text-white/50">
                            {LEVERS.find(l => l.key === k)?.label} {v > 0 ? '+' : ''}{v}%
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className={clsx('text-sm font-black', presetDelta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {presetDelta > 0 ? '+' : ''}{presetDelta.toFixed(1)}
                      </p>
                      <p className="text-[10px] text-white/30">{Math.round(presetResult.finalScore)}</p>
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
                              <p className="text-xs text-white/70">{lever.label}</p>
                              <div className="flex items-center gap-1.5 text-xs">
                                {before != null ? (
                                  <>
                                    <span className="text-white/30">{lever.primaryLabel}:</span>
                                    <span className="text-white/60">{fmtRatio(before, lever.primaryRatio)}</span>
                                    {after !== null && pct !== 0 && (
                                      <>
                                        <span className="text-white/20">→</span>
                                        <span className={clsx('font-bold', after > before ? 'text-emerald-400' : 'text-red-400')}>
                                          {fmtRatio(after, lever.primaryRatio)}
                                        </span>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <span className={clsx('font-semibold', pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-white/20')}>
                                    {pct !== 0 ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}
                                  </span>
                                )}
                                {tl && <span className="text-white/20 ml-1">{tl}</span>}
                              </div>
                            </div>
                            <input
                              type="range" min={-50} max={100} step={5} value={pct}
                              onChange={e => setChange(lever.key, Number(e.target.value))}
                              className={clsx('w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer', style.slider)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {hasChanges && (
                <button onClick={resetAll} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
                  <RefreshCw size={12} /> Tümünü sıfırla
                </button>
              )}
            </div>
          )}

          {/* ── TAB: Hassasiyet Analizi ──────────────────── */}
          {activeTab === 'sensitivity' && (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                Her kaldıracın %10 değişiminde kazandırılan puan (en etkili → az etkili):
              </p>
              {sensitivity.map(({ lever, gain }, i) => {
                const barWidth = Math.min(100, (gain / (sensitivity[0]?.gain || 1)) * 100)
                return (
                  <div key={lever.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-white/30 w-4">{i + 1}</span>
                        <span className="text-white/70">{lever.label}</span>
                      </div>
                      <span className={clsx('font-bold tabular-nums', gain >= 1 ? 'text-emerald-400' : gain >= 0.5 ? 'text-yellow-400' : 'text-white/30')}>
                        {gain > 0 ? '+' : ''}{gain.toFixed(2)} puan
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all', gain >= 1 ? 'bg-emerald-500' : gain >= 0.5 ? 'bg-yellow-500' : 'bg-white/20')}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
