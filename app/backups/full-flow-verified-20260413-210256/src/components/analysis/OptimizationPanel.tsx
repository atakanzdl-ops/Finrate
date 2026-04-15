'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Zap, Target } from 'lucide-react'
import clsx from 'clsx'
import type { RatioResult } from '@/lib/scoring/ratios'
import { findOptimalPath, getNextRating, type RatioSuggestion } from '@/lib/scoring/optimizer'
import { RATING_BANDS } from '@/lib/scoring/score'

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
  Likidite:  '#2EC4B6',
  Karlılık:  '#0B3C5D',
  Kaldıraç:  '#0ea5e9',
  Faaliyet:  '#6366f1',
}

// D→AAA sırasında tüm bantlar (soldan sağa = kötüden iyiye)
const SCALE = [...RATING_BANDS].reverse() // D,C,CC,...,AAA

function scoreToPosition(score: number): number {
  return Math.min(100, Math.max(0, score))
}

// ─── Rating Scale ──────────────────────────────────────────────────────────────
function RatingScale({
  currentScore, targetScore, projectedScore, currentRating, targetRating, projectedRating,
}: {
  currentScore: number; targetScore: number; projectedScore: number
  currentRating: string; targetRating: string; projectedRating: string
}) {
  const segments = SCALE.map((band, i) => {
    const nextMin = SCALE[i + 1]?.min ?? 100
    const width = nextMin - band.min
    const segColor =
      band.min >= 76 ? '#16a34a' :
      band.min >= 60 ? '#d97706' :
      band.min >= 42 ? '#dc2626' : '#991b1b'
    return { band, width, segColor }
  })

  const markers = [
    { score: currentScore,   label: 'Mevcut',   color: '#0B3C5D', shape: '▲', rating: currentRating },
    { score: targetScore,    label: 'Hedef',    color: '#6366f1', shape: '◆', rating: targetRating },
    { score: projectedScore, label: 'Proj.',    color: '#2EC4B6', shape: '●', rating: projectedRating },
  ]

  return (
    <div className="mt-6">
      <div className="text-[10px] font-black text-slate-400 tracking-widest mb-2 uppercase">Not Skalası</div>
      {/* Bar */}
      <div className="relative h-5 flex rounded-full overflow-hidden">
        {segments.map(({ band, width, segColor }) => (
          <div
            key={band.label}
            style={{ width: `${width}%`, background: segColor, opacity: 0.15 }}
            className="relative"
          />
        ))}
        {/* Renkli fill — mevcut skora kadar */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{
            width: `${scoreToPosition(currentScore)}%`,
            background: 'linear-gradient(90deg, #991b1b 0%, #d97706 50%, #16a34a 100%)',
            opacity: 0.5,
          }}
        />
      </div>
      {/* Rating etiketleri */}
      <div className="relative flex mt-1">
        {segments.map(({ band, width }) => (
          <div
            key={band.label}
            style={{ width: `${width}%` }}
            className="text-center text-[8px] font-black text-slate-400"
          >
            {band.label}
          </div>
        ))}
      </div>
      {/* Marker göstergeleri */}
      <div className="flex gap-4 mt-3">
        {markers.map(m => (
          <div key={m.label} className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: m.color }}>{m.shape}</span>
            <span className="text-[10px] font-bold text-slate-500">{m.label}:</span>
            <span className="text-[10px] font-black" style={{ color: m.color }}>{m.rating}</span>
            <span className="text-[10px] text-slate-400">({Math.round(m.score)}p)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Badge ──────────────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, string> = {
  'KRİTİK': 'bg-red-50 text-red-700 border-red-200',
  'ÖNEMLİ': 'bg-amber-50 text-amber-700 border-amber-100',
  'ORTA':   'bg-slate-50 text-slate-600 border-slate-100',
}
const DIFFICULTY_STYLE: Record<string, string> = {
  'ZOR':  'bg-orange-50 text-orange-700 border-orange-100',
  'ORTA': 'bg-slate-50 text-slate-500 border-slate-100',
}

function formatVal(val: number | null, unit: RatioSuggestion['unit']): string {
  if (val == null) return '—'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x') return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

// ─── SuggestionCard ────────────────────────────────────────────────────────────
function SuggestionCard({ s }: { s: RatioSuggestion }) {
  const catColor = CATEGORY_COLOR[s.category] ?? '#6B7280'
  // actionText ① ② ③ maddelerini ayrıştır
  const parts = s.actionText.split(/[①②③]/).map(t => t.trim()).filter(Boolean)
  const intro = parts[0]
  const steps = parts.slice(1)

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="p-5">
        {/* Başlık */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: catColor }} />
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest block" style={{ color: catColor }}>
                {s.category}
              </span>
              <h4 className="text-sm font-bold" style={{ color: '#0B3C5D' }}>{s.label}</h4>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ETKİ</span>
            <span className="text-sm font-black" style={{ color: '#2EC4B6' }}>+{s.marginalScoreGain.toFixed(1)} Puan</span>
          </div>
        </div>

        {/* Mevcut → Hedef */}
        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Mevcut Durum</span>
            <div className="font-mono text-lg font-black" style={{ color: '#0B3C5D' }}>
              {formatVal(s.currentValue, s.unit)}
            </div>
          </div>
          <div className="border-l border-slate-200 pl-4">
            <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: '#2EC4B6' }}>Banka Hedefi</span>
            <div className="font-mono text-lg font-black flex items-center gap-1" style={{ color: '#2EC4B6' }}>
              {formatVal(s.targetValue, s.unit)}
              {s.direction === 'up'
                ? <TrendingUp size={15} className="inline" />
                : <TrendingDown size={15} className="inline" />}
            </div>
          </div>
        </div>

        {/* Badge'ler */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className={clsx('text-[9px] font-bold px-2 py-1 rounded-lg border', PRIORITY_STYLE[s.priority] ?? 'bg-slate-50 text-slate-600 border-slate-100')}>
            {s.priority}
          </span>
          <span className="text-[9px] font-bold px-2 py-1 rounded-lg border bg-slate-50 text-slate-500 border-slate-100">
            ⏱ {s.timeHorizon}
          </span>
          <span className={clsx('text-[9px] font-bold px-2 py-1 rounded-lg border', DIFFICULTY_STYLE[s.difficulty] ?? 'bg-slate-50 text-slate-500 border-slate-100')}>
            {s.difficulty === 'ZOR' ? '⚠ ZOR' : 'ORTA'}
          </span>
        </div>

        {/* Aksiyon açıklaması */}
        <p className="text-xs text-slate-600 font-medium mb-3 leading-relaxed">{intro}</p>
        {steps.length > 0 && (
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white mt-0.5" style={{ background: '#0B3C5D' }}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─── StatBox ────────────────────────────────────────────────────────────────────
function StatBox({ label, value, score, highlight, isTarget }: {
  label: string; value: string; score: number; highlight?: boolean; isTarget?: boolean
}) {
  return (
    <div className={clsx('p-6 rounded-2xl text-center border transition-all',
      highlight ? 'border-[#2EC4B6] shadow-sm' : 'bg-slate-50 border-slate-200'
    )} style={highlight ? { background: '#2EC4B6' } : {}}>
      <span className={clsx('text-[10px] font-black tracking-widest block mb-2',
        highlight ? 'text-white/80' : 'text-slate-400'
      )}>{label}</span>
      <div className={clsx('text-3xl font-black font-display',
        highlight ? 'text-white' : isTarget ? '' : ''
      )} style={highlight ? {} : { color: isTarget ? '#2EC4B6' : '#0B3C5D' }}>
        {value}
      </div>
      <div className={clsx('text-xs font-bold mt-1',
        highlight ? 'text-white/70' : 'text-slate-400'
      )}>{Math.round(score)} Puan</div>
    </div>
  )
}

// ─── PlanSection ────────────────────────────────────────────────────────────────
function PlanSection({ title, subtitle, suggestions }: {
  title: string; subtitle: string; suggestions: RatioSuggestion[]
}) {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h3 className="text-xs font-black tracking-widest flex items-center gap-2" style={{ color: '#0B3C5D' }}>
          <Zap size={14} style={{ color: '#2EC4B6' }} />
          {title}
        </h3>
        <p className="text-[11px] text-slate-400 mt-1 font-medium">{subtitle}</p>
      </div>
      <div className="space-y-4">
        {suggestions.map((s) => (
          <SuggestionCard key={s.key} s={s} />
        ))}
      </div>
    </div>
  )
}

// ─── Ana bileşen ────────────────────────────────────────────────────────────────
export default function OptimizationPanel({ ratios, currentScore, currentRating, sector }: Props) {
  const nextRating = getNextRating(currentRating)
  const [targetRating, setTargetRating] = useState<string>(nextRating ?? 'BB')

  const result = useMemo(
    () => findOptimalPath(ratios, currentScore, targetRating, sector),
    [ratios, currentScore, targetRating, sector]
  )

  const availableTargets = useMemo(() => {
    const idx = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'].indexOf(currentRating)
    return idx > 0 ? ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'].slice(0, idx) : []
  }, [currentRating])

  if (availableTargets.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-12 text-center">
        <Target size={32} className="mx-auto mb-4" style={{ color: '#2EC4B6' }} opacity={0.5} />
        <h3 className="text-lg font-bold" style={{ color: '#0B3C5D' }}>En Üst Seviyedesiniz</h3>
        <p className="text-slate-500 mt-2 text-sm max-w-xs mx-auto">
          AAA reytingi ile kurumunuz finansal mükemmeliyet seviyesindedir. Mevcut disiplini korumanız önerilir.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Hedef Seçici */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="text-sm font-black tracking-widest" style={{ color: '#0B3C5D' }}>STRATEJİK RATING HEDEFİ</h2>
            <p className="text-xs text-slate-400 mt-0.5">Hangi reyting notuna yükselmek istiyorsunuz?</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {availableTargets.map((rating) => (
              <button
                key={rating}
                onClick={() => setTargetRating(rating)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-black rounded-xl transition-all border-2',
                  targetRating === rating
                    ? 'text-white border-[#0B3C5D]'
                    : 'bg-white border-slate-200 hover:border-slate-400'
                )}
                style={targetRating === rating ? { background: '#0B3C5D', color: '#fff' } : { color: '#0B3C5D' }}
              >
                {rating}
              </button>
            ))}
          </div>
        </div>

        {/* 3 kutu */}
        <div className="grid grid-cols-3 gap-4">
          <StatBox label="MEVCUT NOT"  value={currentRating}        score={currentScore}        />
          <StatBox label="HEDEF NOT"   value={result.targetRating}  score={result.targetScore}  isTarget />
          <StatBox label="PROJEKSİYON" value={result.projectedRating} score={result.projectedScore} highlight />
        </div>

        {/* Rating Skalası */}
        <RatingScale
          currentScore={currentScore}
          targetScore={result.targetScore}
          projectedScore={result.projectedScore}
          currentRating={currentRating}
          targetRating={result.targetRating}
          projectedRating={result.projectedRating}
        />

        {/* İlerleme çubuğu */}
        {result.gap > 0 && (
          <div className="mt-5">
            <div className="flex justify-between text-[10px] font-black text-slate-400 tracking-widest mb-1.5">
              <span>Skor İlerlemesi</span>
              <span>AÇIK: {result.gap.toFixed(1)} PUAN</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (currentScore / result.targetScore) * 100)}%`,
                  background: '#2EC4B6',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Aksiyon Planları */}
      {result.suggestions.length > 0 ? (
        <div className="grid lg:grid-cols-2 gap-8">
          <PlanSection
            title="MİNİMUM AKSİYON SETİ"
            subtitle="Hedefe ulaşmak için gerekli en kritik çekirdek adımlar."
            suggestions={result.minimumPlan.suggestions}
          />
          <PlanSection
            title="İDEAL AKSİYON SETİ"
            subtitle="Daha güçlü kredi limiti için önerilen ek tampon adımlar."
            suggestions={result.idealPlan.suggestions}
          />
        </div>
      ) : (
        <div className="p-12 text-center">
          <p className="text-slate-400 font-medium italic">Bu hedef için rasyolarınız zaten yeterli seviyededir.</p>
        </div>
      )}
    </div>
  )
}
