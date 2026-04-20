'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'
import { useState } from 'react'
import { Info } from 'lucide-react'
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
      <div className="font-black text-[#0B3C5D] mb-2">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-[#5A7A96]">Finrate Skoru</span>
          <span className="font-black" style={{ color: RATING_COLOR[rating] ?? '#94A3B8' }}>
            {Math.round(d?.combinedScore ?? 0)} — {rating}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#5A7A96]">Likidite</span>
          <span className="font-bold text-cyan-500">{Math.round(d?.liquidityScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#5A7A96]">Karlılık</span>
          <span className="font-bold text-indigo-400">{Math.round(d?.profitabilityScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#5A7A96]">Kaldıraç</span>
          <span className="font-bold text-sky-400">{Math.round(d?.leverageScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#5A7A96]">Faaliyet</span>
          <span className="font-bold text-indigo-400">{Math.round(d?.activityScore ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}

function DeltaInfo({ delta, isUp, first, last }: { delta: number; isUp: boolean; first: string; last: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div className="flex items-center justify-end gap-1">
        <div className="text-lg font-black font-mono" style={{ color: isUp ? '#16a34a' : '#dc2626' }}>
          {isUp ? '+' : ''}{delta.toFixed(1)}
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <Info size={13} />
        </button>
      </div>
      <div className="text-[10px] text-slate-400">{first} → {last}</div>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-left"
          style={{ width: 220 }}
        >
          <p className="text-[11px] font-bold text-slate-700 mb-1">Dönemler Arası Skor Değişimi</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            İlk dönem ({first}) ile son dönem ({last}) arasındaki Finrate kombine skoru farkı.
            {isUp
              ? ' Pozitif değer: finansal profil güçlendi.'
              : ' Negatif değer: finansal profil zayıfladı.'}
          </p>
        </div>
      )}
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
          <h4 className="card-title" style={{ color: '#0B3C5D' }}>Çok Yıllı Trend Analizi</h4>
          <p className="card-desc">{entityName} · {sorted.length} dönem</p>
        </div>
        <div className="text-right flex flex-col items-end gap-0.5">
          <DeltaInfo delta={delta} isUp={isUp} first={first.label} last={last.label} />
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
              tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }}
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
        <p className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] mb-3">Kategori Trendleri</p>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94A3B8', fontWeight: 700 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: '#94A3B8', fontWeight: 700 }}
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
              <span className="text-[9px] font-bold text-[#94A3B8]">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
