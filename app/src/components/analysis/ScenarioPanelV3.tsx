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
  ChevronDown,
  Lightbulb,
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

// ─── classifyLeg ─────────────────────────────────────────────────────────────

/**
 * TDHP hesap koduna ve kayıt yönüne göre bilanço hareketinin
 * görünür yönünü belirler. Faz 7.3.5C1.
 * Aktif (1xx/2xx) : Borç=artan(yeşil),  Alacak=azalan(pembe)
 * Pasif (3xx-5xx)  : Alacak=artan(yeşil), Borç=azalan(pembe)
 * Gelir (6xx)      : Alacak=artan(yeşil), Borç=azalan(pembe)
 * Gider (7xx)      : Borç=artan(pembe),   Alacak=azalan(yeşil)
 */
function classifyLeg(accountCode: string, side: 'DEBIT' | 'CREDIT'): 'increase' | 'decrease' {
  const p = accountCode.charAt(0)
  if (p === '1' || p === '2') return side === 'DEBIT'  ? 'increase' : 'decrease'
  if (p === '3' || p === '4' || p === '5') return side === 'CREDIT' ? 'increase' : 'decrease'
  if (p === '6') return side === 'CREDIT' ? 'increase' : 'decrease'
  if (p === '7') return side === 'DEBIT'  ? 'decrease' : 'increase'
  return side === 'DEBIT' ? 'increase' : 'decrease'
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
  return (
    <span className="text-xs px-2 py-0.5 rounded-[6px] font-medium bg-[#E5E9F0] text-[#0B3C5D]">{horizon}</span>
  )
}

