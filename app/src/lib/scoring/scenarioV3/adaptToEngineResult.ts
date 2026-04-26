import type { ScenarioV3, AppliedAction } from './contracts'
import type {
  EngineInput,
  EngineResult,
  HorizonPortfolio,
  SelectedAction,
} from './engineV3'
import type { RatingGrade } from './ratingReasoning'
import { normalizeLegacyRating, ratingToIndex } from './ratingReasoning'
import { ACTION_CATALOG_V3 } from './actionCatalogV3'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toRating(value: string | undefined, fallback: RatingGrade): RatingGrade {
  if (!value) return fallback
  return normalizeLegacyRating(value)
}

function estimateAmount(action: AppliedAction, fallbackCombinedDelta: number): number {
  const seed = Math.abs(action.attribution?.combinedDelta ?? fallbackCombinedDelta)
  return Math.max(500_000, Math.round(seed * 500_000))
}

function toSelectedAction(
  action: AppliedAction,
  index: number,
  scenario: ScenarioV3,
): SelectedAction {
  const actionId = String(action.actionId)
  const template = ACTION_CATALOG_V3[actionId]
  const perActionObjectiveDelta = scenario.objectiveDelta / Math.max(1, scenario.actions.length)
  const perActionCombinedDelta = scenario.combinedDelta / Math.max(1, scenario.actions.length)
  const qualitySeed = action.attribution?.objectiveDelta ?? perActionObjectiveDelta

  return {
    actionId,
    actionName: template?.name ?? actionId,
    horizon: index === 0 ? 'short' : index === 1 ? 'medium' : 'long',
    amountTRY: estimateAmount(action, perActionCombinedDelta),
    transactions: [],
    qualityScore: clamp(0.5 + (qualitySeed / 10), 0, 1),
    productivityRepairStrength: 'MODERATE',
    sustainability: 'SEMI_RECURRING',
    sectorCompatibility: 1,
    guardrailSeverity: 'PASS',
    estimatedNotchContribution: clamp(Math.abs(perActionCombinedDelta) / 5, 0, 2),
    repeatDecayApplied: 1,
    diversityPenaltyApplied: 0,
    narrative: action.eligibility?.reason ?? 'Scenario-based action selection',
    ratioTransparency: undefined,
  }
}

function buildHorizon(
  horizon: 'short' | 'medium' | 'long',
  actions: SelectedAction[],
  cumulativeActions: SelectedAction[],
  targetRating: RatingGrade,
  notchesGained: number,
): HorizonPortfolio {
  const totalAmountTRY = actions.reduce((sum, action) => sum + action.amountTRY, 0)
  return {
    horizon,
    actions,
    cumulativeActions,
    targetRatingAtThisHorizon: targetRating,
    notchesGainedCumulative: notchesGained,
    totalAmountTRY,
    keyInefficienciesRepaired: [],
  }
}

