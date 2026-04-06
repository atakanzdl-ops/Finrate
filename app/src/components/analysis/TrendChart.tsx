'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'

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
  BBB: '#a3e635', BB: '#facc15', B: '#fb923c',
  CCC: '#f97316', CC: '#f87171', C: '#ef4444', D: '#dc2626',
}

function combinedScore(a: AnalysisBrief, subj: number): number {
  return Math.min(100, a.finalScore * 0.70 + subj)
}

function combinedRating(score: number): string {
  if (score >= 92) return 'AAA'
  if (score >= 84) return 'AA'
  if (score >= 76) return 'A'
  if (score >= 68) return 'BBB'
  if (score >= 60) return 'BB'
  if (score >= 52) return 'B'
  if (score >= 44) return 'CCC'
  if (score >= 36) return 'CC'
  if (score >= 28) return 'C'
  return 'D'
}

const PERIOD_SHORT: Record<string, string> = {
  ANNUAL: '', Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
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
          <span className="font-bold text-orange-400">{Math.round(d?.leverageScore ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#3d5a80]">Faaliyet</span>
          <span className="font-bold text-yellow-400">{Math.round(d?.activityScore ?? 0)}</span>
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
      <div
        className="rounded-[20px] p-8 text-center"
        style={{
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(255,255,255,0.65)',
          boxShadow: '0 8px 32px rgba(10,30,60,0.08)',
        }}
      >
        <p className="text-[10px] font-bold text-[#8da4bf]">
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
    <div
      className="rounded-[20px] overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(255,255,255,0.65)',
        boxShadow: '0 8px 32px rgba(10,30,60,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      {/* Başlık */}
      <div className="px-8 py-5 border-b border-black/5 flex items-center justify-between">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#3d5a80]">
            Çok Yıllı Trend Analizi
          </h4>
          <p className="text-[9px] font-bold text-[#8da4bf] mt-0.5">{entityName} · {sorted.length} dönem</p>
        </div>
        <div className="text-right">
          <div
            className="text-lg font-black"
            style={{ color: isUp ? '#10b981' : '#f87171', fontFamily: 'Outfit, sans-serif' }}
          >
            {isUp ? '+' : ''}{delta.toFixed(1)} puan
          </div>
          <div className="text-[9px] font-bold text-[#8da4bf]">
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
            <ReferenceLine y={60} stroke="rgba(251,146,60,0.3)" strokeDasharray="4 4" />
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
            <Line type="monotone" dataKey="leverageScore"      stroke="#fb923c" strokeWidth={1.5} dot={false} name="Kaldıraç" />
            <Line type="monotone" dataKey="activityScore"      stroke="#fbbf24" strokeWidth={1.5} dot={false} name="Faaliyet" />
          </LineChart>
        </ResponsiveContainer>
        {/* Renk Lejandı */}
        <div className="flex gap-4 mt-3 flex-wrap">
          {[
            { color: '#2dd4bf', label: 'Likidite' },
            { color: '#818cf8', label: 'Karlılık' },
            { color: '#fb923c', label: 'Kaldıraç' },
            { color: '#fbbf24', label: 'Faaliyet' },
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
