'use client'

import { useState, useMemo } from 'react'
import { Sliders, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'
import { calculateScore, scoreToRating } from '@/lib/scoring/score'
import type { RatioResult } from '@/lib/scoring/ratios'

interface Props {
  baseData: Record<string, number | null>
  baseScore: number
}

// Lever → etkilen birincil oran (gösterim için)
const LEVERS = [
  // Aktif tarafı
  { key: 'cash',                   label: 'Nakit Artışı',         category: 'Aktif',  primaryRatio: 'cashRatio',              primaryLabel: 'Nakit Oranı' },
  { key: 'tradeReceivables',       label: 'Alacak Tahsilatı',     category: 'Aktif',  primaryRatio: 'receivablesTurnoverDays', primaryLabel: 'Alacak Devir (gün)' },
  { key: 'inventory',              label: 'Stok Optimizasyonu',   category: 'Aktif',  primaryRatio: 'inventoryTurnoverDays',   primaryLabel: 'Stok Devir (gün)' },
  // Pasif tarafı
  { key: 'shortTermFinancialDebt', label: 'KV Borç Azaltma',      category: 'Pasif',  primaryRatio: 'debtToEquity',            primaryLabel: 'Borç/Özkaynak' },
  { key: 'longTermFinancialDebt',  label: 'UV Borç Azaltma',      category: 'Pasif',  primaryRatio: 'debtToAssets',            primaryLabel: 'Borç/Aktif' },
  { key: 'tradePayables',          label: 'Tedarikçi Borçları',   category: 'Pasif',  primaryRatio: 'payablesTurnoverDays',    primaryLabel: 'Borç Devir (gün)' },
  { key: 'totalEquity',            label: 'Sermaye Artırımı',     category: 'Pasif',  primaryRatio: 'equityRatio',             primaryLabel: 'Özkaynak Oranı' },
  // Gelir Tablosu
  { key: 'revenue',                label: 'Ciro Artışı',          category: 'Gelir',  primaryRatio: 'assetTurnover',           primaryLabel: 'Aktif Devir' },
  { key: 'ebitda',                 label: 'FAVÖK İyileştirme',    category: 'Gelir',  primaryRatio: 'ebitdaMargin',            primaryLabel: 'FAVÖK Marjı' },
  { key: 'netProfit',              label: 'Net Kar İyileştirme',  category: 'Gelir',  primaryRatio: 'netProfitMargin',         primaryLabel: 'Net Kâr Marjı' },
]

// Kategori renk tanımları — kategori skor halkaları ile uyumlu
const CATEGORY_STYLES: Record<string, { header: string; badge: string; slider: string }> = {
  Aktif: {
    header: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
    badge:  'bg-cyan-500/15 text-cyan-400',
    slider: 'accent-cyan-500',
  },
  Pasif: {
    header: 'text-purple-400 border-purple-500/30 bg-purple-500/5',
    badge:  'bg-purple-500/15 text-purple-400',
    slider: 'accent-purple-500',
  },
  Gelir: {
    header: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    badge:  'bg-emerald-500/15 text-emerald-400',
    slider: 'accent-emerald-500',
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  Aktif: 'Aktif Tarafı',
  Pasif: 'Pasif Tarafı',
  Gelir: 'Gelir Tablosu Tarafı',
}

const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-400', AA: 'text-emerald-400', A: 'text-green-400',
  BBB: 'text-lime-400',    BB: 'text-yellow-400',  B: 'text-orange-400',
  CCC: 'text-orange-500',  CC: 'text-red-400',     C: 'text-red-500', D: 'text-red-600',
}

function applyLevers(
  base: Record<string, number | null>,
  changes: Record<string, number>,
): RatioResult {
  const m: Record<string, number | null> = { ...base }

  function adj(k: string, mult: number) {
    const v = m[k]
    if (v != null) m[k] = v * mult
  }

  for (const [key, pct] of Object.entries(changes)) {
    if (pct === 0) continue
    const up = 1 + pct / 100   // büyüme katsayısı
    const dn = 1 - pct / 100   // azalma katsayısı (borç/alacak azaltma)

    switch (key) {
      case 'cash':
        // Nakit artışı → nakit oranı + likit oranlar iyileşir
        adj('cashRatio',    up)
        adj('currentRatio', 1 + pct / 100 * 0.25)
        adj('quickRatio',   1 + pct / 100 * 0.25)
        break
      case 'tradeReceivables':
        // Alacak tahsilatı → devir günü azalır (iyileşme)
        adj('receivablesTurnoverDays', dn)
        adj('cashConversionCycle',     1 - pct / 100 * 0.4)
        adj('cashRatio',               1 + pct / 100 * 0.2)
        adj('currentRatio',            1 + pct / 100 * 0.1)
        break
      case 'inventory':
        // Stok optimizasyonu → stok devir günü azalır
        adj('inventoryTurnoverDays', dn)
        adj('cashConversionCycle',   1 - pct / 100 * 0.4)
        break
      case 'shortTermFinancialDebt':
        // KV borç azaltma → D/E, D/A, KV oran azalır; cari oran iyileşir
        adj('debtToEquity',       dn)
        adj('debtToAssets',       1 - pct / 100 * 0.6)
        adj('shortTermDebtRatio', dn)
        adj('currentRatio',       1 + pct / 100 * 0.4)
        adj('quickRatio',         1 + pct / 100 * 0.3)
        adj('interestCoverage',   1 + pct / 100 * 0.4)
        break
      case 'longTermFinancialDebt':
        // UV borç azaltma → D/A, D/FAVÖK azalır; faiz karşılama iyileşir
        adj('debtToAssets',     1 - pct / 100 * 0.4)
        adj('debtToEbitda',     dn)
        adj('interestCoverage', 1 + pct / 100 * 0.5)
        adj('equityRatio',      1 + pct / 100 * 0.2)
        break
      case 'tradePayables':
        // Tedarikçi borç değişimi → borç devir günü
        adj('payablesTurnoverDays', up)
        adj('cashConversionCycle',  1 - pct / 100 * 0.2)
        break
      case 'totalEquity':
        // Sermaye artırımı → özkaynak oranı artar; D/E azalır
        adj('equityRatio',  up)
        adj('debtToEquity', dn)
        adj('debtToAssets', 1 - pct / 100 * 0.3)
        adj('roa',          1 + pct / 100 * 0.1)
        break
      case 'revenue':
        // Ciro artışı → aktif devir, marjlar, D/FAVÖK iyileşir
        adj('assetTurnover',   up)
        adj('grossMargin',     1 + pct / 100 * 0.15)
        adj('ebitdaMargin',    1 + pct / 100 * 0.15)
        adj('netProfitMargin', 1 + pct / 100 * 0.1)
        adj('roa',             1 + pct / 100 * 0.15)
        adj('roe',             1 + pct / 100 * 0.15)
        adj('debtToEbitda',    1 - pct / 100 * 0.5)
        break
      case 'ebitda':
        // FAVÖK artışı → tüm kârlılık ve faiz karşılama iyileşir
        adj('ebitdaMargin',    up)
        adj('ebitMargin',      1 + pct / 100 * 0.8)
        adj('debtToEbitda',    dn)
        adj('interestCoverage', up)
        adj('roa',              1 + pct / 100 * 0.6)
        adj('roe',              1 + pct / 100 * 0.6)
        adj('roic',             1 + pct / 100 * 0.6)
        break
      case 'netProfit':
        // Net kâr artışı → kârlılık oranları
        adj('netProfitMargin', up)
        adj('roa',             up)
        adj('roe',             up)
        adj('roic',            1 + pct / 100 * 0.7)
        break
    }
  }
  return m as unknown as RatioResult
}

/** Oran değerini okunabilir göster */
function fmtRatio(val: number | null | undefined, key: string): string {
  if (val == null) return '—'
  // Gün bazlı oranlar tam sayı
  if (key.includes('Days')) return Math.round(val).toString() + ' gün'
  // 0–1 arası → % göster
  if (Math.abs(val) <= 2) return (val * 100).toFixed(1) + '%'
  // Büyük sayı (oran > 2) → ondalık
  return val.toFixed(2)
}

export function WhatIfSimulator({ baseData, baseScore }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [changes, setChanges]   = useState<Record<string, number>>(
    () => Object.fromEntries(LEVERS.map((l) => [l.key, 0]))
  )

  const simResult = useMemo(() => {
    const modified = applyLevers(baseData, changes)
    return calculateScore(modified)
  }, [baseData, changes])

  const delta = simResult.finalScore - baseScore
  const deltaRating = simResult.finalRating !== scoreToRating(baseScore)

  function setChange(key: string, value: number) {
    setChanges((prev) => ({ ...prev, [key]: value }))
  }

  function resetAll() {
    setChanges(Object.fromEntries(LEVERS.map((l) => [l.key, 0])))
  }

  const hasChanges = Object.values(changes).some((v) => v !== 0)

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-cyan-400" />
          <p className="text-sm font-semibold text-white">Senaryo Simülasyonu (What-If)</p>
          {hasChanges && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
              Aktif
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Sonuç Özeti */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-white/40">Mevcut Skor</p>
                <p className="text-lg font-bold text-white">{Math.round(baseScore)}</p>
              </div>
              <div className="text-white/20">→</div>
              <div>
                <p className="text-xs text-white/40">Simülasyon Skoru</p>
                <p className="text-lg font-bold text-white">{Math.round(simResult.finalScore)}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end">
                {delta > 0.5 ? (
                  <TrendingUp size={14} className="text-emerald-400" />
                ) : delta < -0.5 ? (
                  <TrendingDown size={14} className="text-red-400" />
                ) : (
                  <Minus size={14} className="text-white/40" />
                )}
                <span className={clsx('text-sm font-bold',
                  delta > 0.5 ? 'text-emerald-400' : delta < -0.5 ? 'text-red-400' : 'text-white/40'
                )}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                </span>
              </div>
              {deltaRating && (
                <p className={clsx('text-base font-black mt-0.5', RATING_COLOR[simResult.finalRating] ?? 'text-white')}>
                  {simResult.finalRating}
                </p>
              )}
            </div>
          </div>

          {/* Kaldıraçlar — kategoriye göre renkli */}
          <div className="space-y-4">
            {(['Aktif', 'Pasif', 'Gelir'] as const).map((cat) => {
              const style = CATEGORY_STYLES[cat]
              return (
                <div key={cat}>
                  {/* Renkli kategori başlığı */}
                  <div className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border mb-2.5',
                    style.header,
                  )}>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {CATEGORY_LABELS[cat]}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {LEVERS.filter((l) => l.category === cat).map((lever) => {
                      const pct    = changes[lever.key]
                      const before = baseData[lever.primaryRatio]
                      const after  = before != null && pct !== 0
                        ? before * (1 + (lever.key.includes('Debt') || lever.key.includes('Payables') ? -pct : pct) / 100)
                        : null

                      return (
                        <div key={lever.key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-white/70">{lever.label}</p>
                            {/* Oran değeri — % yerine gerçek rakam */}
                            <div className="flex items-center gap-1.5 text-xs">
                              {before != null ? (
                                <>
                                  <span className="text-white/30">{lever.primaryLabel}:</span>
                                  <span className="text-white/60">{fmtRatio(before, lever.primaryRatio)}</span>
                                  {after !== null && pct !== 0 && (
                                    <>
                                      <span className="text-white/20">→</span>
                                      <span className={clsx(
                                        'font-bold',
                                        after > before ? 'text-emerald-400' : 'text-red-400'
                                      )}>
                                        {fmtRatio(after, lever.primaryRatio)}
                                      </span>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className={clsx(
                                  'font-semibold',
                                  pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-white/20'
                                )}>
                                  {pct !== 0 ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}
                                </span>
                              )}
                            </div>
                          </div>
                          <input
                            type="range"
                            min={-50}
                            max={100}
                            step={5}
                            value={pct}
                            onChange={(e) => setChange(lever.key, Number(e.target.value))}
                            className={clsx(
                              'w-full h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer',
                              style.slider,
                            )}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {hasChanges && (
            <button
              onClick={resetAll}
              className="text-xs text-white/40 hover:text-white/70 transition-colors underline"
            >
              Sıfırla
            </button>
          )}
        </div>
      )}
    </div>
  )
}
