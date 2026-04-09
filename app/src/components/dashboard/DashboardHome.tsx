'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import FinrateShell from '@/components/layout/FinrateShell'

/* ─── Types ─── */
interface RatioSuggestion {
  key: string
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: 'pct' | 'x' | 'day' | 'ratio'
  marginalScoreGain: number
  difficulty: 'medium' | 'hard'
  timeHorizon: '0-90 days' | '3-6 months' | '6-12 months'
}

interface ActionPlan {
  label: 'minimum' | 'ideal'
  title: string
  targetScore: number
  projectedScore: number
  projectedRating: string
  achievable: boolean
  suggestions: RatioSuggestion[]
}

interface OptimizerTargetSnapshot {
  targetRating: string
  totalGain: number
  minimumPlan: ActionPlan
  idealPlan: ActionPlan
}

interface OptimizerSnapshot {
  currentScore: number
  currentRating: string
  generatedAt: string
  targets: OptimizerTargetSnapshot[]
}

interface Analysis {
  id: string
  year: number
  period: string
  updatedAt: string
  finalScore: number
  finalRating: string
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
  optimizerSnapshot?: OptimizerSnapshot | null
  entity?: { id: string; name: string; sector?: string | null }
}

/* ─── Helpers ─── */
function getRiskLevel(rating: string) {
  const high = ['CCC', 'CC', 'C', 'D', 'B', 'BB']
  const med = ['BBB', 'A']
  if (high.includes(rating)) return { label: 'YÜKSEK RİSK', color: 'text-red-600', dot: 'bg-red-600' }
  if (med.includes(rating)) return { label: 'ORTA RİSK', color: 'text-amber-600', dot: 'bg-amber-500' }
  return { label: 'DÜŞÜK RİSK', color: 'text-emerald-700', dot: 'bg-emerald-600' }
}

