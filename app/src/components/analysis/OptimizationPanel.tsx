'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Target, Zap, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import type { RatioResult } from '@/lib/scoring/ratios'
import { findOptimalPath, getNextRating, RATING_MIN, type RatioSuggestion } from '@/lib/scoring/optimizer'

interface Props {
  ratios: RatioResult
  currentScore: number
  currentRating: string
  sector?: string | null
}

const RATING_COLOR: Record<string, string> = {
  AAA: '#10b981', AA: '#10b981', A: '#34d399',
  BBB: '#a3e635', BB: '#facc15', B: '#fb923c',
  CCC: '#f97316', CC: '#f87171', C: '#ef4444', D: '#dc2626',
}

const CATEGORY_COLOR: Record<string, string> = {
  Likidite: '#2dd4bf',
  Karlılık: '#818cf8',
  Kaldıraç: '#fb923c',
  Faaliyet: '#60a5fa',
}

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']

function SuggestionCard({ s, index }: { s: RatioSuggestion; index: number }) {
  const catColor = CATEGORY_COLOR[s.category] ?? '#8da4bf'
  return (
    <div
      className="rounded-2xl p-5 border transition-all hover:scale-[1.01]"
      style={{
        background: 'rgba(255,255,255,0.55)',
        borderColor: 'rgba(255,255,255,0.5)',
        boxShadow: '0 4px 16px rgba(10,30,60,0.06)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Sıra */}
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 mt-0.5"
          style={{ background: catColor }}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          {/* Başlık */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: catColor }}>
              {s.category}
            </span>
            <span className="text-[9px] font-bold text-[#8da4bf]">·</span>
            <span className="text-[10px] font-bold text-[#3d5a80]">{s.label}</span>
          </div>

          {/* Mevcut → Hedef */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black text-[#0a1727]">
              {formatVal(s.currentValue, s.unit)}
            </span>
            <ChevronRight size={12} className="text-[#8da4bf]" />
            <span className="text-xs font-black" style={{ color: catColor }}>
              {formatVal(s.targetValue, s.unit)}
            </span>
            {s.direction === 'up'
              ? <TrendingUp size={12} style={{ color: catColor }} />
              : <TrendingDown size={12} style={{ color: catColor }} />
            }
          </div>

          {/* Aksiyon metni */}
          <p className="text-[10px] text-[#3d5a80] leading-relaxed">{s.actionText}</p>
        </div>

        {/* Puan kazancı */}
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-black" style={{ color: catColor }}>
            +{s.scoreGain.toFixed(1)}
          </div>
          <div className="text-[8px] font-bold text-[#8da4bf] uppercase">puan</div>
        </div>
      </div>
    </div>
  )
}

function formatVal(val: number | null, unit: RatioSuggestion['unit']): string {
  if (val == null) return '—'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x')   return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

export default function OptimizationPanel({ ratios, currentScore, currentRating, sector }: Props) {
  const nextRating = getNextRating(currentRating)
  const [targetRating, setTargetRating] = useState<string>(nextRating ?? 'BB')

  const result = useMemo(
    () => findOptimalPath(ratios, currentScore, targetRating, sector),
    [ratios, currentScore, targetRating, sector]
  )

  // Seçilebilir hedef ratingler (mevcut ratingden üst)
  const availableTargets = useMemo(() => {
    const idx = RATING_ORDER.indexOf(currentRating)
    return idx > 0 ? RATING_ORDER.slice(0, idx) : []
  }, [currentRating])

  if (availableTargets.length === 0) {
    return (
      <div className="rounded-[20px] p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.5)' }}>
        <Zap size={28} className="text-emerald-400 mx-auto mb-3" />
        <p className="text-sm font-black text-[#0a1727]">Zirvedesiniz!</p>
        <p className="text-[10px] text-[#8da4bf] mt-1">AAA reytinginde daha yüksek hedef yok.</p>
      </div>
    )
  }

  const projColor = RATING_COLOR[result.projectedRating] ?? '#8da4bf'
  const targetColor = RATING_COLOR[result.targetRating] ?? '#8da4bf'

  return (
    <div className="space-y-4">
      {/* Başlık + Hedef Seçici */}
      <div className="rounded-[20px] p-6"
        style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 8px 32px rgba(10,30,60,0.08)' }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">Hedef Nota Ulaş</h3>
            <p className="text-[10px] text-[#8da4bf] mt-1">Seçilen hedefe en kısa yoldan ulaşmak için öneriler</p>
          </div>
          <Target size={16} className="text-cyan-400 mt-1" />
        </div>

        {/* Hedef seçici */}
        <div className="space-y-2 mb-5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#3d5a80]">Hedef Reyting</span>
          <div className="flex gap-2 flex-wrap">
            {availableTargets.map(r => (
              <button
                key={r}
                onClick={() => setTargetRating(r)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all",
                  targetRating === r
                    ? "text-white shadow-md border-transparent"
                    : "border-black/10 text-[#3d5a80] hover:border-cyan-400/50"
                )}
                style={targetRating === r ? { background: RATING_COLOR[r] ?? '#6366f1' } : {}}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Mevcut → Projeksiyon */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
            <div className="text-[8px] font-black uppercase tracking-widest text-[#8da4bf] mb-1">Mevcut</div>
            <div className="text-xl font-black" style={{ color: RATING_COLOR[currentRating] ?? '#8da4bf', fontFamily: 'Outfit, sans-serif' }}>
              {currentRating}
            </div>
            <div className="text-[9px] font-bold text-[#8da4bf] mt-0.5">{currentScore.toFixed(0)} puan</div>
          </div>

          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
            <div className="text-[8px] font-black uppercase tracking-widest text-[#8da4bf] mb-1">Hedef</div>
            <div className="text-xl font-black" style={{ color: targetColor, fontFamily: 'Outfit, sans-serif' }}>
              {result.targetRating}
            </div>
            <div className="text-[9px] font-bold text-[#8da4bf] mt-0.5">{result.targetScore} puan</div>
          </div>

          <div className="rounded-xl p-3 text-center" style={{ background: result.achievable ? 'rgba(16,185,129,0.08)' : 'rgba(251,146,60,0.08)' }}>
            <div className="text-[8px] font-black uppercase tracking-widest text-[#8da4bf] mb-1">Projeksiyon</div>
            <div className="text-xl font-black" style={{ color: projColor, fontFamily: 'Outfit, sans-serif' }}>
              {result.projectedRating}
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: result.achievable ? '#10b981' : '#fb923c' }}>
              {result.projectedScore.toFixed(0)} puan {result.achievable ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Boşluk göstergesi */}
        {result.gap > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[9px] font-bold text-[#8da4bf] mb-1.5">
              <span>Mevcut {currentScore.toFixed(0)}</span>
              <span className="text-[#3d5a80]">Kapatılacak boşluk: {result.gap.toFixed(1)} puan</span>
              <span>Hedef {result.targetScore}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, (currentScore / result.targetScore) * 100)}%`,
                  background: `linear-gradient(90deg, ${RATING_COLOR[currentRating] ?? '#6366f1'}, ${targetColor})`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Öneri listesi */}
      {result.suggestions.length > 0 ? (
        <div className="space-y-3">
          <div className="text-[9px] font-black uppercase tracking-[0.25em] text-[#3d5a80] px-1">
            En Etkili {result.suggestions.length} Öneri
          </div>
          {result.suggestions.map((s, i) => (
            <SuggestionCard key={s.key} s={s} index={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] p-6 text-center" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.5)' }}>
          <p className="text-[10px] text-[#8da4bf]">Bu hedef için tüm rasyolar zaten yeterli seviyede.</p>
        </div>
      )}
    </div>
  )
}
