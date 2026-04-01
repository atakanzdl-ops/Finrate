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

// 10 finansal kaldıraç
const LEVERS = [
  // Aktif tarafı (3)
  { key: 'cash',              label: 'Nakit Artışı',            category: 'Aktif',   affects: ['cashRatio', 'currentRatio'] },
  { key: 'tradeReceivables',  label: 'Alacak Tahsilatı',        category: 'Aktif',   affects: ['receivablesTurnoverDays'] },
  { key: 'inventory',         label: 'Stok Optimizasyonu',      category: 'Aktif',   affects: ['inventoryTurnoverDays', 'currentRatio'] },
  // Pasif tarafı (4)
  { key: 'shortTermFinancialDebt', label: 'KV Borç Azaltma',   category: 'Pasif',   affects: ['debtToEquity', 'currentRatio'] },
  { key: 'longTermFinancialDebt',  label: 'UV Borç Azaltma',   category: 'Pasif',   affects: ['debtToEquity', 'debtToEbitda'] },
  { key: 'tradePayables',     label: 'Tedarikçi Borçları',      category: 'Pasif',   affects: ['payablesTurnoverDays'] },
  { key: 'totalEquity',       label: 'Sermaye Artırımı',        category: 'Pasif',   affects: ['equityRatio', 'debtToEquity'] },
  // Gelir tablosu (3)
  { key: 'revenue',           label: 'Ciro Artışı',             category: 'Gelir',   affects: ['netProfitMargin', 'assetTurnover'] },
  { key: 'ebitda',            label: 'FAVÖK İyileştirme',       category: 'Gelir',   affects: ['ebitdaMargin', 'debtToEbitda'] },
  { key: 'netProfit',         label: 'Net Kar İyileştirme',     category: 'Gelir',   affects: ['netProfitMargin', 'roe', 'roa'] },
]

const CATEGORY_COLORS: Record<string, string> = {
  Aktif: 'text-cyan-400 bg-cyan-500/10',
  Pasif: 'text-purple-400 bg-purple-500/10',
  Gelir: 'text-emerald-400 bg-emerald-500/10',
}

const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-400', AA: 'text-emerald-400', A: 'text-green-400',
  BBB: 'text-lime-400',    BB: 'text-yellow-400',  B: 'text-orange-400',
  CCC: 'text-orange-500',  CC: 'text-red-400',     C: 'text-red-500', D: 'text-red-600',
}

// Oran değişimi yüzdeden simüle et
function applyLevers(
  base: Record<string, number | null>,
  changes: Record<string, number>, // key -> % change (-50..+100)
): RatioResult {
  const modified = { ...base }
  for (const [key, pct] of Object.entries(changes)) {
    if (pct === 0) continue
    const current = base[key]
    if (current != null) {
      modified[key] = current * (1 + pct / 100)
    }
  }
  // Türetilmiş oranları yeniden hesapla
  // (calculateScore doğrudan ratio objesi bekliyor — base zaten ratio sonuçları)
  // Ama biz burada finansal girdi değil, ratio sonuçlarını değiştiriyoruz
  // Bu simülasyonda ratioları doğrudan modifiye ediyoruz
  return modified as unknown as RatioResult
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

          {/* Kaldıraçlar */}
          <div className="space-y-3">
            {(['Aktif', 'Pasif', 'Gelir'] as const).map((cat) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">{cat} Tarafı</p>
                <div className="space-y-2.5">
                  {LEVERS.filter((l) => l.category === cat).map((lever) => (
                    <div key={lever.key} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-white/70">{lever.label}</p>
                          <div className="flex items-center gap-1">
                            <span className={clsx(
                              'text-xs font-bold',
                              changes[lever.key] > 0 ? 'text-emerald-400' :
                              changes[lever.key] < 0 ? 'text-red-400' : 'text-white/30'
                            )}>
                              {changes[lever.key] > 0 ? '+' : ''}{changes[lever.key]}%
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={100}
                          step={5}
                          value={changes[lever.key]}
                          onChange={(e) => setChange(lever.key, Number(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-cyan-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
