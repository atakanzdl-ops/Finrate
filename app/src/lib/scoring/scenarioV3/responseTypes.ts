import type { RatingGrade } from './ratingReasoning'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { DecisionAnswer } from './decisionLayer'
import type { EngineResult } from './engineV3'

export type { RatingGrade } from './ratingReasoning'
export type { ScoreCategory } from '../scoreImpactProfile'
export type { DecisionAnswer } from './decisionLayer'

export interface ActionPreviewDto {
  actionId: string
  label: string
  narrativeCategory: ScoreCategory
}

export interface ScenarioCardDto {
  id: string
  label: string
  targetReached: boolean
  rating: {
    before: RatingGrade
    after: RatingGrade
  }
  combinedDelta: number
  objectiveDelta: number
  actionsPreview: ActionPreviewDto[]
  actionCount: number
  warnings: string[]
}

export interface EngineResultResponseDto {
  version:            EngineResult['version']
  finalTargetRating:  EngineResult['finalTargetRating']
  confidenceModifier: EngineResult['confidenceModifier']
  portfolio:          EngineResult['portfolio']
  horizons:           EngineResult['horizons']
  feasibility?:       NonNullable<EngineResult['feasibility']>
  reasoning:          EngineResult['reasoning']
  decisionTrace:      EngineResult['decisionTrace']
  layerSummaries:     EngineResult['layerSummaries'] | null
  debug?:             NonNullable<EngineResult['debug']>
}

export interface V2ComparisonDto {
  note: string
}

export interface ScenarioV3ApiResponse {
  engine:         'v3'
  analysisId:     string
  sector:         string
  currentRating:  RatingGrade
  targetRating:   RatingGrade
  notchesGained:  number
  confidence:     'HIGH' | 'MEDIUM' | 'LOW'
  decisionAnswer: DecisionAnswer
  engineResult:   EngineResultResponseDto
  scenarios:      ScenarioCardDto[]
  v2Comparison?:  V2ComparisonDto
}
