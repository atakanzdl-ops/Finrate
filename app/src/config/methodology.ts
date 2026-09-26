// Metodolojinin TEK KAYNAĞI (görüntüleme katmanı için).
// Değerler motordan türetilir: RATING_BANDS (score.ts) ve SECTOR_WEIGHTS (benchmarks.ts)
// burada kopyalanmaz, okunur — motor değişirse site, rapor ve metodoloji sayfası kendiliğinden uyar.

import { RATING_BANDS } from '@/lib/scoring/score'
import { SECTOR_WEIGHTS } from '@/lib/scoring/benchmarks'
import { RATING_LABEL } from '@/lib/ratingLabels'

export const FINANCIAL_WEIGHT  = 0.70   // combineScores: finansal × 0.70
export const SUBJECTIVE_POINTS = 30     // subjektif toplam puan (max)

export interface RatingBandRow { rating: string; min: number; max: number; label: string }

/** Rating bantları (yüksekten düşüğe), üst sınır bir üst bandın min − 1. */
export const RATING_BAND_TABLE: RatingBandRow[] = RATING_BANDS.map((b, i) => ({
  rating: b.label,
  min: b.min,
  max: i === 0 ? 100 : RATING_BANDS[i - 1].min - 1,
  label: RATING_LABEL[b.label] ?? b.label,
}))

export const CATEGORY_LABEL: Record<'liquidity' | 'profitability' | 'leverage' | 'activity', string> = {
  liquidity: 'Likidite', profitability: 'Kârlılık', leverage: 'Kaldıraç', activity: 'Faaliyet',
}

export interface WeightRange { key: keyof typeof CATEGORY_LABEL; label: string; min: number; max: number }

/** Sektör profillerinin gerçek min–max ağırlık aralıkları (yüzde). */
export const WEIGHT_RANGES: WeightRange[] = (Object.keys(CATEGORY_LABEL) as Array<keyof typeof CATEGORY_LABEL>).map(key => {
  const vals = Object.values(SECTOR_WEIGHTS).map(w => w[key])
  return { key, label: CATEGORY_LABEL[key], min: Math.round(Math.min(...vals) * 100), max: Math.round(Math.max(...vals) * 100) }
})

export function fmtWeightRange(r: WeightRange): string {
  return r.min === r.max ? `%${r.min}` : `%${r.min}–${r.max}`
}

// ─── Guardrail'ler (kaynak: lib/scoring/guardrails.ts) ──────────────────────
export { SHAREHOLDER_LOAN_WARN_RATIO, SHAREHOLDER_LOAN_CAP_RATIO } from '@/lib/scoring/guardrails'
