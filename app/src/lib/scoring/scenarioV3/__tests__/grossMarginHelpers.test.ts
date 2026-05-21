/**
 * R4 — getGrossMarginReductionTarget birim testleri.
 *
 * Fonksiyon: ratioHelpers.ts → getGrossMarginReductionTarget(ctx)
 * Formül: half-gap = (targetMargin - currentMargin) × netSales × 0.5
 * Atakan kararı: 12-18 ay vade, brüt zarar guard kaldırıldı (R4).
 *
 * Benchmark haritası (getSectorBenchmark):
 *   TRADE        → 'ticaret'  → Toptan Ticaret → grossMargin 0.14
 *   IT           → 'bilişim'  → Bilişim        → grossMargin 0.36
 *   CONSTRUCTION → 'inşaat'   → İnşaat         → grossMargin 0.18 (R4)
 */

import { getGrossMarginReductionTarget } from '../ratioHelpers'
import type { FirmContext } from '../contracts'

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       100_000_000,
    totalEquity:        50_000_000,
    totalRevenue:      100_000_000,
    netIncome:           5_000_000,
    netSales:          100_000_000,
    operatingProfit:     8_000_000,
    grossProfit:         8_000_000,   // 8% — TRADE benchmark = 14%
    interestExpense:     2_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

describe('R4 — getGrossMarginReductionTarget birim testleri', () => {

  // H1: Normal senaryo — marj hedef altında
  test('H1 — TRADE %8 marj, benchmark %14: half-gap = 3M', () => {
    // currentMargin = 8M/100M = 0.08; gap = 0.14 - 0.08 = 0.06
    // reduction = 0.06 × 100M × 0.5 = 3_000_000
    const result = getGrossMarginReductionTarget(makeCtx())
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(3_000_000, 0)
  })

  // H2: netSales = 0 → null
  test('H2 — netSales = 0 → null', () => {
    const result = getGrossMarginReductionTarget(makeCtx({ netSales: 0 }))
    expect(result).toBeNull()
  })

  // H3: netSales negatif → null
  test('H3 — netSales negatif → null', () => {
    const result = getGrossMarginReductionTarget(makeCtx({ netSales: -1_000_000 }))
    expect(result).toBeNull()
  })

  // H4: currentMargin >= targetMargin → null (zaten hedef üstünde)
  test('H4 — TRADE %20 marj >= benchmark %14 → null', () => {
    const result = getGrossMarginReductionTarget(makeCtx({ grossProfit: 20_000_000 }))
    expect(result).toBeNull()
  })

  // H5: Brüt zarar (negatif grossProfit) — R4 guard kaldırıldı
  test('H5 — brüt zarar (grossProfit=-5M): R4 → gap büyür, 9.5M döner', () => {
    // currentMargin = -5M/100M = -0.05; gap = 0.14 - (-0.05) = 0.19
    // reduction = 0.19 × 100M × 0.5 = 9_500_000
    const result = getGrossMarginReductionTarget(makeCtx({ grossProfit: -5_000_000 }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(9_500_000, 0)
  })

  // H6: CONSTRUCTION benchmark R4 %18 — eski %24'ten değiştirildi
  test('H6 — CONSTRUCTION R4 benchmark %18: %10 marj → gap=0.08 → 4M', () => {
    // R4: İnşaat grossMargin 0.24 → 0.18 (Atakan kararı)
    // currentMargin = 10M/100M = 0.10; gap = 0.18 - 0.10 = 0.08
    // reduction = 0.08 × 100M × 0.5 = 4_000_000
    const result = getGrossMarginReductionTarget(makeCtx({
      sector:       'CONSTRUCTION',
      grossProfit:  10_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(4_000_000, 0)
  })

})
