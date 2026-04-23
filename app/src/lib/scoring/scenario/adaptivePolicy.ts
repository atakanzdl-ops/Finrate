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
  Record<HorizonKey, { maxEquityIncreasePP: number; maxKvykDecreasePP: number; maxGroupShareDeteriorationPP: number }>
> = {
  STABLE: {
    short:  { maxEquityIncreasePP: 0.05, maxKvykDecreasePP: 0.05, maxGroupShareDeteriorationPP: 0.03 },
    medium: { maxEquityIncreasePP: 0.08, maxKvykDecreasePP: 0.10, maxGroupShareDeteriorationPP: 0.05 },
    long:   { maxEquityIncreasePP: 0.12, maxKvykDecreasePP: 0.15, maxGroupShareDeteriorationPP: 0.07 },
  },
  RECOVERY: {
    short:  { maxEquityIncreasePP: 0.07, maxKvykDecreasePP: 0.07, maxGroupShareDeteriorationPP: 0.04 },
    medium: { maxEquityIncreasePP: 0.11, maxKvykDecreasePP: 0.13, maxGroupShareDeteriorationPP: 0.07 },
    long:   { maxEquityIncreasePP: 0.16, maxKvykDecreasePP: 0.19, maxGroupShareDeteriorationPP: 0.10 },
  },
  CRISIS: {
    short:  { maxEquityIncreasePP: 0.09, maxKvykDecreasePP: 0.09, maxGroupShareDeteriorationPP: 0.06 },
    medium: { maxEquityIncreasePP: 0.15, maxKvykDecreasePP: 0.17, maxGroupShareDeteriorationPP: 0.09 },
    long:   { maxEquityIncreasePP: 0.22, maxKvykDecreasePP: 0.24, maxGroupShareDeteriorationPP: 0.13 },
  },
}

export const CUMULATIVE_GUARDRAIL_STAGE_ADD = {
  0: { equityPP: 0.00, kvykPP: 0.00, groupShareDeteriorationPP: 0.000 },
  1: { equityPP: 0.02, kvykPP: 0.03, groupShareDeteriorationPP: 0.010 },
  2: { equityPP: 0.03, kvykPP: 0.04, groupShareDeteriorationPP: 0.020 },
} as const

export const CUMULATIVE_GUARDRAIL_HARD_MAX = {
  maxEquityIncreasePP:          0.25,
  maxKvykDecreasePP:            0.28,
  maxGroupShareDeteriorationPP: 0.15,
} as const

/** Herhangi bir grubun bilanço payı bu mutlak eşiği geçerse anında dur. */
export const ABSOLUTE_GROUP_SHARE_HARD_STOP = 0.98

export const GUARDRAIL_BREACH_POLICY = {
  onCandidateBreach:                'SKIP_AND_TRY_NEXT' as const,
  maxSkippedCandidatesPerIteration: 8,
  stopWhenNoFeasibleCandidate:      true,
} as const

// ─── Helper Fonksiyonlar ─────────────────────────────────────────────────────

/**
 * Regime belirleme — score ve stres seviyesine göre.
 * CRISIS (agresif gevşetme) -> RECOVERY (orta) -> STABLE (mevcut sıkı kurallar)
 */
export function determineRegime(currentScore: number, stressLevel: StressLevel): Regime {
  if (currentScore < 45 || stressLevel === 'SEVERE') return 'CRISIS'
  if (currentScore < 60 || stressLevel === 'MODERATE') return 'RECOVERY'
  return 'STABLE'
}

/**
 * Gap band belirleme — hedef skor ile mevcut skor arasındaki mesafe.
 * SMALL (<=5) -> MEDIUM (<=15) -> LARGE (>15)
 */
export function determineGapBand(currentScore: number, targetScore: number): GapBand {
  const gap = targetScore - currentScore
  if (gap <= GAP_BANDS.SMALL.max) return 'SMALL'
  if (gap <= GAP_BANDS.MEDIUM.max) return 'MEDIUM'
  return 'LARGE'
}

/**
 * Başlangıç unlock stage — preRelaxIf şartları karşılanırsa 1 ile başla, aksi halde 0.
 * CRISIS + LARGE gap durumunda motor direkt gevşek moddan başlar.
 */
export function initialUnlockStage(
  currentScore: number,
  targetScore: number,
): 0 | 1 | 2 {
  const gap = targetScore - currentScore
  const { preRelaxIf } = GOAL_UNLOCK_POLICY
  if (currentScore < preRelaxIf.scoreLt && gap >= preRelaxIf.gapGte) {
    return 1
  }
  return 0
}

/**
 * Target cap çarpanı — regime × gap × stage.
 * hardMaxMultiplier ile clamp'lenir.
 */
export function computeTargetCapMultiplier(
  regime: Regime,
  horizon: HorizonKey,
  gapBand: GapBand,
  unlockStage: 0 | 1 | 2,
): number {
  const regimeMult = CAP_SCALING.byRegimeAndHorizon[regime][horizon]
  const gapMult    = CAP_SCALING.byGapBand[gapBand]
  const stageMult  = CAP_SCALING.byUnlockStage[unlockStage]
  const combined   = regimeMult * gapMult * stageMult
  return Math.min(combined, CAP_SCALING.hardMaxMultiplier)
}