function formatValue(val: number | null, unit: RatioSuggestion['unit']) {
  if (val == null) return '-'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x') return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

export default function DashboardHome() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((d) => {
          const list = (d.analyses ?? []) as Analysis[]
          setAnalyses([...list].sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
      })
      .catch(() => setAnalyses([]))
      .finally(() => setLoading(false))
  }, [])

  const summary = useMemo(() => {
    if (!analyses.length) return null
    const latest = analyses[0]
    const risk = getRiskLevel(latest.finalRating)
    const latestTarget = latest.optimizerSnapshot?.targets[0] ?? null

    return { latest, risk, latestTarget }
  }, [analyses])

  if (loading) return (
    <FinrateShell>
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-[#0B3C5D]" size={32} />
      </div>
    </FinrateShell>
  )

  if (!summary) return (
    <FinrateShell>
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <FileText className="text-slate-300 mb-6" size={48} />
        <h2 className="text-xl font-bold text-[#0B3C5D]">Analiz Bulunamadı</h2>
        <p className="text-slate-500 mt-2 text-sm max-w-sm">
          Mizan yükleyerek finansal kredi analiz raporunuzu oluşturun.
        </p>
        <Link href="/dashboard/analiz" className="bg-[#0B3C5D] text-white px-6 py-3 rounded-[4px] text-xs font-bold mt-6 hover:bg-[#072b43] transition-colors">
          YENİ ANALİZ
        </Link>
      </div>
    </FinrateShell>
  )

  return (
    <FinrateShell>
      <div className="space-y-6 pb-20 max-w-6xl mx-auto px-4 sm:px-6 mt-6">
        
        {/* Page Header */}
        <div className="flex items-end justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-display font-black text-[#0B3C5D]">
              {summary.latest.entity?.name}
            </h1>
            <p className="text-slate-500 mt-1 text-xs">
              Sektör: Üretim | Dönem: {summary.latest.year}/{summary.latest.period} | Rapor No: FX-{summary.latest.id.slice(0,6).toUpperCase()}
            </p>
          </div>
          <Link href="/dashboard/analiz" className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-[4px] text-[10px] font-bold tracking-widest hover:bg-slate-50 transition-colors flex items-center gap-2">
            RAPOR DETAYI <ArrowRight size={14} />
          </Link>
        </div>

        {/* 1. Header Blocks (Top 3) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="bg-white p-6 border border-slate-200 rounded-[4px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">Fİnrate Skoru</span>
            <div className="flex flex-col">
              <div className="text-5xl font-display font-black text-[#0B3C5D] leading-none mb-1">
                {Math.round(summary.latest.finalScore)}
              </div>
              <div className="text-[10px] text-slate-400 font-bold tracking-widest">/ 100 PUAN</div>
            </div>
          </div>
          
          <div className="bg-[#0B3C5D] p-6 border border-[#0B3C5D] rounded-[4px]">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block mb-4">Kredİ Reytİngİ</span>
            <div className="flex flex-col">
              <div className="text-5xl font-display font-black text-white leading-none mb-1">
                {summary.latest.finalRating}
              </div>
              <div className="text-[10px] text-slate-300 font-bold tracking-widest">BANKA KARŞILIĞI: TEMİNATLI ÇALIŞILABİLİR</div>
            </div>
          </div>

          <div className="bg-white p-6 border border-slate-200 rounded-[4px] flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">Rİsk Sevİyesİ</span>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${summary.risk.dot}`} />
              <div className={`text-2xl font-bold tracking-tight ${summary.risk.color}`}>
                {summary.risk.label}
              </div>
            </div>
          </div>

        </div>

        {/* 2. Category Cards (Middle 4) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CategoryCard label="LİKİDİTE" score={summary.latest.liquidityScore} />
          <CategoryCard label="KARLILIK" score={summary.latest.profitabilityScore} />
          <CategoryCard label="KALDIRAÇ" score={summary.latest.leverageScore} />
          <CategoryCard label="FAALİYET" score={summary.latest.activityScore} />
        </div>

        {/* 3. Action Engine (Prominent Block) */}
        <div className="bg-white border border-slate-200 rounded-[4px] mt-8">
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-[#0B3C5D]">Kritik Aksiyon Planı</h2>
              <p className="text-slate-500 text-xs mt-1">Kredi skorunu &quot;{summary.latestTarget?.targetRating ?? 'AA'}&quot; seviyesine yükseltmek için öncelikli eylemler.</p>
            </div>
          </div>
          
          <div className="p-0">
            {summary.latestTarget ? (
              <ActionPanel plan={summary.latestTarget.minimumPlan} idealPlan={summary.latestTarget.idealPlan} />
            ) : (
              <div className="p-16 text-center text-slate-400 text-sm">
                Aksiyon listesi bulunamadı. Lütfen analiz motorunu çalıştırın.
              </div>
            )}
          </div>
        </div>

      </div>
    </FinrateShell>
  )
}

function CategoryCard({ label, score }: { label: string; score: number; }) {
  return (
    <div className="bg-white p-5 border border-slate-200 rounded-[4px]">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">{label} GÜCÜ</span>
      <div className="text-2xl font-bold text-[#0B3C5D]">{Math.round(score)}</div>
    </div>
  )
}

function ActionPanel({ plan, idealPlan }: { plan: ActionPlan; idealPlan: ActionPlan }) {
  const [activeTab, setActiveTab] = useState<'minimum'|'ideal'>('minimum')
  const currentPlan = activeTab === 'minimum' ? plan : idealPlan

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-6 px-6 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('minimum')}
          className={`py-4 text-xs font-bold tracking-widest uppercase border-b-2 transition-colors ${activeTab === 'minimum' ? 'border-[#0B3C5D] text-[#0B3C5D]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
           MİNİMUM SET ({plan.suggestions.length})
        </button>
        <button 
          onClick={() => setActiveTab('ideal')}
          className={`py-4 text-xs font-bold tracking-widest uppercase border-b-2 transition-colors ${activeTab === 'ideal' ? 'border-[#0B3C5D] text-[#0B3C5D]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
           İDEAL SET ({idealPlan.suggestions.length})
        </button>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100">
         <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <div className="col-span-3">FİNANSAL METRİK</div>
            <div className="col-span-6">GEREKLİ AKSİYON</div>
            <div className="col-span-3 text-right">SKOR ETKİSİ</div>
         </div>
        
        {currentPlan.suggestions.map((s) => (
          <div key={s.key} className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-slate-50 transition-colors">
            <div className="col-span-3">
               <span className="text-sm font-bold text-[#0B3C5D]">{s.label}</span>
               <div className="text-[10px] text-slate-500 mt-1">Mevcut: {formatValue(s.currentValue, s.unit)}</div>
            </div>
            <div className="col-span-6">
               <span className="text-sm text-slate-700">Skoru hedefe taşımak için oranı <strong className="text-[#0B3C5D]">{formatValue(s.targetValue, s.unit)}</strong> seviyesine çekmeniz/yapılandırmanız önerilir.</span>
            </div>
            <div className="col-span-3 text-right">
               <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-xs font-bold border border-emerald-100">
                  +{s.marginalScoreGain.toFixed(1)} Puan
               </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
         <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            Bu metrikler sağlandığında projeksiyon notunuz <strong className="text-[#0B3C5D]">{currentPlan.projectedRating}</strong> seviyesine ulaşacaktır.
         </span>
      </div>
    </div>
  )
}
