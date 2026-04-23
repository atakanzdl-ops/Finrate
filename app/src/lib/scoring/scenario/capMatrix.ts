// src/lib/scoring/scenario/capMatrix.ts
// Config constants for Scenario Engine v2 cap system (Fix F-2)

import type { ActionId, SectorCode } from './contracts'

export const CAP_MATRIX: Record<ActionId, { short: number; medium: number; long: number }> = {
  A01_ST_FIN_DEBT_TO_LT:         { short: 0.10, medium: 0.20, long: 0.30 },
  A02_TRADE_PAYABLE_TO_LT:       { short: 0.08, medium: 0.18, long: 0.28 },
  A03_ADVANCE_TO_LT:             { short: 0.08, medium: 0.15, long: 0.25 },
  A04_CASH_PAYDOWN_ST:           { short: 0.08, medium: 0.12, long: 0.15 },
  A05_RECEIVABLE_COLLECTION:     { short: 0.05, medium: 0.10, long: 0.15 },
  A06_INVENTORY_OPTIMIZATION:    { short: 0.03, medium: 0.08, long: 0.12 },
  A07_PREPAID_EXPENSE_RELEASE:   { short: 0.03, medium: 0.08, long: 0.10 },
  A08_FIXED_ASSET_DISPOSAL:      { short: 0.04, medium: 0.10, long: 0.15 },
  A09_SALE_LEASEBACK:            { short: 0.05, medium: 0.12, long: 0.18 },
  A10_EQUITY_INJECTION:          { short: 0.08, medium: 0.15, long: 0.25 },
  A11_EARNINGS_RETENTION:        { short: 0.06, medium: 0.10, long: 0.15 },
  A12_GROSS_MARGIN_IMPROVEMENT:  { short: 0.03, medium: 0.06, long: 0.10 },
  A13_OPEX_OPTIMIZATION:         { short: 0.03, medium: 0.06, long: 0.10 },
  A14_FINANCE_COST_OPTIMIZATION: { short: 0.04, medium: 0.08, long: 0.12 },
}

export const GLOBAL_CAP_MATRIX: Record<ActionId, { short: number; medium: number; long: number }> = {
  A01_ST_FIN_DEBT_TO_LT:         { short: 0.04,  medium: 0.08, long: 0.12 },
  A02_TRADE_PAYABLE_TO_LT:       { short: 0.03,  medium: 0.07, long: 0.10 },
  A03_ADVANCE_TO_LT:             { short: 0.03,  medium: 0.06, long: 0.10 },
  A04_CASH_PAYDOWN_ST:           { short: 0.03,  medium: 0.04, long: 0.06 },
  A05_RECEIVABLE_COLLECTION:     { short: 0.02,  medium: 0.04, long: 0.06 },
  A06_INVENTORY_OPTIMIZATION:    { short: 0.015, medium: 0.03, long: 0.05 },
  A07_PREPAID_EXPENSE_RELEASE:   { short: 0.01,  medium: 0.02, long: 0.04 },
  A08_FIXED_ASSET_DISPOSAL:      { short: 0.02,  medium: 0.04, long: 0.06 },
  A09_SALE_LEASEBACK:            { short: 0.03,  medium: 0.05, long: 0.08 },
  A10_EQUITY_INJECTION:          { short: 0.03,  medium: 0.06, long: 0.10 },
  A11_EARNINGS_RETENTION:        { short: 0.02,  medium: 0.04, long: 0.06 },
  A12_GROSS_MARGIN_IMPROVEMENT:  { short: 0.01,  medium: 0.02, long: 0.04 },
  A13_OPEX_OPTIMIZATION:         { short: 0.01,  medium: 0.02, long: 0.04 },
  A14_FINANCE_COST_OPTIMIZATION: { short: 0.015, medium: 0.03, long: 0.05 },
}

export const SECTOR_MULT: Partial<Record<ActionId, Record<SectorCode, number>>> = {
  A05_RECEIVABLE_COLLECTION: {
    CONSTRUCTION: 0.80, MANUFACTURING: 1.00, TRADE: 1.00,
    RETAIL: 0.85, SERVICES: 1.15, IT: 1.20,
  },
  A06_INVENTORY_OPTIMIZATION: {
    CONSTRUCTION: 0.50, MANUFACTURING: 1.20, TRADE: 1.00,
    RETAIL: 1.10, SERVICES: 0.40, IT: 0.25,
  },
  A07_PREPAID_EXPENSE_RELEASE: {
    CONSTRUCTION: 0.90, MANUFACTURING: 1.00, TRADE: 0.90,
    RETAIL: 0.85, SERVICES: 1.10, IT: 1.15,
  },
  A03_ADVANCE_TO_LT: {
    CONSTRUCTION: 1.25, MANUFACTURING: 0.85, TRADE: 0.80,
    RETAIL: 0.75, SERVICES: 1.00, IT: 1.20,
  },
  A08_FIXED_ASSET_DISPOSAL: {
    CONSTRUCTION: 1.10, MANUFACTURING: 1.00, TRADE: 0.90,
    RETAIL: 0.90, SERVICES: 0.80, IT: 0.60,
  },
  A09_SALE_LEASEBACK: {
    CONSTRUCTION: 1.15, MANUFACTURING: 1.10, TRADE: 0.90,
    RETAIL: 1.00, SERVICES: 0.70, IT: 0.60,
  },
}

export const PHASE_CONFIG = {
  short:  { maxPhaseCount: 1 },
  medium: { maxPhaseCount: 2 },
  long:   { maxPhaseCount: 3 },
} as const

export const EFFICIENCY_FILTER = {
  short: {
    minEfficiency: 0.50,
    hardReject: { balanceSheetImpactGt: 0.03, scoreDeltaLt: 0.8 },
  },
  medium: {
    minEfficiency: 0.35,
    hardReject: { balanceSheetImpactGt: 0.05, scoreDeltaLt: 1.0 },
  },
  long: {
    minEfficiency: 0.20,
    hardReject: { balanceSheetImpactGt: 0.08, scoreDeltaLt: 1.5 },
  },
} as const

export const CUMULATIVE_GUARDRAILS = {
  short:  { maxEquityIncreasePP: 0.05, maxKvykDecreasePP: 0.05, maxGroupShare: 0.65 },
  medium: { maxEquityIncreasePP: 0.08, maxKvykDecreasePP: 0.10, maxGroupShare: 0.65 },
  long:   { maxEquityIncreasePP: 0.12, maxKvykDecreasePP: 0.15, maxGroupShare: 0.65 },
} as const

export type HorizonKey = 'short' | 'medium' | 'long'

/**
 * Aksiyon + ufuk + sektör için nihai targetMaxPct hesaplar.
 * Sektör çarpanı tabloda yoksa 1.0 uygulanır.
 */
export function getTargetCapPct(
  actionId: ActionId,
  horizon: HorizonKey,
  sector: SectorCode
): number {
  const baseCap = CAP_MATRIX[actionId]?.[horizon] ?? 0.10
  const sectorMult = SECTOR_MULT[actionId]?.[sector] ?? 1.0
  return baseCap * sectorMult
}

/**
 * Aksiyon + ufuk için nihai globalMaxPctOfAssets hesaplar.
 */
export function getGlobalCapPct(
  actionId: ActionId,
  horizon: HorizonKey
): number {
  return GLOBAL_CAP_MATRIX[actionId]?.[horizon] ?? 0.05
}
