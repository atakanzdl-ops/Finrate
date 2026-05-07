import type { ScenarioV3 } from './contracts'
import type { ScenarioCardDto, ActionPreviewDto, EngineResultResponseDto } from './responseTypes'
import type { EngineResult } from './engineV3'
import { getActionTemplateV3 } from './actionCatalogV3'
import { normalizeLegacyRating } from './ratingReasoning'

const ACTIONS_PREVIEW_LIMIT = 2

// ─── FAZ 7.3.44: ENGINE RESULT DTO BUILDER ───────────────────────────────────

/**
 * EngineResult → EngineResultResponseDto dönüşümü.
 * Route.ts'de inline bulunan mapping buraya taşındı —
 * hem geriye uyumluluk hem 3-plan response için kullanılır.
 *
 * debug alanı: production'da undefined (NODE_ENV === 'development')
 */
export function buildEngineResultDto(engineResult: EngineResult): EngineResultResponseDto {
  return {
    version:            engineResult.version,
    finalTargetRating:  engineResult.finalTargetRating,
    confidenceModifier: engineResult.confidenceModifier,
    portfolio:          engineResult.portfolio,
    horizons:           engineResult.horizons,
    feasibility:        engineResult.feasibility,
    reasoning:          engineResult.reasoning,
    decisionTrace:      engineResult.decisionTrace,
    // PATCH 2: BankerPerspective metrics için
    layerSummaries:     engineResult.layerSummaries ?? null,
    debug:              process.env.NODE_ENV === 'development'
      ? engineResult.debug
      : undefined,
  }
}

export function formatScenariosForResponse(
  scenarios: ScenarioV3[]
): ScenarioCardDto[] {
  return scenarios.map(toScenarioCardDto)
}

function toScenarioCardDto(scenario: ScenarioV3): ScenarioCardDto {
  return {
    id:            scenario.id,
    label:         scenario.label,
    targetReached: scenario.targetReached,
    rating: {
      before: normalizeLegacyRating(scenario.rating.before),
      after:  normalizeLegacyRating(scenario.rating.after),
    },
    combinedDelta:  scenario.combinedDelta,
    objectiveDelta: scenario.objectiveDelta,
    actionsPreview: scenario.actions
      .slice(0, ACTIONS_PREVIEW_LIMIT)
      .map(toActionPreviewDto),
    actionCount: scenario.actions.length,
    warnings:    scenario.warnings ?? [],
  }
}

function toActionPreviewDto(action: ScenarioV3['actions'][number]): ActionPreviewDto {
  return {
    actionId:          action.actionId,
    label:             getActionTemplateV3(action.actionId)?.name ?? action.actionId,
    narrativeCategory: action.narrativeCategory,
  }
}
