'use client'

/**
 * ScenarioPanelV3 - V3 Akilli Yol Haritasi Paneli
 *
 * V2 ScenarioPanelV2'nin yaninda paralel calisir. V2 korunur.
 *
 * Feature flag:
 *   ?v=v3 -> bu component render
 *   ?v2=1 -> V2 component render
 *   default -> V1 (eski davranis)
 *
 * API: POST /api/scenarios/v3
 * Backend: V3 engine + decisionLayer
 *
 * UI Felsefesi: "kredi karar platformu" - trading app degil
 *   - Beyaz yuzey + slate tonu
 *   - Koyu lacivert #0B3C5D (primary trust)
 *   - Teal #2EC4B6 (repair accent)
 *   - Banker dili, CFO hissi
 *   - Teknik jargon YOK (UI-ready fields kullan)
 *
 * 3 ic tab:
 *   Ozet         -> Executive + Narrative + Warnings + Banker Perspective
 *   Aksiyon Plani -> WhatCompanyShouldDo + Notch Plans
 *   Detay        -> Accounting + Rejected + V2 Comparison
 *
 * Tum veri backend'den hazir gelir (decisionAnswer), UI sadece render eder.
 */

import { useState } from 'react'
import {
  Sparkles,
  FileText,
  ListChecks,
  Layers,
  AlertTriangle,
  Loader2,
  Info,
  Shield,
  Database,
  MessageSquare,
  Building2,
  TrendingDown,
  Check,
  ChevronDown,
  Lightbulb,
  Calculator,
  X,
  GitCompare,
} from 'lucide-react'
import { getTargetRatingOptions } from '@/lib/scoring/uiRating'
import { normalizeLegacyRating } from '@/lib/scoring/scenarioV3/ratingReasoning'
import { RatioTransparencyBlock } from './RatioTransparencyBlock'
import type { ScenarioV3ApiResponse } from '@/lib/scoring/scenarioV3/responseTypes'

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface ScenarioPanelV3Props {
  analysisId: string
  currentScore: number
  currentGrade: string
}

