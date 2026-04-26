/**
 * Candidate Selection — Faz 5.1
 *
 * Yaklaşım 3 Step 1-3: narrative-first + sectorEligibility pre-filter
 *
 * expectedSpillover IMPORT TAMAMEN YASAK (Kural 5)
 * isActionEligibleForSector: "discourage" etiketliler LİSTEDE KALIR
 *   (sadece "block" olanlar elenir — eligibilityMatrix.ts isActionEligibleForSector davranışı)
 */

import { validateEntityForScenarioGeneration } from '../sectorStrategy/entityValidation'
import type { ValidationResult } from '../sectorStrategy/entityValidation'
import { getActionsForNarrativeCategory } from '../sectorStrategy/narrativeProfiles'
import { isActionEligibleForSector } from '../sectorStrategy/eligibilityMatrix'
import { mapSectorStringToId } from '../sectorStrategy/sectorIdMap'
import type { SupportedActionId } from '../actionEffects'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { FinancialInput } from '../ratios'

// expectedSpillover: HİÇ import yok

export interface CandidateSelectionResult {
  candidates: SupportedActionId[]
  validation: ValidationResult
  warnings:   string[]
}

export function selectCandidates(
  entity: Partial<FinancialInput>,
  targetCategoryGap: ScoreCategory[],
): CandidateSelectionResult {
  const validation = validateEntityForScenarioGeneration(entity)
  const warnings: string[] = []

  if (!validation.valid) {
    return { candidates: [], validation, warnings }
  }

  validation.warnings.forEach(w => warnings.push(w.message))

  const narrativeCandidates = targetCategoryGap.flatMap(
    cat => getActionsForNarrativeCategory(cat)
  )

  const sectorId = mapSectorStringToId(entity?.sector ?? null)

  const eligible = narrativeCandidates.filter(a => {
    if (!sectorId) return true
    return isActionEligibleForSector(a, sectorId)
  })

  const final = eligible.filter(a => !validation.skipActions.includes(a))

  return {
    candidates: [...new Set(final)] as SupportedActionId[],
    validation,
    warnings,
  }
}
