/**
 * Scenario Generator — Faz 5.1 (ana motor)
 *
 * Yaklaşım 3: narrative-first → eligibility → attribution rerank → combination
 *
 * expectedSpillover SADECE buildScenarios içinde (rapor mapping)
 * selection/ranking fonksiyonlarında yasak (Kural 5)
 * score.ts'e dokunulmadı
 * Kural 12: labeled break (outer:) — tek break inner loop'u kırar
 * Kural 13: minimal-action preference rerank
 */

import { randomUUID } from 'crypto'
import { selectCandidates } from './candidateSelection'
import { AttributionCache } from './attributionCache'
import { applyMultipleActions, applyPairBothOrders } from './scenarioCombination'
import { summarizeFatalErrors } from '../sectorStrategy/entityValidation'
import type { ValidationResult } from '../sectorStrategy/entityValidation'
import { scoreToRating, RATING_BANDS, calculateScore } from '../score'
import { combineScores } from '../subjective'
import { calculateRatios } from '../ratios'
import type { FinancialInput } from '../ratios'
import { computeTargetGap } from '../targetGap'
import { getNarrativeCategory } from '../sectorStrategy/narrativeProfiles'
import { getEligibility } from '../sectorStrategy/eligibilityMatrix'
import { getExpectedSpillover } from '../sectorStrategy/expectedSpillovers'  // SADECE buildScenarios için
import {
  NARRATIVE_STRATEGY_VERSION,
} from '../sectorStrategy/narrativeProfiles'
import {
  ELIGIBILITY_STRATEGY_VERSION,
} from '../sectorStrategy/eligibilityMatrix'
import {
  THRESHOLD_STRATEGY_VERSION,
} from '../sectorStrategy/thresholdOverrides'
import {
  SPILLOVER_STRATEGY_VERSION,
} from '../sectorStrategy/expectedSpillovers'
import {
  VALIDATION_STRATEGY_VERSION,
} from '../sectorStrategy/entityValidation'
import { mapSectorStringToId } from '../sectorStrategy/sectorIdMap'
import type { SupportedActionId } from '../actionEffects'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { ScenarioV3, ScoreState, ObjectiveScoreBreakdown, AppliedAction } from './contracts'

export interface GenerateOptions {
  targetRating?: string
  maxScenarios?: number
}

export class ScenarioGenerationError extends Error {
  constructor(public validation: ValidationResult) {
    super(summarizeFatalErrors(validation))
    this.name = 'ScenarioGenerationError'
  }
}

// Kural 4: RATING_BANDS yapısı array of { min, label } → label anahtarıyla ara
function targetRatingToScore(rating: string): number | undefined {
  const band = RATING_BANDS.find(b => b.label === rating)
  return band?.min
}

// Label üretimi (Türkçe)
function buildLabel(actionIds: SupportedActionId[], getNarCat: (id: SupportedActionId) => ScoreCategory): string {
  if (actionIds.length === 1) {
    const cat = getNarCat(actionIds[0])
    const catTr: Record<ScoreCategory, string> = {
      liquidity:     'Likidite',
      activity:      'Faaliyet',
      leverage:      'Kaldıraç',
      profitability: 'Kârlılık',
    }
    return `${catTr[cat] ?? cat} odaklı senaryo (${actionIds[0]})`
  }
  const cats = [...new Set(actionIds.map(getNarCat))]
  if (cats.length === 1) {
    const catTr: Record<ScoreCategory, string> = {
      liquidity:     'Likidite',
      activity:      'Faaliyet',
      leverage:      'Kaldıraç',
      profitability: 'Kârlılık',
    }
    return `${catTr[cats[0]] ?? cats[0]} odaklı kombinasyon`
  }
  return 'Karma senaryo'
}

const STRATEGY_VERSIONS = {
  narrative:   NARRATIVE_STRATEGY_VERSION,
  eligibility: ELIGIBILITY_STRATEGY_VERSION,
  threshold:   THRESHOLD_STRATEGY_VERSION,
  spillover:   SPILLOVER_STRATEGY_VERSION,
  validation:  VALIDATION_STRATEGY_VERSION,
}

type EntityInput = Partial<FinancialInput> & { id?: string; subjective?: number }