type ApiErrorResponse = { error?: string }

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatAmount(n: number | undefined | null): string {
  if (n == null || n === 0) return '0 TL'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mr TL`
  if (abs >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} M TL`
  if (abs >= 1_000)         return `${(n / 1_000).toFixed(0)} K TL`
  return `${n.toFixed(0)} TL`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assessLiquidity(productivity: any): string {
  const cashRatio = productivity?.metrics?.cashToAssets ?? 0.1
  if (cashRatio > 0.15) return 'İyi'
  if (cashRatio > 0.05) return 'Orta'
  return 'Düşük'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assessStructuralRisk(productivity: any): string {
  const trapped = productivity?.metrics?.trappedAssetsShare ?? 0
  if (trapped < 0.30) return 'Düşük'
  if (trapped < 0.60) return 'Orta'
  return 'Yüksek'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assessAssetEfficiency(productivity: any): string {
  const score = productivity?.productivityScore ?? 0
  if (score >= 0.70) return 'İyi'
  if (score >= 0.40) return 'Orta'
  return 'Zayıf'
}

/**
 * Backend'den gelen alan string veya string[] olabilir.
 * Her iki durumu da guvenceli string[] 'e normalize eder.
 * Null / undefined → bos dizi.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v)).filter(v => v && v.trim().length > 0)
  }
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

// ─── BankerMetric ─────────────────────────────────────────────────────────────

function BankerMetric({ label, value }: { label: string; value: string }) {
  const color =
    value === 'İyi'   || value === 'Yüksek' ? 'text-green-600 bg-green-50 border-green-200' :
    value === 'Orta'  || value === 'Düşük'  ? 'text-amber-700 bg-amber-50  border-amber-200' :
    'text-red-700 bg-red-50 border-red-200'

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#64748B]">{label}</span>
      <span className={`text-xs px-2.5 py-1 rounded-[6px] border font-medium ${color}`}>
        {value}
      </span>
    </div>
  )
}

// ─── HorizonBadge ─────────────────────────────────────────────────────────────

function HorizonBadge({ horizon }: { horizon: string }) {
  const color =
    horizon === 'Kisa'  ? 'bg-slate-100 text-[#1E293B]' :
    horizon === 'Orta'  ? 'bg-blue-50 text-blue-700'    :
    'bg-purple-50 text-purple-700'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-[6px] font-medium ${color}`}>{horizon}</span>
  )
}

// ─── TypeBadge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const label = type === 'STRUCTURAL' ? 'Yapisal' : type === 'COSMETIC' ? 'Reclass' : 'Karma'
  const color =
    type === 'STRUCTURAL'
      ? 'bg-[#2EC4B6]/10 text-[#0B7B70] border-[#2EC4B6]/30'
      : type === 'COSMETIC'
      ? 'bg-slate-100 text-[#64748B] border-[#E5E9F0]'
      : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-[6px] font-medium border ${color}`}>{label}</span>
  )
}

// ─── NotchPlanCard ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NotchPlanCard({ plan, title, expanded, onToggle }: { plan: any; title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border border-[#E5E9F0] rounded-[8px] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
              ${plan?.isAchievable ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-[#64748B]'}`}
          >
            {plan?.targetNotches ?? '?'}
          </div>
          <div className="text-left">
            <div className="font-medium text-[#1E293B]">{title}</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {plan?.isAchievable ? 'Ulasilabilir' : 'Mevcut portfoyle ulasilamaz'}
            </div>
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4">
          {/* Narrative — hide degenerate backend text when requiredActionNames is empty */}
          {toStringArray(plan?.requiredActionNames).length > 0
            ? plan?.narrative && (
                <div className="text-sm text-[#1E293B]">{plan.narrative}</div>
              )
            : (
              <div className="text-sm text-[#64748B] italic">
                {plan?.isAchievable
                  ? 'Mevcut portföy bu seviyeye ulaşmak için yeterli görünüyor.'
                  : 'Spesifik aksiyon önerisi üretilemedi.'}
              </div>
            )
          }

          {toStringArray(plan?.requiredActionNames).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-[#64748B] font-medium mb-2">
                Gerekli Aksiyonlar
              </div>
              <div className="flex flex-wrap gap-2">
                {toStringArray(plan?.requiredActionNames).map((a: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-[6px] bg-slate-100 text-[#1E293B]">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {plan?.blockedBy && (
            <div className="bg-amber-50 border border-amber-200 rounded-[6px] p-3 text-xs text-amber-800">
              {plan.blockedBy}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── OZET TAB ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OzetTab({ result }: { result: any }) {
  const da          = result.decisionAnswer
  const exec        = da.executiveAnswer
  const consultant  = da.consultantNarrative
  const productivity = (result as any).engineResult?.layerSummaries?.productivity
    ?? (result as any).layerSummaries?.productivity
    ?? null
  const transition  = result.engineResult?.reasoning?.transition

  return (
    <div className="space-y-6">

      {/* A. EXECUTIVE HERO CARD */}
      <div
        className="rounded-[12px] p-8 text-white"
        style={{ background: '#0B3C5D', boxShadow: '0 10px 30px rgba(11,60,93,0.08)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-[#2EC4B6] font-semibold mb-2">
              Gercekci Ust Sinir
            </div>
            <div className="text-4xl font-bold">
              {exec.achievableTarget ?? exec.achievableRating}
            </div>
            <div className="text-sm text-white/70 mt-1">
              Mevcut: {exec.currentRating}
              {exec.requestedTarget && exec.requestedTarget !== (exec.achievableTarget ?? exec.achievableRating) && (
                <> &bull; İstenen: {exec.requestedTarget}</>
              )}
            </div>
          </div>

          <div
            className={`px-3 py-1.5 rounded-[8px] text-xs font-medium
              ${exec.targetMatchesRequest ?? exec.isTargetFeasible
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}
          >
            {exec.targetMatchesRequest ?? exec.isTargetFeasible ? 'Hedef Ulasilabilir' : 'Hedef Sinirli'}
          </div>
        </div>

        {exec.headline && (
          <div className="text-lg leading-relaxed mt-4">
            {exec.headline}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-sm">
          {(exec.executiveSummary ?? exec.mainReason ?? exec.subtitle) && (
            <div className="flex items-start gap-2">
              <Info size={14} className="text-[#2EC4B6] shrink-0 mt-0.5" />
              <span className="text-white/80">{exec.executiveSummary ?? exec.mainReason ?? exec.subtitle}</span>
            </div>
          )}
          {exec.confidence && (
            <div className="flex items-start gap-2">
              <Shield size={14} className="text-[#2EC4B6] shrink-0 mt-0.5" />
              <span className="text-white/80">
                Güven:{' '}
                <strong className="text-white">
                  {exec.confidence === 'HIGH' ? 'Yüksek' : exec.confidence === 'MEDIUM' ? 'Orta' : 'Düşük'}
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* B. CAPACITY WARNING */}
      {transition?.blockedByPortfolioCapacity && (
        <div className="bg-amber-50 border border-amber-200 rounded-[12px] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <div className="font-semibold text-amber-900 mb-1">
                Portföy Kapasite Uyarısı
              </div>
              <div className="text-sm text-amber-800">
                Teorik rating tavanı mevcut olsa da seçilen aksiyon portföyü bu seviyeyi taşımıyor.
                Mevcut portföyle ulaşılabilir en yüksek seviye:{' '}
                <strong>{exec.achievableTarget ?? exec.achievableRating}</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* C. DATA QUALITY WARNING */}
      {da.dataQualityWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-[12px] p-5">
          <div className="flex items-start gap-3">
            <Database className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <div className="font-semibold text-amber-900 mb-1">Veri Kalitesi Uyarısı</div>
              <div className="text-sm text-amber-800">{da.dataQualityWarning.message}</div>
              {da.dataQualityWarning.recommendation && (
                <div className="text-xs text-amber-700 mt-2">{da.dataQualityWarning.recommendation}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* D. CONSULTANT NARRATIVE + BANKER PERSPECTIVE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* SOL — Consultant Narrative 2/3 */}
        <div className="lg:col-span-2 bg-slate-50 border border-[#E5E9F0] rounded-[12px] p-6 space-y-5">
          <div className="flex items-center gap-2 text-[#0B3C5D] font-semibold">
            <MessageSquare size={16} />
            Danisman Yorumu
          </div>

          {consultant.problem && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Temel Problem</div>
              <div className="text-slate-800 leading-relaxed italic">{consultant.problem}</div>
            </div>
          )}

          {consultant.coreIssue && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Cekirdek Mesele</div>
              <div className="text-slate-800 leading-relaxed italic">{consultant.coreIssue}</div>
            </div>
          )}

          {consultant.shortTermPriority && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Kisa Vadede Oncelik</div>
              <div className="text-slate-800 leading-relaxed italic">{consultant.shortTermPriority}</div>
            </div>
          )}

          {consultant.structuralNeed && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Yapisal Ihtiyac</div>
              <div className="text-slate-800 leading-relaxed italic">{consultant.structuralNeed}</div>
            </div>
          )}

          {consultant.bankerView && (
            <div className="pt-4 border-t border-[#E5E9F0]">
              <div className="text-xs uppercase tracking-wider text-[#0B3C5D] font-semibold mb-1">
                Finrate Yorumu
              </div>
              <div className="text-[#1E293B] leading-relaxed font-medium">{consultant.bankerView}</div>
            </div>
          )}
        </div>

        {/* SAG — Banker Perspective 1/3 */}
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] p-6 space-y-4"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <div className="flex items-center gap-2 text-[#0B3C5D] font-semibold text-sm">
            <Building2 size={16} />
            Finrate Perspektifi
          </div>
          <BankerMetric label="Likidite"          value={assessLiquidity(productivity)} />
          <BankerMetric label="Yapısal Risk"        value={assessStructuralRisk(productivity)} />
          <BankerMetric label="Aktif Verimliliği"  value={assessAssetEfficiency(productivity)} />
          <BankerMetric
            label="Rating Güveni"
            value={
              exec.confidence === 'HIGH'   ? 'Yüksek' :
              exec.confidence === 'MEDIUM' ? 'Orta'   :
              'Düşük'
            }
          />
        </div>
      </div>

      {/* E. AKSIYON ALINMAZSA RISKI */}
      {da.ifNotDoneRisk && (
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] p-6"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <div className="flex items-center gap-2 text-[#1E293B] font-semibold mb-2">
            <TrendingDown size={16} className="text-red-500" />
            Aksiyon Alinmazsa
          </div>
          <div className="text-[#1E293B] leading-relaxed">{da.ifNotDoneRisk}</div>
        </div>
      )}

    </div>
  )
}

// ─── AKSIYON PLANI TAB ────────────────────────────────────────────────────────

function AksiyonPlaniTab({
  result,
  expanded,
  setExpanded,
  expandedNotch,
  setExpandedNotch,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  expanded: Set<number>
  setExpanded: (s: Set<number>) => void
  expandedNotch: Set<'one' | 'two'>
  setExpandedNotch: (s: Set<'one' | 'two'>) => void
}) {
  const da      = result.decisionAnswer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions: any[] = da.whatCompanyShouldDo ?? []

  // AMAÇ ve TİP kolonları: hiçbir aksiyonda dolu değilse tamamen gizle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAmac = actions.some((a: any) => a.amac && a.amac !== '—' && a.amac !== '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasTip  = actions.some((a: any) => a.tip  && a.tip  !== '—' && a.tip  !== '')

  const toggleAction = (idx: number) => {
    const newSet = new Set(expanded)
    if (newSet.has(idx)) newSet.delete(idx)
    else newSet.add(idx)
    setExpanded(newSet)
  }

  const toggleNotch = (plan: 'one' | 'two') => {
    const newSet = new Set(expandedNotch)
    if (newSet.has(plan)) newSet.delete(plan)
    else newSet.add(plan)
    setExpandedNotch(newSet)
  }

  return (
    <div className="space-y-6">

      {/* A. ANA AKSIYON TABLOSU */}
      <div
        className="bg-white border border-[#E5E9F0] rounded-[12px] overflow-hidden"
        style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
      >
        <div className="p-6 border-b border-[#E5E9F0]">
          <h3 className="text-lg font-bold text-[#0B3C5D]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Firma Ne Yapmali?
          </h3>
          <p className="text-sm text-[#64748B] mt-1">
            Oncelik sirasina gore {actions.length} aksiyon onerisi.
          </p>
        </div>

        {/* Tablo baslik */}
        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 bg-slate-50 border-b border-[#E5E9F0] text-xs uppercase tracking-wide text-[#64748B] font-medium">
          <div className="col-span-1">#</div>
          <div className="col-span-1">Ufuk</div>
          <div style={{ gridColumn: `span ${hasAmac && hasTip ? 4 : hasAmac || hasTip ? 6 : 8}` }}>Aksiyon</div>
          <div className="col-span-2">Tutar</div>
          {hasAmac && <div className="col-span-2">Amaç</div>}
          {hasTip  && <div className="col-span-1 text-right">Tip</div>}
        </div>

        {/* Aksiyon satirlari */}
        <div className="divide-y divide-slate-100">
          {actions.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[#64748B]">
              Bu analiz icin aksiyon onerisi bulunamadi.
            </div>
          )}
          {actions.map((action, idx) => {
            const isOpen = expanded.has(idx)
            return (
              <div key={idx}>
                <button
                  onClick={() => toggleAction(idx)}
                  className="w-full grid grid-cols-12 gap-3 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  {/* # */}
                  <div className="col-span-1 flex items-center">
                    <div
                      className="flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ width: 20, height: 20, borderRadius: 9999, background: '#0B3C5D' }}
                    >
                      {action.priority ?? idx + 1}
                    </div>
                  </div>
                  {/* Ufuk */}
                  <div className="col-span-1 flex items-center">
                    <HorizonBadge horizon={action.horizonLabel ?? '—'} />
                  </div>
                  {/* Aksiyon */}
                  <div
                    className="flex items-center"
                    style={{ gridColumn: `span ${hasAmac && hasTip ? 4 : hasAmac || hasTip ? 6 : 8}` }}
                  >
                    <div>
                      <div className="font-medium text-[#1E293B]">{action.actionName}</div>
                      {action.why && (
                        <div className="text-xs text-[#64748B] mt-0.5">{action.why}</div>
                      )}
                    </div>
                  </div>
                  {/* Tutar */}
                  <div className="col-span-2 flex items-center">
                    <div className="font-semibold text-[#1E293B]">{action.amountFormatted ?? '—'}</div>
                  </div>
                  {/* Amac — sadece veri varsa */}
                  {hasAmac && (
                    <div className="col-span-2 flex items-center">
                      <div className="text-sm text-[#64748B]">{action.amac || '—'}</div>
                    </div>
                  )}
                  {/* Tip + chevron */}
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {hasTip && action.tip && <TypeBadge type={action.tip} />}
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expand detay */}
                {isOpen && (
                  <div className="px-6 pb-5 bg-slate-50/50 space-y-4">
                    {/* Why Selected — toStringArray: backend string or string[] → safe array */}
                    {toStringArray(action.whySelected).length > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-[#64748B] font-medium mb-2 mt-4">
                          Neden Bu Aksiyon Secildi?
                        </div>
                        <ul className="space-y-1.5">
                          {toStringArray(action.whySelected).map((reason: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]">
                              <Check size={14} className="text-[#2EC4B6] shrink-0 mt-0.5" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Muhasebe Bacaklari — accountingLegsByAction lookup */}
                    {(() => {
                      const legs  = da.accountingLegsByAction?.[action.actionId]
                      const debs  = legs?.debits  ?? []
                      const creds = legs?.credits ?? []
                      if (debs.length === 0 && creds.length === 0) {
                        return (
                          <p className="text-sm text-[#94A3B8] mt-4">
                            Bu aksiyon için muhasebe detayı mevcut değil.
                          </p>
                        )
                      }
                      return (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-[#64748B] font-medium mb-2 mt-4">
                          Muhasebe Etkisi
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-white border border-[#E5E9F0] rounded-[8px] p-3">
                            <div className="text-xs text-[#64748B] mb-2">Borc</div>
                            {debs.map((leg: { accountCode: string; accountName: string; amountFormatted: string }, i: number) => (
                              <div key={i} className="flex justify-between text-sm text-slate-800 font-mono py-0.5">
                                <span>{leg.accountCode} {leg.accountName}</span>
                                <span className="ml-3 text-[#2EC4B6] font-semibold">{leg.amountFormatted}</span>
                              </div>
                            ))}
                          </div>
                          <div className="bg-white border border-[#E5E9F0] rounded-[8px] p-3">
                            <div className="text-xs text-[#64748B] mb-2">Alacak</div>
                            {creds.map((leg: { accountCode: string; accountName: string; amountFormatted: string }, i: number) => (
                              <div key={i} className="flex justify-between text-sm text-slate-800 font-mono py-0.5">
                                <span>{leg.accountCode} {leg.accountName}</span>
                                <span className="ml-3 text-red-500 font-semibold">{leg.amountFormatted}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      )
                    })()}

                    {/* RatioTransparencyBlock — sadece computeAmount aktif aksiyonlarda */}
                    {action.ratioTransparency != null && (
                      <RatioTransparencyBlock data={action.ratioTransparency} />
                    )}

                    {/* Banker Perspective */}
                    {action.bankerPerspective && (
                      <div className="bg-[#0B3C5D]/5 border border-[#0B3C5D]/20 rounded-[8px] p-3">
                        <div className="text-xs uppercase tracking-wide text-[#0B3C5D] font-medium mb-1">
                          Finrate Yorumu
                        </div>
                        <div className="text-sm text-slate-800">{action.bankerPerspective}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* B. NOTCH PLANLARI */}
      <div
        className="bg-white border border-[#E5E9F0] rounded-[12px] p-6"
        style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
      >
        <h3
          className="text-lg font-bold text-[#0B3C5D] mb-4"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          Iyilestirme Senaryolari
        </h3>
        <div className="space-y-3">
          <NotchPlanCard
            plan={da.oneNotchPlan}
            title="İlk İyileştirme Planı"
            expanded={expandedNotch.has('one')}
            onToggle={() => toggleNotch('one')}
          />
          <NotchPlanCard
            plan={da.twoNotchPlan}
            title="İleri İyileştirme Planı"
            expanded={expandedNotch.has('two')}
            onToggle={() => toggleNotch('two')}
          />
        </div>
      </div>

      {/* C. WHY CAPITAL ALONE IS NOT ENOUGH */}
      {da.whyCapitalAloneIsNotEnough && (
        <div className="bg-[#0B3C5D]/5 border border-[#0B3C5D]/20 rounded-[12px] p-6">
          <div className="flex items-center gap-2 text-[#0B3C5D] font-semibold mb-3">
            <Lightbulb size={18} />
            Neden Sadece Sermaye Yetmez?
          </div>
          <div className="text-slate-800 leading-relaxed">{da.whyCapitalAloneIsNotEnough}</div>
        </div>
      )}

    </div>
  )
}

// ─── DETAY TAB ────────────────────────────────────────────────────────────────

function DetayTab({
  result,
  rejectedExpanded,
  setRejectedExpanded,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  rejectedExpanded: boolean
  setRejectedExpanded: (v: boolean) => void
}) {
  const da         = result.decisionAnswer
  // Aksiyon Planı chevron ile AYNI kaynak: whatCompanyShouldDo + accountingLegsByAction
  // accountingImpactTable KULLANILMAZ — flat rows, .debits/.credits yok → kutular boş
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consolidatedActions: any[] = Array.isArray(da.whatCompanyShouldDo) ? da.whatCompanyShouldDo : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rejected:   any[] = Array.isArray(da.rejectedInsights) ? da.rejectedInsights : []
  const comparison = da.comparisonWithV2

  // Muhasebe verisi olan aksiyonlar (en az bir BORÇ veya ALACAK bacağı olmalı)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionsWithLegs = consolidatedActions.filter((action: any) => {
    const legs = da.accountingLegsByAction?.[action.actionId]
    return (legs?.debits?.length ?? 0) > 0 || (legs?.credits?.length ?? 0) > 0
  })

  return (
    <div className="space-y-6">

      {/* A. ACCOUNTING IMPACT TABLE — accountingLegsByAction datasource */}
      {actionsWithLegs.length > 0 && (
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] overflow-hidden"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <div className="p-6 border-b border-[#E5E9F0]">
            <h3
              className="text-lg font-bold text-[#0B3C5D] flex items-center gap-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              <Calculator size={18} />
              Muhasebesel Etki Tablosu
            </h3>
            <p className="text-sm text-[#64748B] mt-1">
              Her aksiyonun bilanco uzerindeki cift tarafli etkisi.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {actionsWithLegs.map((action: any, idx: number) => {
              const legs  = da.accountingLegsByAction?.[action.actionId]
              const debs  = legs?.debits  ?? []
              const creds = legs?.credits ?? []
              return (
                <div key={idx} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-[#1E293B]">{action.actionName}</div>
                    <div className="text-sm font-semibold text-[#1E293B]">
                      {action.amountFormatted ?? formatAmount(action.amountTRY)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-[8px] p-3">
                      <div className="text-xs text-[#64748B] uppercase font-medium mb-2">Borc</div>
                      {debs.length === 0
                        ? <div className="text-xs text-slate-400 italic">Borç kaydı yok</div>
                        : debs.map((d: { accountCode: string; accountName: string; amountFormatted: string }, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1">
                            <span className="text-[#1E293B] font-mono text-xs">
                              {d.accountCode} {d.accountName}
                            </span>
                            <span className="font-semibold ml-2" style={{ color: '#2EC4B6' }}>
                              {d.amountFormatted}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                    <div className="bg-slate-50 rounded-[8px] p-3">
                      <div className="text-xs text-[#64748B] uppercase font-medium mb-2">Alacak</div>
                      {creds.length === 0
                        ? <div className="text-xs text-slate-400 italic">Alacak kaydı yok</div>
                        : creds.map((c: { accountCode: string; accountName: string; amountFormatted: string }, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm py-1">
                            <span className="text-[#1E293B] font-mono text-xs">
                              {c.accountCode} {c.accountName}
                            </span>
                            <span className="text-red-500 font-semibold ml-2">
                              {c.amountFormatted}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* B. REJECTED INSIGHTS */}
      {rejected.length > 0 && (
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] overflow-hidden"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <button
            onClick={() => setRejectedExpanded(!rejectedExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
          >
            <div className="text-left">
              <h3
                className="text-lg font-bold text-[#0B3C5D] flex items-center gap-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                <X size={18} className="text-red-500" />
                Neden Bu Aksiyonlar Secilmedi?
              </h3>
              <p className="text-sm text-[#64748B] mt-1">
                Yüksek skor alıp reddedilen {rejected.length} aksiyon.
              </p>
            </div>
            <ChevronDown
              size={20}
              className={`text-slate-400 transition-transform flex-shrink-0 ${rejectedExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {rejectedExpanded && (
            <div className="border-t border-slate-100 divide-y divide-slate-100">
              {rejected.map((r, idx) => (
                <div key={idx} className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-[#1E293B]">{r.actionName}</div>
                    <div className="text-xs text-slate-400 ml-3 flex-shrink-0">
                      {formatAmount(r.amountTRY)}
                    </div>
                  </div>

                  {(() => {
                    const displayReason =
                      r.reasonDisplay ||
                      'Bu aksiyon mevcut veriyle uygun görülmedi.'
                    const reasons = toStringArray(displayReason)
                    if (reasons.length === 0) return null
                    return (
                      <ul className="space-y-1 mt-2">
                        {reasons.map((reason: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]">
                            <X size={14} className="text-red-400 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  })()}

                  {r.whatWouldHaveHappened && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-[6px] text-xs text-[#64748B] italic">
                      {r.whatWouldHaveHappened}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* C. V2 COMPARISON */}
      {comparison && (
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] p-6"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <h3
            className="text-lg font-bold text-[#0B3C5D] flex items-center gap-2 mb-4"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            <GitCompare size={18} />
            V2 vs V3 Karsilastirmasi
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-[#E5E9F0] rounded-[8px] p-4">
              <div className="text-xs uppercase tracking-wide text-[#64748B] font-medium mb-2">
                V2 Klasik
              </div>
              <div className="text-slate-800">{comparison.v2Claim}</div>
            </div>
            <div className="bg-[#0B3C5D]/5 border border-[#0B3C5D]/20 rounded-[8px] p-4">
              <div className="text-xs uppercase tracking-wide text-[#0B3C5D] font-medium mb-2">
                V3 Akilli Analiz
              </div>
              <div className="text-slate-800">{comparison.v3View}</div>
            </div>
          </div>

          {comparison.keyDifference && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-[8px]">
              <div className="text-xs uppercase tracking-wide text-amber-800 font-semibold mb-1">
                Temel Fark
              </div>
              <div className="text-sm text-amber-900">{comparison.keyDifference}</div>
            </div>
          )}
        </div>
      )}

      {/* D. TARGET FEASIBILITY */}
      {da.targetFeasibilityExplanation && (
        <div
          className="bg-white border border-[#E5E9F0] rounded-[12px] p-6"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <h3
            className="text-lg font-bold text-[#0B3C5D] mb-3"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Hedef Degerlendirmesi
          </h3>
          <div className="text-[#1E293B] leading-relaxed whitespace-pre-line">
            {da.targetFeasibilityExplanation}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function ScenarioPanelV3({ analysisId, currentScore: _currentScore, currentGrade }: ScenarioPanelV3Props) {
  const [targetGrade,         setTargetGrade]         = useState<string>('')
  const [selectedUiRating,    setSelectedUiRating]    = useState<string>('')
  const [activeTab,           setActiveTab]           = useState<'ozet' | 'aksiyon' | 'detay'>('ozet')
  const [includeV2Comparison, setIncludeV2Comparison] = useState<boolean>(false)
  const [loading,             setLoading]             = useState(false)
  const [result,              setResult]              = useState<ScenarioV3ApiResponse | null>(null)
  const [error,               setError]               = useState<string | null>(null)
  const [expandedActions,     setExpandedActions]     = useState<Set<number>>(new Set())
  const [expandedNotchPlans,  setExpandedNotchPlans]  = useState<Set<'one' | 'two'>>(new Set())
  const [rejectedExpanded,    setRejectedExpanded]    = useState<boolean>(false)

  const handleRun = async () => {
    if (!targetGrade) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/scenarios/v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, targetGrade, currentGrade, includeV2Comparison }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorData = data as ApiErrorResponse
        setError(errorData.error ?? 'Hesaplama basarisiz')
        return
      }
      const successData = data as ScenarioV3ApiResponse
      setResult(successData)
      setActiveTab('ozet')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }

  const TABS = [
    { id: 'ozet'    as const, label: 'Ozet',          Icon: FileText   },
    { id: 'aksiyon' as const, label: 'Aksiyon Plani', Icon: ListChecks },
    { id: 'detay'   as const, label: 'Detay',         Icon: Layers     },
  ]

  return (
    <div className="space-y-6">

      {/* A. BASLIK + BADGE */}
      <div className="flex items-center gap-3">
        <h2
          className="text-xl font-black text-[#0B3C5D] tracking-tight"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          Akilli Yol Haritasi
        </h2>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                     border text-xs font-medium"
          style={{
            background: 'rgba(11,60,93,0.07)',
            borderColor: 'rgba(11,60,93,0.15)',
            color: '#0B3C5D',
          }}
        >
          <Sparkles size={12} />
          AI Destekli Yapisal Analiz
        </span>
      </div>

      {/* B. HEDEF NOT SECIM KARTI */}
      <div
        className="bg-white rounded-[12px] border border-[#E5E9F0] p-6"
        style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-[#64748B] uppercase tracking-wide">Mevcut Not</div>
            <div className="text-2xl font-bold text-[#1E293B] mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {normalizeLegacyRating(currentGrade)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#64748B]">Analiz ID</div>
            <div className="text-xs text-slate-400 font-mono">{analysisId.substring(0, 8)}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-[#1E293B] mb-2">Hedef Rating</div>
          {(() => {
            const targetOptions = getTargetRatingOptions(currentGrade)
            if (targetOptions.length === 0) {
              return (
                <p className="text-sm text-[#64748B] italic">
                  Firma zaten en yüksek rating seviyesinde.
                </p>
              )
            }
            return (
              <div className="flex flex-wrap gap-2">
                {targetOptions.map(uiRating => (
                  <button
                    key={uiRating}
                    onClick={() => {
                      setSelectedUiRating(uiRating)
                      setTargetGrade(uiRating)
                    }}
                    className="px-3 py-2 rounded-[8px] text-sm font-medium border transition-all"
                    style={{
                      background:   selectedUiRating === uiRating ? '#0B3C5D' : '#ffffff',
                      color:        selectedUiRating === uiRating ? '#ffffff' : '#1E293B',
                      borderColor:  selectedUiRating === uiRating ? '#0B3C5D' : '#E5E9F0',
                    }}
                  >
                    {uiRating}
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-[#64748B] cursor-pointer">
            <input
              type="checkbox"
              checked={includeV2Comparison}
              onChange={e => setIncludeV2Comparison(e.target.checked)}
              className="rounded border-slate-300 focus:ring-[#0B3C5D]"
              style={{ accentColor: '#0B3C5D' }}
            />
            V2 ile karsilastir
          </label>

          <button
            onClick={handleRun}
            disabled={loading || !targetGrade}
            className="px-6 py-2.5 text-white font-medium rounded-[8px] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0B3C5D' }}
            onMouseEnter={e => { if (!loading && targetGrade) (e.currentTarget as HTMLButtonElement).style.background = '#07263D' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0B3C5D' }}
          >
            {loading ? 'Analiz ediliyor...' : 'Yol Haritasi Olustur'}
          </button>
        </div>
      </div>

      {/* C. ERROR BANNER */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[12px] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-red-800">{error}</div>
          </div>
        </div>
      )}

      {/* D. LOADING STATE */}
      {loading && (
        <div
          className="bg-white rounded-[12px] border border-[#E5E9F0] p-12 text-center"
          style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
        >
          <Loader2 className="animate-spin mx-auto" size={32} style={{ color: '#0B3C5D' }} />
          <div className="mt-4 text-[#64748B]">Portföy analizi hazırlanıyor...</div>
        </div>
      )}

      {/* E. RESULT RENDER */}
      {result && !loading && (
        <>
          {/* TAB NAVIGASYON — under-line pattern */}
          <div
            className="bg-white border border-[#E5E9F0] rounded-[12px] overflow-hidden"
            style={{ boxShadow: '0 1px 2px rgba(10,30,60,0.05)' }}
          >
            <div className="flex border-b border-[#E5E9F0]">
              {TABS.map(({ id, label, Icon }) => {
                const active = activeTab === id
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="flex items-center justify-center gap-2 px-6 py-3.5 text-sm transition-all flex-1"
                    style={{
                      borderBottom: active ? '2px solid #2EC4B6' : '2px solid transparent',
                      color:        active ? '#0B3C5D' : '#6B7280',
                      fontWeight:   active ? 700 : 500,
                      marginBottom: '-1px',
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* TAB ICERIK */}
          {activeTab === 'ozet' && (
            <OzetTab result={result} />
          )}
          {activeTab === 'aksiyon' && (
            <AksiyonPlaniTab
              result={result}
              expanded={expandedActions}
              setExpanded={setExpandedActions}
              expandedNotch={expandedNotchPlans}
              setExpandedNotch={setExpandedNotchPlans}
            />
          )}
          {activeTab === 'detay' && (
            <DetayTab
              result={result}
              rejectedExpanded={rejectedExpanded}
              setRejectedExpanded={setRejectedExpanded}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * GELECEKTEKI IYILESTIRMELER:
 *
 * 1. SSR SAFETY - useV3Scenario hook SSR-safe hale getirilebilir
 *    (useSearchParams from next/navigation).
 *
 * 2. ADMIN-ONLY FEATURE FLAG - Su an herkes ?v=v3 ile acabilir.
 *    Production'da admin/pilot user-only olabilir.
 *
 * 3. ANIMATED TRANSITIONS - framer-motion ile tab gecisleri + card appear.
 *
 * 4. PRINT / EXPORT - Aksiyon plani + accounting table PDF export.
 *
 * 5. COMPARE WITH HISTORY - Gecmis analizlerle kiyasla.
 *
 * 6. MOBILE RESPONSIVE FINE-TUNE - Tablo mobilde card'a donussun.
 *
 * 7. TOOLTIP NETWORK - Her teknik terim yaninda kucuk ? tooltip.
 *
 * 8. BANKER PERSPECTIVE METRIC EXPANSION - Daha cok metrik + acklama.
 *
 * 9. EXECUTIVE HERO CARD VIDEO/CHART - Rating transition gorselleştirmesi.
 *
 * 10. EMPTY STATE - result yok iken daha guzel placeholder.
 */
