import type { SixGroupAnalysis, MeaningfulImpactThresholds } from './contracts'
import { THRESHOLD_FLOORS, THRESHOLD_CEILINGS, DEFAULT_THRESHOLDS } from './contracts'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Firma ölçeği faktörü — log10 bazlı.
 * 1M TRY → 0.75, 50M → 1.03, 500M → 1.20, 1B+ → 1.25
 */
export function computeSizeFactor(assets: number): number {
  const safeAssets = Math.max(assets, 1)
  const log = Math.log10(safeAssets)
  const normalized = clamp((log - 6) / 3, 0, 1)
  return 0.75 + 0.50 * normalized
}

export type StressLevel = 'NO_STRESS' | 'MILD' | 'MODERATE' | 'SEVERE'

export interface StressAssessment {
  level: StressLevel
  points: number
  factor: number
  details: string[]
}

/**
 * Stres seviyesi tespiti — 4 rasyo üzerinden puanlama.
 */
export function detectStressLevel(analysis: SixGroupAnalysis): StressAssessment {
  let points = 0
  const details: string[] = []

  const currentRatio = analysis.ratios.CURRENT_RATIO?.value ?? 0
  const cashRatio = analysis.ratios.CASH_RATIO?.value ?? 0
  const interestCoverage = analysis.ratios.INTEREST_COVERAGE?.value ?? 0

  // Cari oran
  if (currentRatio > 0) {
    if (currentRatio < 0.90) {
      points += 2
      details.push(`Cari oran kritik (${currentRatio.toFixed(2)} < 0.90) +2`)
    } else if (currentRatio < 1.10) {
      points += 1
      details.push(`Cari oran zayıf (${currentRatio.toFixed(2)} < 1.10) +1`)
    }
  }

  // Nakit oranı — sektör p25 kullanımı için placeholder (0.08 varsayım)
  const sectorCashP25 = 0.08
  if (cashRatio >= 0) {
    const tightThreshold = Math.min(0.03, sectorCashP25 * 0.60)
    const lowThreshold = Math.max(0.05, sectorCashP25)
    if (cashRatio < tightThreshold) {
      points += 2
      details.push(`Nakit oranı çok düşük (${cashRatio.toFixed(3)} < ${tightThreshold.toFixed(3)}) +2`)
    } else if (cashRatio < lowThreshold) {
      points += 1
      details.push(`Nakit oranı düşük (${cashRatio.toFixed(3)} < ${lowThreshold.toFixed(3)}) +1`)
    }
  }

  // Faiz karşılama
  if (interestCoverage > 0) {
    if (interestCoverage < 1.0) {
      points += 2
      details.push(`Faiz karşılama kritik (${interestCoverage.toFixed(2)} < 1.0) +2`)
    } else if (interestCoverage < 1.8) {
      points += 1
      details.push(`Faiz karşılama zayıf (${interestCoverage.toFixed(2)} < 1.8) +1`)
    }
  }

  // NİS / Aktif = (Dönen Varlıklar - KVYK) / Toplam Aktif
  const donenVarliklar = analysis.groups.CURRENT_ASSETS.total
  const kvyk = analysis.groups.SHORT_TERM_LIABILITIES.total
  const assets = analysis.totals.assets

  if (assets > 0) {
    const nwcPctAssets = (donenVarliklar - kvyk) / assets
    if (nwcPctAssets < -0.05) {
      points += 2
      details.push(`NİS/Aktif kritik (${(nwcPctAssets * 100).toFixed(1)}% < -5%) +2`)
    } else if (nwcPctAssets < 0) {
      points += 1
      details.push(`NİS/Aktif negatif (${(nwcPctAssets * 100).toFixed(1)}% < 0) +1`)
    }
  }

  // Seviye + faktör
  let level: StressLevel
  let factor: number

  if (points === 0) {
    level = 'NO_STRESS'
    factor = 1.10
  } else if (points <= 2) {
    level = 'MILD'
    factor = 1.00
  } else if (points <= 5) {
    level = 'MODERATE'
    factor = 0.85
  } else {
    level = 'SEVERE'
    factor = 0.70
  }

  return { level, points, factor, details }
}