function buildScenarios(params: {
  entity:               EntityInput
  singleResults:        { actionId: SupportedActionId; attribution: ReturnType<AttributionCache['getOrCompute']> }[]
  pairResults:          { actions: SupportedActionId[]; state: ScoreState }[]
  beforeState:          ScoreState
  options:              GenerateOptions
  warnings:             string[]
  targetCombinedScore:  number | undefined
}): ScenarioV3[] {
  const { entity, singleResults, pairResults, beforeState, options, warnings, targetCombinedScore } = params
  const sectorId = mapSectorStringToId(entity?.sector ?? null)
  const scenarios: ScenarioV3[] = []

  // Single-action senaryolar
  for (const { actionId, attribution } of singleResults) {
    const afterState = applyMultipleActions(entity, [actionId])
    const beforeCombinedTotal = beforeState.combined
    const afterCombinedTotal  = afterState.combined
    const beforeObjectiveTotal = beforeState.objective.total
    const afterObjectiveTotal  = afterState.objective.total

    // getExpectedSpillover: SADECE burada (rapor mapping — Kural 5)
    const spillover  = sectorId ? getExpectedSpillover(actionId, sectorId) : undefined
    const eligibility = sectorId ? getEligibility(actionId, sectorId) : { decision: 'allow' as const }

    const appliedAction: AppliedAction = {
      actionId,
      narrativeCategory: getNarrativeCategory(actionId),
      expectedSpillover: spillover,
      attribution,
      eligibility,
    }

    scenarios.push({
      id:            randomUUID(),
      label:         buildLabel([actionId], getNarrativeCategory),
      targetRating:  options.targetRating,
      targetReached: targetCombinedScore !== undefined
        ? afterCombinedTotal >= targetCombinedScore
        : false,
      actions:       [appliedAction],
      beforeState,
      afterState,
      combinedDelta: afterCombinedTotal - beforeCombinedTotal,
      objectiveDelta: afterObjectiveTotal - beforeObjectiveTotal,
      rating: {
        before: scoreToRating(beforeCombinedTotal),
        after:  scoreToRating(afterCombinedTotal),
      },
      warnings:         [...warnings],
      strategyVersions: STRATEGY_VERSIONS,
    })
  }

  // Pair senaryolar
  for (const { actions, state: afterState } of pairResults) {
    const beforeCombinedTotal  = beforeState.combined
    const afterCombinedTotal   = afterState.combined
    const beforeObjectiveTotal = beforeState.objective.total
    const afterObjectiveTotal  = afterState.objective.total

    const appliedActions: AppliedAction[] = actions.map(actionId => {
      // getExpectedSpillover: SADECE burada (Kural 5)
      const spillover   = sectorId ? getExpectedSpillover(actionId, sectorId) : undefined
      const eligibility = sectorId ? getEligibility(actionId, sectorId) : { decision: 'allow' as const }
      return {
        actionId,
        narrativeCategory: getNarrativeCategory(actionId),
        expectedSpillover: spillover,
        attribution:       {} as ReturnType<AttributionCache['getOrCompute']>,  // pair combined attribution N/A
        eligibility,
      }
    })

    scenarios.push({
      id:            randomUUID(),
      label:         buildLabel(actions, getNarrativeCategory),
      targetRating:  options.targetRating,
      targetReached: targetCombinedScore !== undefined
        ? afterCombinedTotal >= targetCombinedScore
        : false,
      actions:       appliedActions,
      beforeState,
      afterState,
      combinedDelta: afterCombinedTotal - beforeCombinedTotal,
      objectiveDelta: afterObjectiveTotal - beforeObjectiveTotal,
      rating: {
        before: scoreToRating(beforeCombinedTotal),
        after:  scoreToRating(afterCombinedTotal),
      },
      warnings:         [...warnings],
      strategyVersions: STRATEGY_VERSIONS,
    })
  }

  return scenarios
}

