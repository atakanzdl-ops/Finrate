import type { ScenarioV3 } from './contracts'
import type { ScenarioCardDto, ActionPreviewDto } from './responseTypes'
import { getActionTemplateV3 } from './actionCatalogV3'
import { normalizeLegacyRating } from './ratingReasoning'

const ACTIONS_PREVIEW_LIMIT = 2

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
