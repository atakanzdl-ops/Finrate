/**
 * sizingFazB.test.ts — A06 Sizing Yenileme + Materyalite Helper (Faz 7.3.43B — Gün 1)
 *
 * T1: A06 typicalPct %4 × büyük firma (stok 156M) → ~6.24M
 * T2: A06 typicalPct %4 × orta firma  (stok 50M)  → 2M (exactbound / absoluteMinTRY)
 * T3: A06 typicalPct %4 × küçük firma (stok 4.5M) → 2M (absoluteMinTRY kilidi)
 * T4: A06 absoluteMinTRY hâlâ 2_000_000
 * T5: A06 requiredAccountCodes değişmedi
 * T6: getDynamicMaterialityFloor smoke test
 * T7: A10 suggestedAmount DEĞİŞMEDİ (non-regression)
 * T8: A15 suggestedAmount DEĞİŞMEDİ (non-regression)
 * T9: A18 suggestedAmount DEĞİŞMEDİ (non-regression)
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import { getDynamicMaterialityFloor } from '../contracts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Basit sizing hesabı: max(absoluteMinTRY, typicalPctOfBasis * basisAmount)
 * Gerçek engine mantığını temsil eder (greedy loop benzeri).
 */
function computeTypicalAmount(
  typicalPct: number,
  absoluteMin: number,
  basisAmount: number,
): number {
  return Math.max(absoluteMin, typicalPct * basisAmount)
}

// ─── T1–T5: A06 Sizing Değerleri ─────────────────────────────────────────────

describe('A06 suggestedAmount sizing — Faz 7.3.43B', () => {

  const a06 = ACTION_CATALOG_V3['A06_INVENTORY_MONETIZATION']!
  const sa  = a06.suggestedAmount

  test('T1: typicalPctOfBasis %4 — büyük firma (stok 156M) → ~6.24M', () => {
    const stok = 156_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, stok)
    // 156M × 0.04 = 6_240_000
    expect(amount).toBeCloseTo(6_240_000, -3)  // ±1000 TL tolerans
    expect(amount).toBeGreaterThanOrEqual(6_000_000)
  })

  test('T2: typicalPctOfBasis %4 — orta firma (stok 50M) → 2M (tam sınır)', () => {
    const stok = 50_000_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, stok)
    // 50M × 0.04 = 2_000_000 = absoluteMinTRY (tam eşit)
    expect(amount).toBe(2_000_000)
  })

  test('T3: typicalPctOfBasis %4 — küçük firma (stok 4.5M) → 2M (absoluteMinTRY kilidi)', () => {
    const stok = 4_500_000
    const amount = computeTypicalAmount(sa.typicalPctOfBasis, sa.absoluteMinTRY, stok)
    // 4.5M × 0.04 = 180_000 < 2M → absoluteMinTRY devreye girer
    expect(amount).toBe(2_000_000)
  })

  test('T4: absoluteMinTRY hâlâ 2_000_000', () => {
    expect(sa.absoluteMinTRY).toBe(2_000_000)
  })

  test('T5: requiredAccountCodes değişmedi — [150, 151, 152, 153]', () => {
    expect(a06.preconditions?.requiredAccountCodes).toEqual(['150', '151', '152', '153'])
  })

})

// ─── T6: getDynamicMaterialityFloor smoke test ────────────────────────────────

describe('getDynamicMaterialityFloor — Faz 7.3.43B', () => {

  test('T6a: horizon=medium, totalAssets=100M → 1M (100M × 1% = 1M > 500K taban)', () => {
    const floor = getDynamicMaterialityFloor('medium', 100_000_000)
    // max(500_000, 100_000_000 × 0.01) = max(500_000, 1_000_000) = 1_000_000
    expect(floor).toBe(1_000_000)
  })

  test('T6b: horizon=short, totalAssets=10M → 250K (taban devreye girer)', () => {
    const floor = getDynamicMaterialityFloor('short', 10_000_000)
    // max(250_000, 10_000_000 × 0.005) = max(250_000, 50_000) = 250_000
    expect(floor).toBe(250_000)
  })

  test('T6c: horizon=long, totalAssets=200M → 2M (200M × 1% = 2M > 1M taban)', () => {
    const floor = getDynamicMaterialityFloor('long', 200_000_000)
    // max(1_000_000, 200_000_000 × 0.01) = max(1_000_000, 2_000_000) = 2_000_000
    expect(floor).toBe(2_000_000)
  })

  test('T6d: horizon=short, totalAssets=100M → 500K (100M × 0.5% = 500K > 250K taban)', () => {
    const floor = getDynamicMaterialityFloor('short', 100_000_000)
    // max(250_000, 100_000_000 × 0.005) = max(250_000, 500_000) = 500_000
    expect(floor).toBe(500_000)
  })

})

// ─── T7–T9: Non-regression — A10/A15/A18 dokunulmadı ─────────────────────────

describe('Non-regression: A10/A15/A18 sizing değişmedi', () => {

  test('T7: A10 suggestedAmount — typical %5, min %2, max %12 (assets) [GÜN 2]', () => {
    const sa = ACTION_CATALOG_V3['A10_CASH_EQUITY_INJECTION']!.suggestedAmount
    expect(sa.typicalPctOfBasis).toBe(0.05)
    expect(sa.minPctOfBasis).toBe(0.02)
    expect(sa.maxPctOfBasis).toBe(0.12)
    expect(sa.basis).toBe('assets')
  })

  test('T8: A15 suggestedAmount — typical %20, min %10, max %50 (source_account) [GÜN 2]', () => {
    const sa = ACTION_CATALOG_V3['A15_DEBT_TO_EQUITY_SWAP']!.suggestedAmount
    expect(sa.typicalPctOfBasis).toBe(0.20)
    expect(sa.minPctOfBasis).toBe(0.10)
    expect(sa.maxPctOfBasis).toBe(0.50)
    expect(sa.basis).toBe('source_account')
  })

  test('T9: A18 suggestedAmount — typical %15, min %5, max %35 (revenue)', () => {
    const sa = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']!.suggestedAmount
    expect(sa.typicalPctOfBasis).toBe(0.15)
    expect(sa.minPctOfBasis).toBe(0.05)
    expect(sa.maxPctOfBasis).toBe(0.35)
    expect(sa.basis).toBe('revenue')
  })

})
