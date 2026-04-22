import type { SixGroupAnalysis, MicroFilterConfig, SectorCode } from './contracts'
import type { StressLevel } from './dynamicThresholds'

const SECTOR_BASE_PCT: Record<SectorCode, number> = {
  CONSTRUCTION: 0.0045,
  MANUFACTURING: 0.0040,
  TRADE: 0.0035,
  RETAIL: 0.0030,
  SERVICES: 0.0025,
  IT: 0.0020,
}

const STRESS_MULTIPLIER: Record<StressLevel, number> = {
  NO_STRESS: 1.10,
  MILD: 1.00,
  MODERATE: 0.85,
  SEVERE: 0.70,
}

const MIN_LINE_SHARE_BY_STRESS: Record<StressLevel, number> = {
  NO_STRESS: 0.06,
  MILD: 0.05,
  MODERATE: 0.04,
  SEVERE: 0.03,
}

const MIN_ACTION_AMT_PCT_BY_STRESS: Record<StressLevel, number> = {
  NO_STRESS: 0.0025,
  MILD: 0.0020,
  MODERATE: 0.0015,
  SEVERE: 0.0010,
}

const MAX_MICRO_CONTRIB_BY_STRESS: Record<StressLevel, number> = {
  NO_STRESS: 0.25,
  MILD: 0.30,
  MODERATE: 0.40,
  SEVERE: 0.50,
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function computeDynamicMicroFilter(
  analysis: SixGroupAnalysis,
  stressLevel: StressLevel
): MicroFilterConfig {
  const assets = Math.max(analysis.totals.assets, 1)
  const sectorPct = SECTOR_BASE_PCT[analysis.sector] ?? 0.0040
  const stressMul = STRESS_MULTIPLIER[stressLevel]

  const rawMin = assets * sectorPct * stressMul
  const minLineAmountTry = clamp(rawMin, 150_000, 6_000_000)

  return {
    minLineShareInGroup: MIN_LINE_SHARE_BY_STRESS[stressLevel],
    minLineAmountTry,
    minActionAmountPctAssets: MIN_ACTION_AMT_PCT_BY_STRESS[stressLevel],
    maxMicroContributionShare: MAX_MICRO_CONTRIB_BY_STRESS[stressLevel],
  }
}
