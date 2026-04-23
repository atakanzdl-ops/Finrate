import type { StressLevel } from './dynamicThresholds'

export type HorizonKey = 'short' | 'medium' | 'long'
export type Regime = 'CRISIS' | 'RECOVERY' | 'STABLE'
export type GapBand = 'SMALL' | 'MEDIUM' | 'LARGE'

export const REGIME_RULES = {
  CRISIS:   { scoreLt: 45, stressIn: ['SEVERE'] as StressLevel[] },
  RECOVERY: { scoreLt: 60, stressIn: ['MODERATE'] as StressLevel[] },
  STABLE:   { scoreGte: 60, stressIn: ['NO_STRESS', 'MILD'] as StressLevel[] },
} as const

export const GAP_BANDS = {
  SMALL:  { max: 5 },
  MEDIUM: { max: 15 },
  LARGE:  { minExclusive: 15 },
} as const

export const MIN_ACTIONS_BY_HORIZON: Record<HorizonKey, number> = {
  short:  2,
  medium: 3,
  long:   4,
}

export const GOAL_UNLOCK_POLICY = {
  maxStage: 2,
  minRemainingGapToUnlock: 5,
  requireNoFeasibleCandidate: true,
  preRelaxIf: {
    scoreLt: 45,
    gapGte:  12,
  },
} as const

export const CAP_SCALING = {
  byRegimeAndHorizon: {
    STABLE:   { short: 1.00, medium: 1.00, long: 1.00 },
    RECOVERY: { short: 1.10, medium: 1.20, long: 1.30 },
    CRISIS:   { short: 1.20, medium: 1.30, long: 1.45 },
  },
  byGapBand: {
    SMALL:  1.00,
    MEDIUM: 1.10,
    LARGE:  1.20,
  },
  byUnlockStage: {
    0: 1.00,
    1: 1.20,
    2: 1.35,
  },
  hardMaxMultiplier: 2.00,
} as const

export const GLOBAL_CAP_SCALING = {
  byRegimeAndHorizon: {
    STABLE:   { short: 1.00, medium: 1.00, long: 1.00 },
    RECOVERY: { short: 1.05, medium: 1.10, long: 1.20 },
    CRISIS:   { short: 1.10, medium: 1.20, long: 1.30 },
  },
  byGapBand: {
    SMALL:  1.00,
    MEDIUM: 1.05,
    LARGE:  1.10,
  },
  byUnlockStage: {
    0: 1.00,
    1: 1.10,
    2: 1.20,
  },
  hardMaxMultiplier: 1.50,
} as const

export const EFFICIENCY_POLICY = {
  minByRegimeAndHorizon: {
    STABLE:   { short: 0.50, medium: 0.35, long: 0.20 },
    RECOVERY: { short: 0.40, medium: 0.28, long: 0.16 },
    CRISIS:   { short: 0.30, medium: 0.20, long: 0.12 },
  },
  byGapBand: {
    SMALL:  1.05,
    MEDIUM: 1.00,
    LARGE:  0.85,
  },
  byUnlockStage: {
    0: 1.00,
    1: 0.85,
    2: 0.70,
  },
  floors: { short: 0.20, medium: 0.15, long: 0.10 },

  hardRejectByRegime: {
    STABLE: {
      short:  { balanceSheetImpactGt: 0.03, scoreDeltaLt: 0.8 },
      medium: { balanceSheetImpactGt: 0.05, scoreDeltaLt: 1.0 },
      long:   { balanceSheetImpactGt: 0.08, scoreDeltaLt: 1.5 },
    },
    RECOVERY: {
      short:  { balanceSheetImpactGt: 0.04, scoreDeltaLt: 0.7 },
      medium: { balanceSheetImpactGt: 0.06, scoreDeltaLt: 0.9 },
      long:   { balanceSheetImpactGt: 0.10, scoreDeltaLt: 1.2 },
    },
    CRISIS: {
      short:  { balanceSheetImpactGt: 0.05, scoreDeltaLt: 0.5 },
      medium: { balanceSheetImpactGt: 0.07, scoreDeltaLt: 0.7 },
      long:   null,
    },
  },

  hardRejectStageAdjust: {
    0: { impactMult: 1.00, scoreMult: 1.00 },
    1: { impactMult: 1.15, scoreMult: 0.85 },
    2: { impactMult: 1.30, scoreMult: 0.70 },
  },

  catastrophicFloor: {
    balanceSheetImpactGt: 0.12,
    scoreDeltaLt:         0.30,
  },
} as const

export const CUMULATIVE_GUARDRAILS_BY_REGIME: Record<
  Regime,
  Record<HorizonKey, { maxEquityIncreasePP: number; maxKvykDecreasePP: number; maxGroupShare: number }>
> = {
  STABLE: {
    short:  { maxEquityIncreasePP: 0.05, maxKvykDecreasePP: 0.05, maxGroupShare: 0.65 },
    medium: { maxEquityIncreasePP: 0.08, maxKvykDecreasePP: 0.10, maxGroupShare: 0.65 },
    long:   { maxEquityIncreasePP: 0.12, maxKvykDecreasePP: 0.15, maxGroupShare: 0.65 },
  },
  RECOVERY: {
    short:  { maxEquityIncreasePP: 0.07, maxKvykDecreasePP: 0.07, maxGroupShare: 0.67 },
    medium: { maxEquityIncreasePP: 0.11, maxKvykDecreasePP: 0.13, maxGroupShare: 0.67 },
    long:   { maxEquityIncreasePP: 0.16, maxKvykDecreasePP: 0.19, maxGroupShare: 0.67 },
  },
  CRISIS: {
    short:  { maxEquityIncreasePP: 0.09, maxKvykDecreasePP: 0.09, maxGroupShare: 0.70 },
    medium: { maxEquityIncreasePP: 0.15, maxKvykDecreasePP: 0.17, maxGroupShare: 0.70 },
    long:   { maxEquityIncreasePP: 0.22, maxKvykDecreasePP: 0.24, maxGroupShare: 0.70 },
  },
}

export const CUMULATIVE_GUARDRAIL_STAGE_ADD = {
  0: { equityPP: 0.00, kvykPP: 0.00, groupShare: 0.00 },
  1: { equityPP: 0.02, kvykPP: 0.03, groupShare: 0.01 },
  2: { equityPP: 0.03, kvykPP: 0.04, groupShare: 0.02 },
} as const

export const CUMULATIVE_GUARDRAIL_HARD_MAX = {
  maxEquityIncreasePP: 0.25,
  maxKvykDecreasePP:   0.28,
  maxGroupShare:       0.72,
} as const

export const GUARDRAIL_BREACH_POLICY = {
  onCandidateBreach:                'SKIP_AND_TRY_NEXT' as const,
  maxSkippedCandidatesPerIteration: 8,
  stopWhenNoFeasibleCandidate:      true,
} as const
