'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'
import { scoreToRating } from '@/lib/scoring/score'

interface AnalysisBrief {
  id: string
  year: number
  period: string
  finalScore: number
  finalRating: string
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
  ratios?: Record<string, number | null>
}

interface Props {
  analyses: AnalysisBrief[]
  entityName: string
  subjectiveScores?: Record<string, number>  // entityId → subjective total
  entityId?: string
}

const RATING_COLOR: Record<string, string> = {
  AAA: '#10b981', AA: '#10b981', A: '#34d399',
  BBB: '#2dd4bf', BB: '#94a3b8', B: '#f87171',
  CCC: '#ef4444', CC: '#ef4444', C: '#dc2626', D: '#dc2626',
}

function combinedScore(a: AnalysisBrief, subj: number): number {
  return Math.min(100, a.finalScore * 0.70 + subj)
}

function combinedRating(score: number): string {
  return scoreToRating(score)
}

const PERIOD_SHORT: Record<string, string> = {
  ANNUAL: '', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4',
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: Record<string, number> }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  const rating = combinedRating(d?.combinedScore ?? 0)
  return (
    <div
      className="rounded-xl p-3 text-[11px]"
      style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(255,255,255,0.8)',
        boxShadow: '0 8px 24px rgba(10,30,60,0.12)',
      }}
    >
      <div className="font-black text-[#0a1727] mb-2">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Finrate Skoru</span>
          <span className="font-black" style={{ color: RATING_COLOR[rating] ?? '#8da4bf' }}>
            {Math.round(d?.combinedScore ?? 0)} — {rating}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Likidite</span>
          <span className="font-bold text-cyan-500">{Math.round(d?.liquidityScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Karlılık</span>
          <span className="font-bold text-indigo-400">{Math.round(d?.profitabilityScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Kaldıraç</span>
          <span className="font-bold text-sky-400">{Math.round(d?.leverageScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Faaliyet</span>
          <span className="font-bold text-indigo-400">{Math.round(d?.activityScore ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}

export default function TrendChart({ analyses, entityName, subjectiveScores, entityId }: Props) {
  const subjective = entityId ? (subjectiveScores?.[entityId] ?? 0) : 0

  // Sadece bu entity için, yıla göre sırala
  const sorted = [...analyses]
    .sort((a, b) => a.year - b.year || a.period.localeCompare(b.period))

  if (sorted.length < 2) {
    return (
      <div className="card p-8 text-center">
        <p className="card-desc">
          Trend analizi için en az 2 dönem verisi gereklidir.
        </p>
      </div>
    )
  }

  const data = sorted.map(a => {
    const period = PERIOD_SHORT[a.period] ?? a.period
    const label = period ? `${a.year} ${period}` : String(a.year)
    const cs = combinedScore(a, subjective)
    return {
      label,
      combinedScore: Math.round(cs * 10) / 10,
      liquidityScore: Math.round(a.liquidityScore),
      profitabilityScore: Math.round(a.profitabilityScore),
      leverageScore: Math.round(a.leverageScore),
      activityScore: Math.round(a.activityScore),
      rating: combinedRating(cs),
    }
  })

  // Son dönem vs ilk dönem değişim
  const first = data[0]
  const last  = data[data.length - 1]
  const delta = last.combinedScore - first.combinedScore
  const isUp  = delta >= 0

  return (
    <div className="card overflow-hidden">
      {/* Başlık */}
      <div className="card-head">
        <div className="card-head-left">
          <h4 className="card-title">Çok Yıllı Trend Analizi</h4>
          <p className="card-desc">{entityName} · {sorted.length} dönem</p>
        </div>
        <div className="text-right">
          <div
            className="text-lg font-black font-mono"
            style={{ color: isUp ? 'var(--emerald-500)' : 'var(--red-400)' }}
          >
            {isUp ? '+' : ''}{delta.toFixed(1)}
          </div>
          <div className="card-desc">
            {first.label} → {last.label}
          </div>
        </div>
      </div>

      {/* Ana Grafik */}
      <div className="px-6 pt-6 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2dd4bf" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#8da4bf', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#8da4bf', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={60} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
            <ReferenceLine y={76} stroke="rgba(52,211,153,0.3)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="combinedScore"
              stroke="#2dd4bf"
              strokeWidth={2.5}
              fill="url(#trendGrad)"
              dot={{ fill: '#2dd4bf', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#2dd4bf' }}
              name="Finrate Skoru"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Kategori Alt Grafik */}
      <div className="px-6 pt-2 pb-6">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#8da4bf] mb-3">Kategori Trendleri</p>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#8da4bf', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#8da4bf', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="liquidityScore"     stroke="#2dd4bf" strokeWidth={1.5} dot={false} name="Likidite" />
            <Line type="monotone" dataKey="profitabilityScore" stroke="#818cf8" strokeWidth={1.5} dot={false} name="Karlılık" />
            <Line type="monotone" dataKey="leverageScore"      stroke="#0ea5e9" strokeWidth={1.5} dot={false} name="Kaldıraç" />
            <Line type="monotone" dataKey="activityScore"      stroke="#6366f1" strokeWidth={1.5} dot={false} name="Faaliyet" />
          </LineChart>
        </ResponsiveContainer>
        {/* Renk Lejandı */}
        <div className="flex gap-4 mt-3 flex-wrap">
          {[
            { color: '#2dd4bf', label: 'Likidite' },
            { color: '#818cf8', label: 'Karlılık' },
            { color: '#0ea5e9', label: 'Kaldıraç' },
            { color: '#6366f1', label: 'Faaliyet' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded-full" style={{ background: l.color }} />
              <span className="text-[9px] font-bold text-[#8da4bf]">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