/**
 * Hedefe uzaklık faktörü — piecewise-linear.
 * Gap 5 → 1.05, Gap 15 → 0.90, Gap 30 → 0.75, Gap 30+ → 0.70
 */
export function computeGapFactor(currentScore: number, targetScore: number): number {
  const gap = Math.max(0, targetScore - currentScore)

  if (gap <= 5) return 1.05
  if (gap <= 15) return 1.05 - 0.015 * (gap - 5)      // 1.05 → 0.90
  if (gap <= 30) return 0.90 - 0.010 * (gap - 15)     // 0.90 → 0.75
  return 0.70
}

export interface DynamicThresholdsResult extends MeaningfulImpactThresholds {
  _factors: {
    sizeFactor: number
    stressFactor: number
    gapFactor: number
    stressLevel: StressLevel
  }
}

/**
 * Dinamik eşik hesaplama — sizeFactor × stressFactor × gapFactor.
 */
export function computeDynamicThresholds(
  analysis: SixGroupAnalysis,
  currentScore: number,
  targetScore: number,
  base: MeaningfulImpactThresholds = DEFAULT_THRESHOLDS
): DynamicThresholdsResult {
  const assets = Math.max(analysis.totals.assets, 1)
  const sizeFactor = computeSizeFactor(assets)
  const stress = detectStressLevel(analysis)
  const gapFactor = computeGapFactor(currentScore, targetScore)

  const multiplier = sizeFactor * stress.factor * gapFactor

  return {
    minCurrentRatioDelta: clamp(
      base.minCurrentRatioDelta * multiplier,
      THRESHOLD_FLOORS.minCurrentRatioDelta,
      THRESHOLD_CEILINGS.minCurrentRatioDelta
    ),
    minEquityRatioDelta: clamp(
      base.minEquityRatioDelta * multiplier,
      THRESHOLD_FLOORS.minEquityRatioDelta,
      THRESHOLD_CEILINGS.minEquityRatioDelta
    ),
    minInterestCoverageDelta: clamp(
      base.minInterestCoverageDelta * multiplier,
      THRESHOLD_FLOORS.minInterestCoverageDelta,
      THRESHOLD_CEILINGS.minInterestCoverageDelta
    ),
    minNetWorkingCapitalDeltaPctAssets: clamp(
      base.minNetWorkingCapitalDeltaPctAssets * multiplier,
      THRESHOLD_FLOORS.minNetWorkingCapitalDeltaPctAssets,
      THRESHOLD_CEILINGS.minNetWorkingCapitalDeltaPctAssets
    ),
    minQuickRatioDelta: clamp(
      base.minQuickRatioDelta * multiplier,
      THRESHOLD_FLOORS.minQuickRatioDelta,
      THRESHOLD_CEILINGS.minQuickRatioDelta
    ),
    minCashRatioDelta: clamp(
      base.minCashRatioDelta * multiplier,
      THRESHOLD_FLOORS.minCashRatioDelta,
      THRESHOLD_CEILINGS.minCashRatioDelta
    ),
    minDsoImprovementDays: clamp(
      base.minDsoImprovementDays * multiplier,
      THRESHOLD_FLOORS.minDsoImprovementDays,
      THRESHOLD_CEILINGS.minDsoImprovementDays
    ),
    minCccImprovementDays: clamp(
      base.minCccImprovementDays * multiplier,
      THRESHOLD_FLOORS.minCccImprovementDays,
      THRESHOLD_CEILINGS.minCccImprovementDays
    ),
    _factors: {
      sizeFactor,
      stressFactor: stress.factor,
      gapFactor,
      stressLevel: stress.level,
    },
  }
}
