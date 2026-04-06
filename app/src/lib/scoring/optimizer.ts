/**
 * Finrate — Inverse Optimization Motoru
 * "Hedef nota ulaşmak için ne yapmalıyım?" sorusunu cevaplar.
 *
 * Algoritma:
 *  1. Her kritik rasyonun gerçekçi bir hedef değere çekilmesinin skor katkısını hesapla.
 *  2. En yüksek kazançlı önerileri sırala.
 *  3. Tüm önerilerin uygulanması durumundaki projeksiyon skorunu hesapla.
 */

import { RatioResult } from './ratios'
import { calculateScore, scoreToRating } from './score'

export const RATING_MIN: Record<string, number> = {
  AAA: 92, AA: 84, A: 76, BBB: 68, BB: 60, B: 52, CCC: 44, CC: 36, C: 28, D: 0,
}

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']

export function getNextRating(rating: string): string | null {
  const idx = RATING_ORDER.indexOf(rating)
  if (idx <= 0) return null
  return RATING_ORDER[idx - 1]
}

export interface RatioSuggestion {
  key: keyof RatioResult
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: 'pct' | 'x' | 'day' | 'ratio'
  direction: 'up' | 'down'
  scoreGain: number
  actionText: string
}

export interface OptimizationResult {
  currentRating: string
  currentScore: number
  targetRating: string
  targetScore: number
  gap: number
  achievable: boolean   // projectedScore >= targetScore
  suggestions: RatioSuggestion[]
  projectedScore: number
  projectedRating: string
}

function fmtVal(val: number | null, unit: RatioSuggestion['unit']): string {
  if (val == null) return '—'
  if (unit === 'pct') return `%${(val * 100).toFixed(1)}`
  if (unit === 'x')   return `${val.toFixed(2)}x`
  if (unit === 'day') return `${Math.round(val)} gün`
  return val.toFixed(2)
}