/**
 * Global cap çarpanı — aynı mantık, farklı tablo.
 */
export function computeGlobalCapMultiplier(
  regime: Regime,
  horizon: HorizonKey,
  gapBand: GapBand,
  unlockStage: 0 | 1 | 2,
): number {
  const regimeMult = GLOBAL_CAP_SCALING.byRegimeAndHorizon[regime][horizon]
  const gapMult    = GLOBAL_CAP_SCALING.byGapBand[gapBand]
  const stageMult  = GLOBAL_CAP_SCALING.byUnlockStage[unlockStage]
  const combined   = regimeMult * gapMult * stageMult
  return Math.min(combined, GLOBAL_CAP_SCALING.hardMaxMultiplier)
}

/**
 * Minimum efficiency eşiği — regime × horizon × gap × stage.
 * Floors ile clamp'lenir (eşik çok düşmesin).
 */
export function computeMinEfficiency(
  regime: Regime,
  horizon: HorizonKey,
  gapBand: GapBand,
  unlockStage: 0 | 1 | 2,
): number {
  const base      = EFFICIENCY_POLICY.minByRegimeAndHorizon[regime][horizon]
  const gapMult   = EFFICIENCY_POLICY.byGapBand[gapBand]
  const stageMult = EFFICIENCY_POLICY.byUnlockStage[unlockStage]
  const combined  = base * gapMult * stageMult
  const floor     = EFFICIENCY_POLICY.floors[horizon]
  return Math.max(combined, floor)
}

/**
 * Hard reject eşikleri — regime × horizon × stage.
 * null dönerse hard reject kapalı (kriz + long gibi).
 * stage arttıkça eşikler yumuşar.
 */
export function computeHardReject(
  regime: Regime,
  horizon: HorizonKey,
  unlockStage: 0 | 1 | 2,
): { balanceSheetImpactGt: number; scoreDeltaLt: number } | null {
  const base = EFFICIENCY_POLICY.hardRejectByRegime[regime][horizon]
  if (base === null) return null

  const adjust = EFFICIENCY_POLICY.hardRejectStageAdjust[unlockStage]
  return {
    balanceSheetImpactGt: base.balanceSheetImpactGt * adjust.impactMult,
    scoreDeltaLt:         base.scoreDeltaLt         * adjust.scoreMult,
  }
}

/**
 * Catastrophic floor — hard reject kapalı olsa bile bu eşiği geçen adaylar reddedilir.
 */
export function isCatastrophic(balanceSheetImpact: number, scoreDelta: number): boolean {
  const floor = EFFICIENCY_POLICY.catastrophicFloor
  return balanceSheetImpact > floor.balanceSheetImpactGt && scoreDelta < floor.scoreDeltaLt
}

/**
 * Kümülatif guardrail eşikleri — regime × horizon × stage.
 * Stage artışı eşikleri yumuşatır.
 * CUMULATIVE_GUARDRAIL_HARD_MAX ile clamp'lenir.
 */
export function computeCumulativeGuardrails(
  regime: Regime,
  horizon: HorizonKey,
  unlockStage: 0 | 1 | 2,
): { maxEquityIncreasePP: number; maxKvykDecreasePP: number; maxGroupShareDeteriorationPP: number } {
  const base    = CUMULATIVE_GUARDRAILS_BY_REGIME[regime][horizon]
  const add     = CUMULATIVE_GUARDRAIL_STAGE_ADD[unlockStage]
  const hardMax = CUMULATIVE_GUARDRAIL_HARD_MAX

  return {
    maxEquityIncreasePP: Math.min(
      base.maxEquityIncreasePP + add.equityPP,
      hardMax.maxEquityIncreasePP,
    ),
    maxKvykDecreasePP: Math.min(
      base.maxKvykDecreasePP + add.kvykPP,
      hardMax.maxKvykDecreasePP,
    ),
    maxGroupShareDeteriorationPP: Math.min(
      base.maxGroupShareDeteriorationPP + add.groupShareDeteriorationPP,
      hardMax.maxGroupShareDeteriorationPP,
    ),
  }
}

/**
 * Unlock edilmeli mi? (stage artırılmalı mı)
 * Koşullar: hedefe ulaşılmadı + gap yeterince büyük + hiç feasible aday kalmadı + stage maxStage altında
 */
export function shouldUnlock(
  goalReached: boolean,
  remainingGap: number,
  noFeasibleCandidate: boolean,
  currentStage: 0 | 1 | 2,
): boolean {
  if (goalReached) return false
  if (currentStage >= GOAL_UNLOCK_POLICY.maxStage) return false
  if (remainingGap < GOAL_UNLOCK_POLICY.minRemainingGapToUnlock) return false
  if (GOAL_UNLOCK_POLICY.requireNoFeasibleCandidate && !noFeasibleCandidate) return false
  return true
}

/**
 * Unlock sonraki stage — 0 → 1 → 2.
 */
export function nextUnlockStage(current: 0 | 1 | 2): 0 | 1 | 2 {
  if (current === 0) return 1
  if (current === 1) return 2
  return 2
}
