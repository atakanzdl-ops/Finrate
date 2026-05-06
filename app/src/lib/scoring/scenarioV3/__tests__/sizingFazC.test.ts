/**
 * sizingFazC.test.ts — A10 + A15 Sizing Tuning (Faz 7.3.43C — Gün 2)
 *
 * T1: A10 typicalPct %5 × büyük firma (totalAssets 357M) → ~17.85M
 * T2: A10 typicalPct %5 × küçük firma (totalAssets 50M)  → 2.5M
 * T3: A10 absoluteMinTRY hâlâ 2_000_000
 * T4: A15 typicalPct %20 × büyük 331 (75M) → 15M
 * T5: A15 typicalPct %20 × küçük 331 (5M)  → 1M (absoluteMinTRY kilidi)
 * T6: A15 absoluteMinTRY hâlâ 1_000_000
 * T7: A15 requiredAccountCodes değişmedi (['331'])
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Basit sizing hesabı: max(absoluteMinTRY, typicalPctOfBasis * basisAmount)
 */
function computeTypicalAmount(
  typicalPct: number,
  absoluteMin: number,
  basisAmount: number,
): number {
  return Math.max(absoluteMin, typicalPct * basisAmount)
}

// ─── T1–T3: A10 Sizing ───────────────────────────────────────────────────────

describe('A10 suggestedAmount sizing — Faz 7.3.43C', () => {

  const a10 = ACTION_CATALOG_V3['A10_CASH_EQUITY_INJECTION']!
  const sa  = a10.suggestedAmount

  test('T1: typicalPct %5 — büyük firma (totalAssets 357M) → ~17.85M', () => {
    const totalAssets = 357_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, totalAssets)
    // 357M × 0.05 = 17_850_000
    expect(amount).toBeCloseTo(17_850_000, -3)
    expect(amount).toBeGreaterThanOrEqual(17_000_000)
  })

  test('T2: typicalPct %5 — küçük firma (totalAssets 50M) → 2.5M', () => {
    const totalAssets = 50_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, totalAssets)
    // 50M × 0.05 = 2_500_000 > absoluteMinTRY (2M)
    expect(amount).toBe(2_500_000)
  })

  test('T3: absoluteMinTRY hâlâ 2_000_000', () => {
    expect(sa.absoluteMinTRY).toBe(2_000_000)
  })

})

// ─── T4–T7: A15 Sizing ───────────────────────────────────────────────────────

describe('A15 suggestedAmount sizing — Faz 7.3.43C', () => {

  const a15 = ACTION_CATALOG_V3['A15_DEBT_TO_EQUITY_SWAP']!
  const sa  = a15.suggestedAmount

  test('T4: typicalPct %20 — büyük 331 bakiyesi (75M) → 15M', () => {
    const source331 = 75_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, source331)
    // 75M × 0.20 = 15_000_000
    expect(amount).toBe(15_000_000)
  })

  test('T5: typicalPct %20 — küçük 331 bakiyesi (5M) → 1M (absoluteMinTRY kilidi)', () => {
    const source331 = 5_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, source331)
    // 5M × 0.20 = 1_000_000 = absoluteMinTRY (tam sınır)
    expect(amount).toBe(1_000_000)
  })

  test('T6: absoluteMinTRY hâlâ 1_000_000', () => {
    expect(sa.absoluteMinTRY).toBe(1_000_000)
  })

  test('T7: requiredAccountCodes değişmedi — [331]', () => {
    expect(a15.preconditions?.requiredAccountCodes).toEqual(['331'])
  })

})