export function findOptimalPath(
  ratios: RatioResult,
  currentScore: number,
  targetRating: string,
  sector?: string | null,
): OptimizationResult {
  const currentRating = scoreToRating(currentScore)
  const targetScore = RATING_MIN[targetRating] ?? 60
  const gap = Math.max(0, targetScore - currentScore)

  // Finansal baz skor — currentScore combined (70+30), bu saf finansal skordur
  const baseFinancialScore = calculateScore(ratios, sector).finalScore

  // Her rasyonun tek başına sağlayacağı puan kazancını hesapla
  // gain() finansal iyileşmeyi ölçer; combined space'e (%70 ağırlık) çevirir
  function gain(key: keyof RatioResult, newVal: number): number {
    const modified = { ...ratios, [key]: newVal } as RatioResult
    const financialGain = calculateScore(modified, sector).finalScore - baseFinancialScore
    return financialGain * 0.70  // combined score katkısı
  }

  const candidates: RatioSuggestion[] = []

  // ── Likidite ───────────────────────────────────────────────
  const cr = ratios.currentRatio
  if (cr != null && cr < 2.5) {
    const target = Math.min(cr * 1.40, 2.5)
    const g = gain('currentRatio', target)
    if (g > 0.3) candidates.push({
      key: 'currentRatio', label: 'Cari Oran', category: 'Likidite',
      currentValue: cr, targetValue: target, unit: 'x', direction: 'up', scoreGain: g,
      actionText: `Cari oranı ${fmtVal(cr,'x')}'den ${fmtVal(target,'x')}'e çıkarın — kısa vadeli borçları azaltın veya dönen varlıkları artırın`,
    })
  }

  const qr = ratios.quickRatio
  if (qr != null && qr < 1.8) {
    const target = Math.min(qr * 1.35, 1.8)
    const g = gain('quickRatio', target)
    if (g > 0.3) candidates.push({
      key: 'quickRatio', label: 'Asit-Test Oranı', category: 'Likidite',
      currentValue: qr, targetValue: target, unit: 'x', direction: 'up', scoreGain: g,
      actionText: `Asit-test oranını ${fmtVal(qr,'x')}'den ${fmtVal(target,'x')}'e çıkarın — stok dışı likit varlıkları güçlendirin`,
    })
  }

  // ── Karlılık ───────────────────────────────────────────────
  const npm = ratios.netProfitMargin
  if (npm != null && npm < 0.20) {
    const target = Math.min(npm + 0.04, 0.20)
    const g = gain('netProfitMargin', target)
    if (g > 0.3) candidates.push({
      key: 'netProfitMargin', label: 'Net Kar Marjı', category: 'Karlılık',
      currentValue: npm, targetValue: target, unit: 'pct', direction: 'up', scoreGain: g,
      actionText: `Net kar marjını ${fmtVal(npm,'pct')}'dan ${fmtVal(target,'pct')}'a yükseltin — maliyet kısıtın veya fiyatlandırmayı güçlendirin`,
    })
  }

  const em = ratios.ebitdaMargin
  if (em != null && em < 0.25) {
    const target = Math.min(em + 0.05, 0.25)
    const g = gain('ebitdaMargin', target)
    if (g > 0.3) candidates.push({
      key: 'ebitdaMargin', label: 'FAVÖK Marjı', category: 'Karlılık',
      currentValue: em, targetValue: target, unit: 'pct', direction: 'up', scoreGain: g,
      actionText: `FAVÖK marjını ${fmtVal(em,'pct')}'dan ${fmtVal(target,'pct')}'a çıkarın — faiz/amortisman öncesi operasyonel verimliliği artırın`,
    })
  }

  const gm = ratios.grossMargin
  if (gm != null && gm < 0.45) {
    const target = Math.min(gm + 0.06, 0.45)
    const g = gain('grossMargin', target)
    if (g > 0.3) candidates.push({
      key: 'grossMargin', label: 'Brüt Kar Marjı', category: 'Karlılık',
      currentValue: gm, targetValue: target, unit: 'pct', direction: 'up', scoreGain: g,
      actionText: `Brüt marjı ${fmtVal(gm,'pct')}'dan ${fmtVal(target,'pct')}'a artırın — ham madde maliyetlerini düşürün veya ürün mix'i iyileştirin`,
    })
  }

  const roa = ratios.roa
  if (roa != null && roa < 0.15) {
    const target = Math.min(roa + 0.04, 0.15)
    const g = gain('roa', target)
    if (g > 0.3) candidates.push({
      key: 'roa', label: 'Aktif Kârlılığı (ROA)', category: 'Karlılık',
      currentValue: roa, targetValue: target, unit: 'pct', direction: 'up', scoreGain: g,
      actionText: `ROA'yı ${fmtVal(roa,'pct')}'dan ${fmtVal(target,'pct')}'a çıkarın — varlık verimliliğini artırın veya atıl varlıkları tasfiye edin`,
    })
  }

  // ── Kaldıraç ───────────────────────────────────────────────
  const dte = ratios.debtToEquity
  if (dte != null && dte > 0.4) {
    const target = Math.max(dte * 0.65, 0.3)
    const g = gain('debtToEquity', target)
    if (g > 0.3) candidates.push({
      key: 'debtToEquity', label: 'Borç/Özkaynak', category: 'Kaldıraç',
      currentValue: dte, targetValue: target, unit: 'x', direction: 'down', scoreGain: g,
      actionText: `Borç/özkaynak oranını ${fmtVal(dte,'x')}'den ${fmtVal(target,'x')}'e indirin — sermaye artışı yapın veya borç geri ödeyin`,
    })
  }

  const dta = ratios.debtToAssets
  if (dta != null && dta > 0.25) {
    const target = Math.max(dta * 0.65, 0.20)
    const g = gain('debtToAssets', target)
    if (g > 0.3) candidates.push({
      key: 'debtToAssets', label: 'Borç/Aktif', category: 'Kaldıraç',
      currentValue: dta, targetValue: target, unit: 'ratio', direction: 'down', scoreGain: g,
      actionText: `Borç/aktif oranını ${fmtVal(dta,'ratio')}'den ${fmtVal(target,'ratio')}'e indirin — finansal kaldıracı azaltın`,
    })
  }

  const ic = ratios.interestCoverage
  if (ic != null && ic < 8) {
    const target = Math.min(ic * 1.5, 8)
    const g = gain('interestCoverage', target)
    if (g > 0.3) candidates.push({
      key: 'interestCoverage', label: 'Faiz Karşılama', category: 'Kaldıraç',
      currentValue: ic, targetValue: target, unit: 'x', direction: 'up', scoreGain: g,
      actionText: `Faiz karşılama oranını ${fmtVal(ic,'x')}'den ${fmtVal(target,'x')}'e çıkarın — yüksek faizli kredileri refinanse edin`,
    })
  }

  // ── Faaliyet ───────────────────────────────────────────────
  const rec = ratios.receivablesTurnoverDays
  if (rec != null && rec > 20) {
    const target = Math.max(rec * 0.65, 20)
    const g = gain('receivablesTurnoverDays', target)
    if (g > 0.3) candidates.push({
      key: 'receivablesTurnoverDays', label: 'Alacak Tahsil Süresi', category: 'Faaliyet',
      currentValue: rec, targetValue: target, unit: 'day', direction: 'down', scoreGain: g,
      actionText: `Alacak tahsilini ${fmtVal(rec,'day')}'den ${fmtVal(target,'day')}'e kısaltın — tahsilat politikasını sıkılaştırın`,
    })
  }

  const inv = ratios.inventoryTurnoverDays
  if (inv != null && inv > 15) {
    const target = Math.max(inv * 0.65, 15)
    const g = gain('inventoryTurnoverDays', target)
    if (g > 0.3) candidates.push({
      key: 'inventoryTurnoverDays', label: 'Stok Devir Süresi', category: 'Faaliyet',
      currentValue: inv, targetValue: target, unit: 'day', direction: 'down', scoreGain: g,
      actionText: `Stok devir süresini ${fmtVal(inv,'day')}'den ${fmtVal(target,'day')}'e indirin — stok yönetimini optimize edin`,
    })
  }

  const at = ratios.assetTurnover
  if (at != null && at < 2.0) {
    const target = Math.min(at * 1.35, 2.0)
    const g = gain('assetTurnover', target)
    if (g > 0.3) candidates.push({
      key: 'assetTurnover', label: 'Aktif Devir Hızı', category: 'Faaliyet',
      currentValue: at, targetValue: target, unit: 'x', direction: 'up', scoreGain: g,
      actionText: `Aktif devir hızını ${fmtVal(at,'x')}'den ${fmtVal(target,'x')}'e çıkarın — ciroyu artırın veya atıl varlıkları tasfiye edin`,
    })
  }

  // En yüksek kazançlı ilk 5 öneriyi al
  candidates.sort((a, b) => b.scoreGain - a.scoreGain)
  const suggestions = candidates.slice(0, 5)

  // Tüm önerileri uygulayınca projeksiyon
  let projected = { ...ratios } as RatioResult
  for (const s of suggestions) {
    projected = { ...projected, [s.key]: s.targetValue }
  }
  const projectedFinancialScore = calculateScore(projected, sector).finalScore
  const financialGain = projectedFinancialScore - baseFinancialScore
  // Combined projeksiyon: mevcut combined + finansal iyileşme (70% katkı)
  const projectedScore = Math.round(Math.min(100, currentScore + financialGain * 0.70))
  const projectedRating = scoreToRating(projectedScore)

  return {
    currentRating,
    currentScore,
    targetRating,
    targetScore,
    gap,
    achievable: projectedScore >= targetScore,
    suggestions,
    projectedScore,
    projectedRating,
  }
}