export function generateScenarios(
  entity: EntityInput,
  options: GenerateOptions = {},
): ScenarioV3[] {
  const cache       = new AttributionCache()
  const flagSnapshot = process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES ?? 'false'
  const maxCombos   = 10

  // Before state
  const sector  = typeof entity.sector === 'string' ? entity.sector : ''
  const ratios  = calculateRatios({ ...(entity as FinancialInput), sector })
  const beforeSR = calculateScore(ratios, sector)
  const subjectiveTotal = typeof entity.subjective === 'number' ? entity.subjective : 0
  const beforeCombined  = combineScores(beforeSR.finalScore, subjectiveTotal)

  const beforeObjective: ObjectiveScoreBreakdown = {
    liquidity:     beforeSR.liquidityScore,
    profitability: beforeSR.profitabilityScore,
    leverage:      beforeSR.leverageScore,
    activity:      beforeSR.activityScore,
    total:         beforeSR.finalScore,
  }

  const beforeState: ScoreState = {
    ratios,
    objective: beforeObjective,
    combined:  beforeCombined,
  }

  // Target combined score
  const targetCombinedScore = options.targetRating
    ? targetRatingToScore(options.targetRating)
    : undefined

  // Target category gap — computeTargetGap imzası: { currentObjectiveScore, currentSubjectiveTotal, targetRating }
  let targetCategoryGap: ScoreCategory[] = ['activity', 'profitability']
  try {
    if (options.targetRating) {
      const gapResult = computeTargetGap({
        currentObjectiveScore:  beforeSR.finalScore,
        currentSubjectiveTotal: subjectiveTotal,
        targetRating:           options.targetRating,
      })
      // computeTargetGap weakestCategories döndürmez; tüm 4 kategoriyi fallback olarak kullan
      // Gerçek gap'e göre en zayıf kategorileri seç (mevcut skor en düşük olanlar)
      const categoryScores: { cat: ScoreCategory; score: number }[] = [
        { cat: 'liquidity',     score: beforeSR.liquidityScore },
        { cat: 'activity',      score: beforeSR.activityScore },
        { cat: 'leverage',      score: beforeSR.leverageScore },
        { cat: 'profitability', score: beforeSR.profitabilityScore },
      ]
      if (gapResult.isReachable && gapResult.requiredObjectiveImprovement > 0) {
        // En düşük skoru olan 2 kategoriyi hedefle
        targetCategoryGap = categoryScores
          .sort((a, b) => a.score - b.score)
          .slice(0, 2)
          .map(c => c.cat)
      }
    }
  } catch {
    // fallback default kalır
  }

  const primaryTargetCategory = targetCategoryGap[0]

  // Candidate selection (getExpectedSpillover çağrılmaz — Kural 5)
  const { candidates, validation, warnings } = selectCandidates(entity, targetCategoryGap)
  if (!validation.valid) {
    throw new ScenarioGenerationError(validation)
  }

  // Single-action attribution (cache)
  const singleResults = candidates.map(a => ({
    actionId:    a,
    attribution: cache.getOrCompute(entity, a, flagSnapshot),
  }))

  // Top-5 (Kural 2) — objectiveDelta en yüksek 5
  const sorted = [...singleResults].sort(
    (x, y) => (y.attribution?.objectiveDelta ?? 0) - (x.attribution?.objectiveDelta ?? 0)
  )
  const top5 = sorted.slice(0, 5)

  // 2'li kombinasyonlar — Kural 12: labeled break
  const pairResults: { actions: SupportedActionId[]; state: ScoreState }[] = []
  let comboCount = 0
  outer: for (let i = 0; i < top5.length; i++) {
    for (let j = i + 1; j < top5.length; j++) {
      if (comboCount >= maxCombos) break outer
      const { ordered, result } = applyPairBothOrders(
        entity,
        top5[i].actionId,
        top5[j].actionId,
        primaryTargetCategory,
      )
      pairResults.push({ actions: ordered, state: result })
      comboCount++
    }
  }

  // Senaryo nesneleri (buildScenarios — getExpectedSpillover BURADA izinli)
  const scenarios = buildScenarios({
    entity,
    singleResults,
    pairResults,
    beforeState,
    options,
    warnings,
    targetCombinedScore,
  })

  // Kural 13: minimal-action preference rerank
  return scenarios
    .sort((a, b) => {
      // 1. targetReached (true önce)
      if (a.targetReached !== b.targetReached) return a.targetReached ? -1 : 1
      // 2. actionCount ASC
      if (a.actions.length !== b.actions.length) return a.actions.length - b.actions.length
      // 3. combinedDelta DESC
      if (a.combinedDelta !== b.combinedDelta) return b.combinedDelta - a.combinedDelta
      // 4. objectiveDelta DESC
      return b.objectiveDelta - a.objectiveDelta
    })
    .slice(0, options.maxScenarios ?? 7)
}
