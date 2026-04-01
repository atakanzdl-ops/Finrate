'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { WhatIfSimulator } from '@/components/analysis/WhatIfSimulator'

interface Analysis {
  id: string
  year: number
  period: string
  finalScore: number
  finalRating: string
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
  ratios: Record<string, number | null>
  entity?: { name: string }
}

const RATING_COLOR: Record<string, string> = {
  AAA: 'text-emerald-400', AA: 'text-emerald-400', A: 'text-green-400',
  BBB: 'text-lime-400',    BB: 'text-yellow-400',  B: 'text-orange-400',
  CCC: 'text-orange-500',  CC: 'text-red-400',     C: 'text-red-500', D: 'text-red-600',
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 28, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke="url(#cg)" strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <defs>
          <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0ECEAD" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>
        <text x="36" y="40" textAnchor="middle" className="text-xs" fill="white" fontSize="13" fontWeight="700">
          {Math.round(score)}
        </text>
      </svg>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  )
}

function AnalizContent() {
  const searchParams = useSearchParams()
  const entityId = searchParams.get('entityId')
  const year     = searchParams.get('year')
  const period   = searchParams.get('period') ?? 'ANNUAL'

  const [analyses, setAnalyses]   = useState<Analysis[]>([])
  const [selected, setSelected]   = useState<Analysis | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => r.json())
      .then((d) => {
        const list: Analysis[] = d.analyses ?? []
        setAnalyses(list)
        if (entityId && year) {
          const match = list.find(
            (a) => a.entity?.name && String(a.year) === year && a.period === period,
          )
          setSelected(match ?? list[0] ?? null)
        } else {
          setSelected(list[0] ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [entityId, year, period])

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 size={24} className="animate-spin text-cyan-400" />
    </div>
  )

  if (analyses.length === 0) return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">Analizler</h1>
      <div className="glass-card rounded-xl p-10 text-center">
        <BarChart3 size={32} className="text-white/20 mx-auto mb-3" />
        <p className="text-white/40 text-sm">Henüz analiz yok. Bir şirkete finansal veri girerek başlayın.</p>
        <Link href="/dashboard/sirketler/yeni" className="inline-block mt-4 px-4 py-2 btn-gradient rounded-lg text-sm font-semibold text-white">
          Şirket Ekle
        </Link>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analizler</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol: Liste */}
        <div className="space-y-2">
          {analyses.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={clsx(
                'w-full text-left glass-card p-3 rounded-xl transition-all',
                selected?.id === a.id ? 'border-cyan-500/40' : 'hover:border-white/20',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white truncate">
                  {a.entity?.name ?? 'Şirket'}
                </p>
                <span className={clsx('text-sm font-bold', RATING_COLOR[a.finalRating] ?? 'text-white')}>
                  {a.finalRating}
                </span>
              </div>
              <p className="text-xs text-white/40 mt-0.5">{a.year} · {a.period}</p>
              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-gradient"
                  style={{ width: `${a.finalScore}%` }}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Sağ: Detay */}
        {selected && (
          <div className="lg:col-span-2 space-y-4">
            {/* Rating Kartı */}
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white/50 text-xs font-medium">FİNRATE SKORU</p>
                  <p className="text-5xl font-black text-white mt-1">{Math.round(selected.finalScore)}</p>
                  <p className="text-xs text-white/40 mt-0.5">{selected.year} Yıllık</p>
                </div>
                <div className="text-right">
                  <p className="text-white/50 text-xs font-medium">DİRECTİNG</p>
                  <p className={clsx('text-4xl font-black mt-1', RATING_COLOR[selected.finalRating] ?? 'text-white')}>
                    {selected.finalRating}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-gradient transition-all duration-700"
                  style={{ width: `${selected.finalScore}%` }}
                />
              </div>
            </div>

            {/* Kategori Skorları */}
            <div className="glass-card rounded-xl p-5">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-4">
                Kategori Skorları
              </p>
              <div className="flex justify-around">
                <ScoreRing score={selected.liquidityScore}     label="Likidite" />
                <ScoreRing score={selected.profitabilityScore} label="Karlılık" />
                <ScoreRing score={selected.leverageScore}      label="Kaldıraç" />
                <ScoreRing score={selected.activityScore}      label="Faaliyet" />
              </div>
            </div>

            {/* What-If */}
            <WhatIfSimulator baseData={selected.ratios} baseScore={selected.finalScore} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function AnalizPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>}>
      <AnalizContent />
    </Suspense>
  )
}
