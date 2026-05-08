import type { RatingGrade } from './ratingReasoning'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { DecisionAnswer } from './decisionLayer'
import type { EngineResult } from './engineV3'

export type { RatingGrade } from './ratingReasoning'
export type { ScoreCategory } from '../scoreImpactProfile'
export type { DecisionAnswer, CanonicalOutcome } from './decisionLayer'

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

// ─── FAZ 7.3.44: 3 PLAN TİPLERİ ─────────────────────────────────────────────

export interface PlanSummaryDto {
  /** Hedef rating bu plan ile ulaşılabilir mi */
  targetReachable: boolean
  /** Portföy toplam tutarı (TRY) */
  totalAmount:     number
  /** Portföydeki aksiyon sayısı */
  actionCount:     number
}

export interface PlanDto {
  /** Plan kimliği */
  id:             'min' | 'moderate' | 'aggressive'
  /** Kullanıcıya gösterilen Türkçe başlık */
  label:          string
  /** Engine'e geçirilen aggressiveness değeri */
  aggressiveness: 'conservative' | 'typical' | 'aggressive'
  /** Bu plana ait banker karar cevabı */
  decisionAnswer: DecisionAnswer
  /** Bu plana ait ham engine çıktısı (DTO) */
  engineResult:   EngineResultResponseDto
  /** Özet metrikler (UI kart görünümü için) */
  summary:        PlanSummaryDto
}

export interface ScenarioV3ApiResponse {
  engine:         'v3'
  analysisId:     string
  sector:         string
  currentRating:  RatingGrade
  targetRating:   RatingGrade
  notchesGained:  number
  confidence:     'HIGH' | 'MEDIUM' | 'LOW'
  /** Geriye uyumluluk: typical plan decisionAnswer */
  decisionAnswer: DecisionAnswer
  /** Geriye uyumluluk: typical plan engineResult */
  engineResult:   EngineResultResponseDto
  scenarios:      ScenarioCardDto[]
  /** Faz 7.3.44: conservative / typical / aggressive 3 alternatif plan */
  plans?:         PlanDto[]
  v2Comparison?:  V2ComparisonDto
}
