/**
 * Scenario Combination — Faz 5.1
 *
 * applyActionToFinancialInput kullan (applyActionToRatios DEĞİL)
 * Kural 11: pair score = gerçek calculateScore + combineScores (heuristic yasak)
 * expectedSpillover IMPORT YASAK (Kural 5)
 */

import { applyActionToFinancialInput } from '../actionEffects'
import type { SupportedActionId } from '../actionEffects'
import { calculateScore } from '../score'
import { combineScores } from '../subjective'
import { calculateRatios } from '../ratios'
import type { FinancialInput } from '../ratios'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { ScoreState } from './contracts'
import type { ObjectiveScoreBreakdown } from './contracts'

// expectedSpillover: HİÇ import yok

const CATEGORY_ORDER: ScoreCategory[] = ['liquidity', 'activity', 'leverage', 'profitability']

export function sortActionsDeterministic(
  actions: SupportedActionId[],
  getNarrativeCategory: (id: SupportedActionId) => ScoreCategory,
): SupportedActionId[] {
  return [...actions].sort((a, b) => {
    const catA = getNarrativeCategory(a)
    const catB = getNarrativeCategory(b)
    const idxA = CATEGORY_ORDER.indexOf(catA)
    const idxB = CATEGORY_ORDER.indexOf(catB)
    if (idxA !== idxB) return idxA - idxB
    return a.localeCompare(b)
  })
}

// ObjectiveScoreBreakdown: flat fields (liquidity, profitability, leverage, activity, total)
function getCategoryScore(objective: ObjectiveScoreBreakdown, category: ScoreCategory): number {
  return objective[category] ?? 0
}

export function applyMultipleActions(
  entity: Partial<FinancialInput> & { subjective?: number },
  actionIds: SupportedActionId[],
): ScoreState {
  let currentInput: FinancialInput = { ...entity } as FinancialInput
  const sector = typeof entity.sector === 'string' ? entity.sector : ''

  for (const actionId of actionIds) {
    const result = applyActionToFinancialInput(actionId, currentInput, sector)
    currentInput = result.after
  }

  // Kural 11: gerçek hesaplama, heuristic değil
  const ratios = calculateRatios({ ...currentInput, sector })
  const scoringResult = calculateScore(ratios, sector)
  const subjectiveTotal = typeof entity.subjective === 'number' ? entity.subjective : 0
  const combined = combineScores(scoringResult.finalScore, subjectiveTotal)

  const objective: ObjectiveScoreBreakdown = {
    liquidity:     scoringResult.liquidityScore,
    profitability: scoringResult.profitabilityScore,
    leverage:      scoringResult.leverageScore,
    activity:      scoringResult.activityScore,
    total:         scoringResult.finalScore,
  }

  return {
    ratios,
    objective,
    combined,
  }
}

export function applyPairBothOrders(
  entity: Partial<FinancialInput> & { subjective?: number },
  a: SupportedActionId,
  b: SupportedActionId,
  targetCategory?: ScoreCategory,
): { ordered: SupportedActionId[]; result: ScoreState } {
  const order1 = applyMultipleActions(entity, [a, b])
  const order2 = applyMultipleActions(entity, [b, a])

  // Tie-break 1: objective.total
  const total1 = order1.objective.total
  const total2 = order2.objective.total
  if (total1 !== total2) {
    return total1 > total2
      ? { ordered: [a, b], result: order1 }
      : { ordered: [b, a], result: order2 }
  }

  // Tie-break 2: hedef kategori delta
  if (targetCategory) {
    const cat1 = getCategoryScore(order1.objective, targetCategory)
    const cat2 = getCategoryScore(order2.objective, targetCategory)
    if (cat1 !== cat2) {
      return cat1 > cat2
        ? { ordered: [a, b], result: order1 }
        : { ordered: [b, a], result: order2 }
    }
  }

  // Tie-break 3: alfabetik
  return a.localeCompare(b) <= 0
    ? { ordered: [a, b], result: order1 }
    : { ordered: [b, a], result: order2 }
}