export function adaptScenariosV3ToEngineResult(
  scenarios: ScenarioV3[],
  input: EngineInput,
): EngineResult {
  const currentRating = toRating(input.currentRating, 'C')
  const rawTargetRating = toRating(input.targetRating, currentRating)
  const bestScenario = scenarios[0]

  const selectedActions = bestScenario
    ? bestScenario.actions.map((action, index) => toSelectedAction(action, index, bestScenario))
    : []

  const finalTargetRating = bestScenario
    ? toRating(bestScenario.rating?.after, currentRating)
    : currentRating

  const notchesGained = Math.max(0, ratingToIndex(finalTargetRating) - ratingToIndex(currentRating))
  const isFeasible = ratingToIndex(finalTargetRating) >= ratingToIndex(rawTargetRating)

  const confidence: EngineResult['confidence'] = bestScenario?.targetReached
    ? 'HIGH'
    : notchesGained > 0
      ? 'MEDIUM'
      : 'LOW'
  const confidenceModifier = confidence === 'HIGH' ? 0.9 : confidence === 'MEDIUM' ? 0.65 : 0.4

  const shortActions = selectedActions.filter(a => a.horizon === 'short')
  const mediumActions = selectedActions.filter(a => a.horizon === 'medium')
  const longActions = selectedActions.filter(a => a.horizon === 'long')

  const shortCumulative = shortActions
  const mediumCumulative = [...shortActions, ...mediumActions]
  const longCumulative = [...mediumCumulative, ...longActions]

  const horizons = {
    short: buildHorizon('short', shortActions, shortCumulative, finalTargetRating, Math.min(notchesGained, 1)),
    medium: buildHorizon('medium', mediumActions, mediumCumulative, finalTargetRating, Math.min(notchesGained, 2)),
    long: buildHorizon('long', longActions, longCumulative, finalTargetRating, notchesGained),
  }

  const structuralIds = selectedActions.slice(0, 3).map(action => action.actionId)
  const missedOpportunities = !isFeasible && selectedActions.length > 0
    ? [{
      actionId: selectedActions[0].actionId,
      category: 'HYBRID',
      reason: 'Target rating remains above achievable portfolio level',
      reasonDisplay: 'Ek yapısal aksiyonlar olmadan hedef ratinge ulaşmak zor.',
      estimatedNotchImpact: 1,
    }]
    : []

  const oneNotchScenario = {
    targetNotches: 1,
    requiredActions: structuralIds.slice(0, 2),
    requiredInefficiencyRepairs: [],
    isAchievable: notchesGained >= 1,
    blockedBy: notchesGained >= 1 ? undefined : 'Mevcut portföy 1 notch için yetersiz',
    narrative: notchesGained >= 1
      ? 'Portföy 1 notch iyileşmeyi destekliyor.'
      : '1 notch için ek aksiyon gerekiyor.',
  }

  const twoNotchScenario = {
    targetNotches: 2,
    requiredActions: structuralIds.slice(0, 3),
    requiredInefficiencyRepairs: [],
    isAchievable: notchesGained >= 2,
    blockedBy: notchesGained >= 2 ? undefined : 'Mevcut portföy 2 notch için yetersiz',
    narrative: notchesGained >= 2
      ? 'Portföy 2 notch iyileşmeyi destekliyor.'
      : '2 notch için yapısal aksiyon sayısı artırılmalı.',
  }

  const transition = {
    currentRating,
    rawTargetRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
    confidenceReasons: [] as string[],
    explanation: 'ScenarioV3 adapter output',
    blockedByCeiling: false,
    bindingCeiling: undefined,
    blockedByPortfolioCapacity: !isFeasible,
    portfolioNotchCapacity: notchesGained,
    achievableByPortfolio: notchesGained,
  }

  const feasibility = input.targetRating
    ? {
      requestedTarget: rawTargetRating,
      achievableTarget: finalTargetRating,
      isFeasible,
      reason: isFeasible
        ? 'Hedef rating portföy kapsamında ulaşılabilir.'
        : 'Mevcut portföy hedef rating için yeterli değil.',
      requirements: isFeasible ? [] : ['Ek yapısal aksiyonlar ve daha yüksek objective iyileşme gerekir.'],
    }
    : undefined

  return {
    version: 'v3',
    sector: input.sector,
    currentRating,
    rawTargetRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
    horizons,
    portfolio: selectedActions,
    feasibility,
    reasoning: {
      bindingCeiling: null,
      supportingCeilings: [],
      drivers: {
        positive: bestScenario?.targetReached ? ['Hedef ratinge ulaşan senaryo bulundu'] : [],
        negative: !bestScenario?.targetReached ? ['Hedef ratinge erişim için ek aksiyon gerekiyor'] : [],
        structural: structuralIds,
        cosmetic: [],
      },
      missedOpportunities,
      oneNotchScenario,
      twoNotchScenario,
      sensitivityAnalysis: {
        currentProductivityScore: clamp((bestScenario?.afterState?.objective?.total ?? 0) / 100, 0, 1),
        currentCeiling: finalTargetRating,
        scenarios: [],
        bottleneck: bestScenario?.targetReached ? 'Bottleneck görünmüyor.' : 'Aksiyon kapsamı hedef rating için sınırlı.',
      },
      bankerSummary: bestScenario?.label
        ? `Önerilen senaryo: ${bestScenario.label}`
        : 'Senaryo üretilemedi, mevcut yapı korunuyor.',
      transition,
    },
    layerSummaries: {
      productivity: {
        productivityScore: clamp((bestScenario?.afterState?.objective?.total ?? 0) / 100, 0, 1),
        metrics: { trappedAssetsShare: 0.45 },
        inefficiencyFlags: [],
      },
      sustainability: {
        constraints: {
          hasCeiling: !isFeasible,
          ceilingReasons: !isFeasible ? ['Portföy kapasitesi hedef rating için yetersiz.'] : [],
        },
      },
      sector: {},
      guardrails: [],
    },
    decisionTrace: [],
    debug: {
      iterations: scenarios.length,
      rejectedCandidates: [],
      ledgerChangeLog: [],
      algorithmTrace: ['Adapted from scenarioGenerator output'],
    },
  }
}

export function isEngineResultLike(value: unknown): value is EngineResult {
  if (!value || typeof value !== 'object') return false

  const result = value as Record<string, unknown>
  const reasoning = result.reasoning as Record<string, unknown> | undefined
  const horizons = result.horizons as Record<string, unknown> | undefined

  if (result.version !== 'v3') return false
  if (typeof result.notchesGained !== 'number') return false
  if (typeof result.confidenceModifier !== 'number') return false
  if (!Array.isArray(result.portfolio)) return false

  if (!reasoning || typeof reasoning !== 'object') return false
  if (!('transition' in reasoning)) return false
  if (!('bankerSummary' in reasoning)) return false

  if (!horizons || typeof horizons !== 'object') return false
  const short = horizons.short as Record<string, unknown> | undefined
  const medium = horizons.medium as Record<string, unknown> | undefined
  const long = horizons.long as Record<string, unknown> | undefined

  if (!short || !Array.isArray(short.actions)) return false
  if (!medium || !Array.isArray(medium.actions)) return false
  if (!long || !Array.isArray(long.actions)) return false

  return true
}
