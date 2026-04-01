/**
 * Finrate — Skor Motoru
 * 4 kategori → kategori puanı (0-100) → ağırlıklı final skor → rating
 *
 * Ağırlıklar:
 *   Likidite      25%
 *   Karlılık      30%
 *   Kaldıraç      30%
 *   Faaliyet      15%
 */

import { RatioResult } from './ratios'

export interface CategoryScores {
  liquidityScore: number
  profitabilityScore: number
  leverageScore: number
  activityScore: number
}

export interface ScoringResult extends CategoryScores {
  finalScore: number
  finalRating: string
}

// ─── Derecelendirme Tablosu ────────────────────────────────
const RATING_BANDS = [
  { min: 92, label: 'AAA' },
  { min: 84, label: 'AA'  },
  { min: 76, label: 'A'   },
  { min: 68, label: 'BBB' },
  { min: 60, label: 'BB'  },
  { min: 52, label: 'B'   },
  { min: 44, label: 'CCC' },
  { min: 36, label: 'CC'  },
  { min: 28, label: 'C'   },
  { min: 0,  label: 'D'   },
]

export function scoreToRating(score: number): string {
  for (const band of RATING_BANDS) {
    if (score >= band.min) return band.label
  }
  return 'D'
}

/**
 * Doğrusal interpolasyon: bad→0, good→100
 * lowerIsBetter: oran düşüklüğü iyidir (borç/öz kaynak gibi)
 */
function linearScore(
  value: number | null,
  bad: number,
  good: number,
  lowerIsBetter = false,
): number {
  if (value == null) return 50
  const v = lowerIsBetter ? -value : value
  const b = lowerIsBetter ? -bad : bad
  const g = lowerIsBetter ? -good : good
  const lo = Math.min(b, g)
  const hi = Math.max(b, g)
  const clamped = Math.min(Math.max(v, lo), hi)
  return ((clamped - b) / (g - b)) * 100
}

function average(nums: number[]): number {
  if (!nums.length) return 50
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v))
}

// ─── LİKİDİTE ─────────────────────────────────────────────
function calcLiquidity(r: RatioResult): number {
  return average([
    linearScore(r.currentRatio,           0.8,  2.0),
    linearScore(r.quickRatio,             0.5,  1.2),
    linearScore(r.cashRatio,              0.05, 0.5),
    linearScore(r.netWorkingCapitalRatio, -0.1, 0.25),
    linearScore(r.cashConversionCycle,    120,  20, true),
  ])
}

// ─── KARLILIK ─────────────────────────────────────────────
function calcProfitability(r: RatioResult): number {
  return average([
    linearScore(r.grossMargin,      0,     0.50),
    linearScore(r.ebitdaMargin,     0,     0.25),
    linearScore(r.ebitMargin,       -0.05, 0.20),
    linearScore(r.netProfitMargin,  -0.05, 0.15),
    linearScore(r.roa,              -0.02, 0.15),
    linearScore(r.roe,              -0.05, 0.25),
    linearScore(r.roic,             -0.02, 0.20),
  ])
}

// ─── KALDIRAC ─────────────────────────────────────────────
function calcLeverage(r: RatioResult): number {
  return average([
    linearScore(r.debtToEquity,       5.0,  0.5,  true),
    linearScore(r.debtToAssets,       0.85, 0.30, true),
    linearScore(r.debtToEbitda,       8.0,  1.0,  true),
    linearScore(r.interestCoverage,   0.5,  5.0),
    linearScore(r.equityRatio,        0.10, 0.60),
    linearScore(r.shortTermDebtRatio, 1.0,  0.3,  true),
  ])
}

// ─── FAALİYET ─────────────────────────────────────────────
function calcActivity(r: RatioResult): number {
  return average([
    linearScore(r.assetTurnover,              0.2,  1.5),
    linearScore(r.inventoryTurnoverDays,      180,  30,  true),
    linearScore(r.receivablesTurnoverDays,    120,  30,  true),
    linearScore(r.payablesTurnoverDays,       15,   60),
    linearScore(r.fixedAssetTurnover,         0.3,  2.5),
    linearScore(r.operatingExpenseRatio,      0.5,  0.10, true),
  ])
}

// ─── ANA FONKSİYON ────────────────────────────────────────
export function calculateScore(ratios: RatioResult): ScoringResult {
  const liq  = clamp(calcLiquidity(ratios))
  const prof = clamp(calcProfitability(ratios))
  const lev  = clamp(calcLeverage(ratios))
  const act  = clamp(calcActivity(ratios))

  const final = clamp(liq * 0.25 + prof * 0.30 + lev * 0.30 + act * 0.15)
  const rating = scoreToRating(final)

  return {
    liquidityScore:     Math.round(liq  * 100) / 100,
    profitabilityScore: Math.round(prof * 100) / 100,
    leverageScore:      Math.round(lev  * 100) / 100,
    activityScore:      Math.round(act  * 100) / 100,
    finalScore:         Math.round(final * 100) / 100,
    finalRating:        rating,
  }
}
