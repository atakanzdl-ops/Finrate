'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Zap, ChevronRight, Target, Info } from 'lucide-react'
import clsx from 'clsx'
import type { RatioResult } from '@/lib/scoring/ratios'
import { findOptimalPath, getNextRating, type RatioSuggestion } from '@/lib/scoring/optimizer'

interface Props {
  ratios: RatioResult
  currentScore: number
  currentRating: string
  sector?: string | null
}

const RATING_COLOR: Record<string, string> = {
  AAA: '#15803d', AA: '#16a34a', A: '#22c55e',
  BBB: '#d97706', BB: '#dc2626', B: '#dc2626',
  CCC: '#b91c1c', CC: '#b91c1c', C: '#991b1b', D: '#7f1d1d',
}

const CATEGORY_COLOR: Record<string, string> = {
  Likidite: '#2EC4B6',
  Karlılık: '#0B3C5D',
  Kaldıraç: '#0ea5e9',
  Faaliyet: '#6366f1',
}

function formatVal(val: number | null, unit: RatioSuggestion['unit']): string {
  if (val == null) return '—'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x') return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

function SuggestionCard({ s }: { s: RatioSuggestion }) {
  const catColor = CATEGORY_COLOR[s.category] ?? '#6B7280'
  return (
    <div className="card hover:shadow-elevated transition-shadow duration-300">
      <div className="card-body">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 rounded-full" style={{ background: catColor }} />
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: catColor }}>
                {s.category}
              </span>
              <h4 className="text-sm font-bold text-prussian-900">{s.label}</h4>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">ETKİ</span>
            <span className="text-sm font-black text-turquoise-500">+{s.marginalScoreGain.toFixed(1)} Puan</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 bg-brand-bg p-4 rounded-xl border border-border mb-4">
          <div>
            <span className="text-[10px] font-bold text-text-muted uppercase block mb-1">Mevcut Durum</span>
            <div className="font-mono text-lg font-black text-prussian-900">
              {formatVal(s.currentValue, s.unit)}
            </div>
          </div>
          <div className="border-l border-border pl-4">
            <span className="text-[10px] font-bold text-turquoise-500 uppercase block mb-1">Banka Hedefi</span>
            <div className="font-mono text-lg font-black text-turquoise-500">
              {formatVal(s.targetValue, s.unit)}
              {s.direction === 'up' ? <TrendingUp size={16} className="inline ml-2" /> : <TrendingDown size={16} className="inline ml-2" />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge label={s.priority.toUpperCase()} tone="warning" />
          <Badge label={s.timeHorizon} tone="neutral" />
          <Badge label={s.difficulty.toUpperCase()} tone="neutral" />
        </div>

        <p className="text-xs leading-relaxed text-text-secondary font-medium">
          {s.actionText}
        </p>
      </div>
    </div>
  )
}

function Badge({ label, tone }: { label: string; tone: 'warning' | 'neutral' | 'success' }) {
  const colors = {
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    neutral: 'bg-slate-50 text-slate-600 border-slate-100',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  }
  return (
    <span className={clsx("text-[9px] font-bold px-2 py-1 rounded-lg border", colors[tone])}>
      {label}
    </span>
  )
}