// ─── TypeBadge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const label = type === 'STRUCTURAL' ? 'Yapısal' : type === 'COSMETIC' ? 'Reclass' : 'Karma'
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
              Gerçekçi Üst Sınır
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
            {exec.targetMatchesRequest ?? exec.isTargetFeasible ? 'Hedef Ulaşılabilir' : 'Hedef Sınırlı'}
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
          <div className="flex items-center gap-2 text-[#0B3C5D] font-semibold text-sm">
            <MessageSquare size={16} />
            Danışman Yorumu
          </div>

          {consultant.problem && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Temel Problem</div>
              <div className="text-sm text-slate-800 leading-relaxed">{consultant.problem}</div>
            </div>
          )}

          {consultant.coreIssue && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Çekirdek Mesele</div>
              <div className="text-sm text-slate-800 leading-relaxed">{consultant.coreIssue}</div>
            </div>
          )}

          {consultant.shortTermPriority && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Kısa Vadede Öncelik</div>
              <div className="text-sm text-slate-800 leading-relaxed">{consultant.shortTermPriority}</div>
            </div>
          )}

          {consultant.structuralNeed && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#64748B] mb-1">Yapısal İhtiyaç</div>
              <div className="text-sm text-slate-800 leading-relaxed">{consultant.structuralNeed}</div>
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
          <div className="flex items-center gap-2 text-[#1E293B] font-semibold text-sm mb-2">
            <TrendingDown size={16} className="text-red-500" />
            Aksiyon Alınmazsa
          </div>
          <div className="text-sm text-[#1E293B] leading-relaxed">{da.ifNotDoneRisk}</div>
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
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any
  expanded: Set<number>
  setExpanded: (s: Set<number>) => void
}) {
  const da      = result.decisionAnswer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions: any[] = da.whatCompanyShouldDo ?? []

  const toggleAction = (idx: number) => {
    const newSet = new Set(expanded)
    if (newSet.has(idx)) newSet.delete(idx)
    else newSet.add(idx)
    setExpanded(newSet)
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
            Firma Ne Yapmalı?
          </h3>
          <p className="text-sm text-[#64748B] mt-1">
            Öncelik sırasına göre {actions.length} aksiyon önerisi.
          </p>
        </div>

        {/* Tablo baslik — V3 flex header */}
        <div className="hidden md:flex items-center gap-4 px-6 py-3 bg-slate-50 border-b border-[#E5E9F0] text-xs uppercase tracking-wide text-[#64748B] font-medium">
          <div className="flex-1">Aksiyon</div>
          <div className="flex-shrink-0">Vade</div>
          <div className="w-24 text-right flex-shrink-0">Tutar</div>
          <div className="w-4 flex-shrink-0" />
        </div>

        {/* Aksiyon satirlari */}
        <div className="divide-y divide-slate-100">
          {actions.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[#64748B]">
              Bu analiz için aksiyon önerisi bulunamadı.
            </div>
          )}
          {actions.map((action, idx) => {
            const isOpen = expanded.has(idx)
            return (
              <div key={idx}>
                {/* V3 başlık şeridi: # + aksiyon adı + neden seçildi tek satır + sağda ufuk/tip/tutar */}
                <button
                  onClick={() => toggleAction(idx)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  {/* # rozeti */}
                  <div
                    className="flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ width: 24, height: 24, borderRadius: 9999, background: '#0B3C5D' }}
                  >
                    {action.priority ?? idx + 1}
                  </div>
                  {/* Aksiyon adı + neden seçildi tek satır */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#1E293B]">{action.actionName}</div>
                    {(action.why ?? toStringArray(action.whySelected)[0]) && (
                      <div className="text-xs text-[#64748B] mt-0.5 truncate">
                        {action.why ?? toStringArray(action.whySelected)[0]}
                      </div>
                    )}
                  </div>
                  {/* Sağda: ufuk badge + tip + tutar + chevron */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <HorizonBadge horizon={action.horizonLabel ?? '—'} />
                    {action.tip && <TypeBadge type={action.tip} />}
                    <span className="font-semibold text-[#1E293B] text-sm min-w-[80px] text-right">
                      {action.amountFormatted ?? '—'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expand detay — Faz 7.3.5C1: Aksiyon kart yeni iki sütun layout */}
                {isOpen && (() => {
                  // Leg sınıflama: debit/credit → aktif/pasif/gelir + yön
                  const legData = da.accountingLegsByAction?.[action.actionId]
                  const debs: { accountCode: string; accountName: string; amountFormatted: string }[] = legData?.debits  ?? []
                  const creds: { accountCode: string; accountName: string; amountFormatted: string }[] = legData?.credits ?? []
                  type CL = { code: string; name: string; amountFormatted: string; direction: 'increase' | 'decrease' }
                  const allLegs: CL[] = [
                    ...debs.map(l  => ({ code: l.accountCode, name: l.accountName, amountFormatted: l.amountFormatted, direction: classifyLeg(l.accountCode, 'DEBIT')  })),
                    ...creds.map(l => ({ code: l.accountCode, name: l.accountName, amountFormatted: l.amountFormatted, direction: classifyLeg(l.accountCode, 'CREDIT') })),
                  ]
                  const activeLegs  = allLegs.filter(l => l.code.charAt(0) === '1' || l.code.charAt(0) === '2')
                  const passiveLegs = allLegs.filter(l => ['3','4','5'].includes(l.code.charAt(0)))
                  const incomeLegs  = allLegs.filter(l => l.code.charAt(0) === '6' || l.code.charAt(0) === '7')

                  const renderLegGroup = (group: CL[]) =>
                    group.length === 0
                      ? <p style={{ margin: 0, fontSize: 13, color: '#94A3B8' }}>Etkilenmez</p>
                      : <>{group.map((leg, i) => (
                          <div
                            key={i}
                            style={{
                              background: leg.direction === 'increase' ? '#F0FDFA' : '#FEF2F2',
                              borderRadius: 6,
                              padding: '8px 12px',
                              marginBottom: 6,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <span style={{ fontSize: 11, color: '#94A3B8', marginRight: 6, fontFamily: 'monospace' }}>{leg.code}</span>
                              <span style={{ fontSize: 13, color: leg.direction === 'increase' ? '#115E59' : '#991B1B', fontWeight: 500 }}>
                                {leg.name}
                              </span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: leg.direction === 'increase' ? '#0F766E' : '#B91C1C', whiteSpace: 'nowrap' }}>
                              {leg.direction === 'increase' ? '+' : '−'}{leg.amountFormatted}
                            </span>
                          </div>
                        ))}</>

                  return (
                    <div style={{ borderTop: '1px solid #E5E9F0', padding: '1.25rem 1.5rem', background: '#FAFBFC' }}>

                      {/* İki sütun grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                        {/* SOL — BİLANÇO / GELİR TABLOSU */}
                        <div>
                          {allLegs.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>
                              Muhasebe etkisi mevcut değil
                            </p>
                          ) : (
                            <>
                              <p style={{ margin: '0 0 8px', fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                                Bilanço — aktif taraf
                              </p>
                              {renderLegGroup(activeLegs)}

                              <div style={{ marginTop: 14 }}>
                                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                                  Pasif taraf
                                </p>
                                {renderLegGroup(passiveLegs)}
                              </div>

                              <div style={{ marginTop: 14 }}>
                                <p style={{ margin: '0 0 8px', fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                                  Gelir tablosu
                                </p>
                                {renderLegGroup(incomeLegs)}
                              </div>
                            </>
                          )}
                        </div>

                        {/* SAĞ — RASYO ETKİSİ */}
                        {action.ratioTransparency != null && (
                          <div>
                            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                              Rasyo Etkisi
                            </p>
                            <RatioTransparencyBlock data={action.ratioTransparency} />
                          </div>
                        )}

                      </div>

                      {/* FOOTER — FİNRATE YORUMU */}
                      {action.bankerPerspective && (
                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #E5E9F0' }}>
                          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: '#0B3C5D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            FİNRATE YORUMU
                          </p>
                          <p style={{ margin: 0, fontSize: 14, color: '#0B3C5D', lineHeight: 1.65 }}>
                            {action.bankerPerspective}
                          </p>
                        </div>
                      )}

                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {/* B. WHY CAPITAL ALONE IS NOT ENOUGH */}
      {da.whyCapitalAloneIsNotEnough && (
        <div className="bg-[#0B3C5D]/5 border border-[#0B3C5D]/20 rounded-[12px] p-6">
          <div className="flex items-center gap-2 text-[#0B3C5D] font-semibold text-sm mb-3">
            <Lightbulb size={18} />
            Neden Sadece Sermaye Yetmez?
          </div>
          <div className="text-sm text-slate-800 leading-relaxed">{da.whyCapitalAloneIsNotEnough}</div>
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rejected:   any[] = Array.isArray(da.rejectedInsights) ? da.rejectedInsights : []
  const comparison = da.comparisonWithV2
  // Muhasebe Etki Tablosu AksiyonPlaniTab expanded bölümüne taşındı (Faz 7.3)

  return (
    <div className="space-y-6">

      {/* A. REJECTED INSIGHTS — Muhasebesel Etki Tablosu AksiyonPlaniTab'a taşındı (Faz 7.3) */}
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
                Neden Bu Aksiyonlar Seçilmedi?
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
            V2 vs V3 Karşılaştırması
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
                V3 Akıllı Analiz
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
  const [loading,             setLoading]             = useState(false)
  const [result,              setResult]              = useState<ScenarioV3ApiResponse | null>(null)
  const [error,               setError]               = useState<string | null>(null)
  const [expandedActions,     setExpandedActions]     = useState<Set<number>>(new Set())
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
        body: JSON.stringify({ analysisId, targetGrade, currentGrade }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errorData = data as ApiErrorResponse
        setError(errorData.error ?? 'Hesaplama başarısız')
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
    { id: 'ozet'    as const, label: 'Özet',           Icon: FileText   },
    { id: 'aksiyon' as const, label: 'Aksiyon Planı', Icon: ListChecks },
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
          Akıllı Yol Haritası
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
          Yapay Zeka Destekli Yapısal Analiz
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

        <div className="mt-5 flex items-center justify-end">
          <button
            onClick={handleRun}
            disabled={loading || !targetGrade}
            className="px-6 py-2.5 text-white font-medium rounded-[8px] transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0B3C5D' }}
            onMouseEnter={e => { if (!loading && targetGrade) (e.currentTarget as HTMLButtonElement).style.background = '#07263D' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0B3C5D' }}
          >
            {loading ? 'Analiz ediliyor...' : 'Yol Haritası Oluştur'}
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
