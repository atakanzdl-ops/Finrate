/**
 * Finrate — Skor Attribution Motoru (Faz 2)
 *
 * "Bu aksiyonu uygularsam skorum ne kadar artar?" sorusunu yanıtlar.
 * Multi-senaryo motorunun temel girdisi.
 *
 * Disiplin (Faz 1 Bulgu #5):
 *   calculateScore() ve combineScores() GERÇEK fonksiyonlar çağrılır.
 *   Mock, tahmin, basit ağırlıklı toplam YASAK.
 *   Ceiling/floor bypass edilirse DEKAM gibi düşük-skorlu firmalar
 *   yanlış rating gösterir.
 */

import { calculateRatios, type FinancialInput, type RatioResult } from './ratios'
import { calculateScore, scoreToRating, type ScoringResult } from './score'
import { combineScores } from './subjective'
import type { ObjectiveScoreBreakdown, CombinedScore } from './scenarioV3/contracts'
import {
  applyActionToFinancialInput,
  type SupportedActionId,
  type ActionApplyResult,
} from './actionEffects'

// ─── TIPLER ────────────────────────────────────────────────────────────────

export type { SupportedActionId }

export interface CategoryDelta {
  liquidity:     number   // after − before, −100..+100
  profitability: number
  leverage:      number
  activity:      number
}

export interface ScoreAttribution {
  actionId:     SupportedActionId
  sector:       string
  applied:      boolean      // false: aksiyon bu firma için uygulanamadı
  applyReason?: string       // applied=false ise neden

  beforeInput:  FinancialInput
  afterInput:   FinancialInput

  beforeRatios: RatioResult
  afterRatios:  RatioResult

  beforeObjective: ObjectiveScoreBreakdown
  afterObjective:  ObjectiveScoreBreakdown

  beforeCombined: CombinedScore
  afterCombined:  CombinedScore

  categoryDelta:  CategoryDelta
  objectiveDelta: number     // afterObjective.total − beforeObjective.total
  combinedDelta:  number     // afterCombined.combined − beforeCombined.combined
  ratingChange:   { before: string; after: string }
}

// ─── YARDIMCI DÖNÜŞTÜRÜCÜLER ────────────────────────────────────────────────

function toObjectiveBreakdown(sr: ScoringResult): ObjectiveScoreBreakdown {
  return {
    liquidity:     sr.liquidityScore,
    profitability: sr.profitabilityScore,
    leverage:      sr.leverageScore,
    activity:      sr.activityScore,
    total:         sr.finalScore,
  }
}

function toCombinedScore(
  sr:              ScoringResult,
  subjectiveTotal: number,
): CombinedScore {
  // Bulgu #5 disiplini: gerçek combineScores() çağrılır — ceiling/floor dahil
  const combined = combineScores(sr.finalScore, subjectiveTotal)
  const rating   = scoreToRating(combined)
  return {
    objectiveScore:  sr.finalScore,
    subjectiveTotal,
    combined,
    rating,
  }
}

// ─── ANA FONKSİYON ─────────────────────────────────────────────────────────

/**
 * Aksiyonun kategori bazlı skor etkisini hesaplar.
 *
 * @param actionId       A05 | A06 | A10 | A12 | A18
 * @param beforeInput    Aksiyon öncesi finansal girdi (FinancialInput)
 * @param subjectiveTotal Mali müşavir subjektif skoru (0-30) — sabit girdi, aksiyondan etkilenmez
 * @param sector         Sektör string'i (getSectorBenchmark için)
 */
export function computeScoreAttribution(
  actionId:        SupportedActionId,
  beforeInput:     FinancialInput,
  subjectiveTotal: number,
  sector:          string,
): ScoreAttribution {
  // 1. Aksiyon uygula → afterInput
  const applyResult: ActionApplyResult = applyActionToFinancialInput(
    actionId, beforeInput, sector
  )

  // 2. Rasyoları hesapla (before & after)
  const beforeRatios = calculateRatios({ ...beforeInput, sector })
  const afterRatios  = calculateRatios({ ...applyResult.after, sector })

  // 3. Objektif skoru hesapla (before & after) — gerçek calculateScore()
  const beforeSR = calculateScore(beforeRatios, sector)
  const afterSR  = calculateScore(afterRatios, sector)

  // 4. Breakdown objelerine dönüştür
  const beforeObjective = toObjectiveBreakdown(beforeSR)
  const afterObjective  = toObjectiveBreakdown(afterSR)

  // 5. Kombine skor — gerçek combineScores() + ceiling/floor
  const beforeCombined = toCombinedScore(beforeSR, subjectiveTotal)
  const afterCombined  = toCombinedScore(afterSR,  subjectiveTotal)

  // 6. Deltalar
  const categoryDelta: CategoryDelta = {
    liquidity:     afterObjective.liquidity     - beforeObjective.liquidity,
    profitability: afterObjective.profitability - beforeObjective.profitability,
    leverage:      afterObjective.leverage      - beforeObjective.leverage,
    activity:      afterObjective.activity      - beforeObjective.activity,
  }

  const objectiveDelta = afterObjective.total - beforeObjective.total
  const combinedDelta  = afterCombined.combined - beforeCombined.combined

  return {
    actionId,
    sector,
    applied:      applyResult.applied,
    applyReason:  applyResult.reason,

    beforeInput,
    afterInput:   applyResult.after,

    beforeRatios,
    afterRatios,

    beforeObjective,
    afterObjective,

    beforeCombined,
    afterCombined,

    categoryDelta,
    objectiveDelta,
    combinedDelta,
    ratingChange: {
      before: beforeCombined.rating,
      after:  afterCombined.rating,
    },
  }
}