export default function OptimizationPanel({ ratios, currentScore, currentRating, sector }: Props) {
  const nextRating = getNextRating(currentRating)
  const [targetRating, setTargetRating] = useState<string>(nextRating ?? 'BB')

  const result = useMemo(() => findOptimalPath(ratios, currentScore, targetRating, sector), [ratios, currentScore, targetRating, sector])

  const availableTargets = useMemo(() => {
    const idx = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'].indexOf(currentRating)
    return idx > 0 ? ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'].slice(0, idx) : []
  }, [currentRating])

  if (availableTargets.length === 0) {
    return (
      <div className="card p-12 text-center bg-brand-bg border-dashed">
        <Target size={32} className="mx-auto mb-4 text-turquoise-500" opacity={0.5} />
        <h3 className="text-lg font-bold text-prussian-900">En Üst Seviyedesiniz</h3>
        <p className="text-text-secondary mt-2 text-sm max-w-xs mx-auto">
          AAA reytingi ile kurumunuz finansal mükemmeliyet seviyesindedir. Mevcut disiplini korumanız önerilir.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Target Selection Header */}
      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Stratejik Rating Hedefi</h2>
            <p className="card-desc">Hangi reyting notuna yükselmek istiyorsunuz?</p>
          </div>
          <div className="flex gap-2">
            {availableTargets.map((rating) => (
              <button
                key={rating}
                onClick={() => setTargetRating(rating)}
                className={clsx(
                  'px-4 py-2 text-xs font-black rounded-xl transition-all border-2',
                  targetRating === rating 
                    ? 'bg-prussian-900 text-white border-prussian-900 shadow-premium' 
                    : 'bg-white text-prussian-300 border-border hover:border-text-muted'
                )}
              >
                {rating}
              </button>
            ))}
          </div>
        </div>
        
        <div className="card-body">
            <div className="grid grid-cols-3 gap-6">
                <StatBox label="MEVCUT NOT" value={currentRating} score={currentScore} />
                <StatBox label="HEDEF NOT" value={result.targetRating} score={result.targetScore} isTarget />
                <StatBox label="PROJEKSİYON" value={result.projectedRating} score={result.projectedScore} highlight />
            </div>
            
            {result.gap > 0 && (
                <div className="mt-8">
                    <div className="flex justify-between text-[10px] font-black text-text-muted tracking-widest mb-2">
                        <span>Skor İlerlemesi</span>
                        <span>GAP: {result.gap.toFixed(1)} PUAN</span>
                    </div>
                    <div className="h-2 w-full bg-brand-bg rounded-full overflow-hidden border border-border">
                        <div 
                            className="h-full bg-turquoise-500 transition-all duration-1000"
                            style={{ width: `${Math.min(100, (currentScore / result.targetScore) * 100)}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Action Plans */}
      {result.suggestions.length > 0 ? (
        <div className="grid lg:grid-cols-2 gap-8">
            <PlanSection 
                title="MİNİMUM AKSİYON SETİ" 
                subtitle="Hedefe ulaşmak için gerekli olan en kritik çekirdek adımlar."
                suggestions={result.minimumPlan.suggestions}
            />
            <PlanSection 
                title="İDEAL AKSİYON SETİ" 
                subtitle="Daha güçlü bir kredi limiti için önerilen ek tampon adımlar."
                suggestions={result.idealPlan.suggestions}
            />
        </div>
      ) : (
        <div className="p-12 text-center">
            <p className="text-text-muted font-medium italic">Bu hedef için rasyolarınız zaten yeterli seviyededir.</p>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, score, highlight, isTarget }: { label: string; value: string; score: number; highlight?: boolean; isTarget?: boolean }) {
    return (
        <div className={clsx("p-6 rounded-2xl text-center border transition-all", 
            highlight ? "bg-turquoise-500 border-turquoise-500 shadow-premium" : "bg-brand-bg border-border"
        )}>
            <span className={clsx("text-[10px] font-black tracking-widest block mb-2", 
                highlight ? "text-white/80" : "text-text-muted"
            )}>{label}</span>
            <div className={clsx("text-3xl font-black font-display", 
                highlight ? "text-white" : isTarget ? "text-turquoise-500" : "text-prussian-900"
            )}>{value}</div>
            <div className={clsx("text-xs font-bold mt-1", 
                highlight ? "text-white/70" : "text-text-muted"
            )}>{score.toFixed(0)} Puan</div>
        </div>
    )
}

function PlanSection({ title, subtitle, suggestions }: { title: string; subtitle: string; suggestions: RatioSuggestion[] }) {
    return (
        <div className="space-y-6">
            <div className="px-1">
                <h3 className="text-xs font-black text-prussian-900 tracking-widest flex items-center gap-2">
                    <Zap size={14} className="text-turquoise-500" />
                    {title}
                </h3>
                <p className="text-[11px] text-text-muted mt-1 font-medium">{subtitle}</p>
            </div>
            <div className="space-y-4">
                {suggestions.map((s) => (
                    <SuggestionCard key={s.key} s={s} />
                ))}
            </div>
        </div>
    )
}


