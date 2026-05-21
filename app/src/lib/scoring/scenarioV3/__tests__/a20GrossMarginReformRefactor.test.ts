/**
 * R4 — A20_GROSS_MARGIN_REFORM computeAmount + buildTransactions refactor testleri.
 *
 * Değişiklikler (R4):
 * - brüt zarar guard kaldırıldı (grossProfit < 0 destekleniyor)
 * - cap: cogs × 0.30 (eski: netSales × 0.20)
 * - buildTransactions: 2 transaction → tx[0]: 102/621 + tx[1]: 690/590 (kar zinciri)
 *
 * DEKAM senaryo: TRADE sektörü, -%6.9 brüt marj, netSales=400M → ~42M öneri
 *
 * Benchmark haritası:
 *   TRADE        → Toptan Ticaret → grossMargin 0.14
 *   CONSTRUCTION → İnşaat         → grossMargin 0.18 (R4)
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext, ActionBuildContext } from '../contracts'

const a20 = ACTION_CATALOG_V3['A20_GROSS_MARGIN_REFORM']

/** computeAmount için FirmContext */
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

/** buildTransactions için ActionBuildContext */
function makeBuildCtx(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount:          5_000_000,
    sector:          'TRADE',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    ...overrides,
  }
}

describe('R4 — A20_GROSS_MARGIN_REFORM refactor testleri', () => {

  // A20-R4-1: Standard senaryo
  test('A20-R4-1 — TRADE %8 marj: baseReduction = 3M, cogs cap devreye girmez', () => {
    // gap = 0.14 - 0.08 = 0.06; baseReduction = 0.06 × 100M × 0.5 = 3M
    // cogs = 100M - 8M = 92M; cap = 92M × 0.30 = 27.6M
    // result = min(3M, 27.6M) = 3M
    const result = a20.computeAmount!(makeCtx())
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(3_000_000, 0)
  })

  // A20-R4-2: Marj zaten hedefte → null
  test('A20-R4-2 — TRADE marj %20 >= benchmark %14 → null', () => {
    const result = a20.computeAmount!(makeCtx({ grossProfit: 20_000_000 }))
    expect(result).toBeNull()
  })

  // A20-R4-3: netSales = 0 → null
  test('A20-R4-3 — netSales = 0 → null', () => {
    const result = a20.computeAmount!(makeCtx({ netSales: 0 }))
    expect(result).toBeNull()
  })

  // A20-R4-4: Brüt zarar — R4 guard kaldırıldı
  test('A20-R4-4 — brüt zarar (grossProfit=-1M): R4 → 7.5M döner', () => {
    // currentMargin = -0.01; gap = 0.14 + 0.01 = 0.15
    // baseReduction = 0.15 × 100M × 0.5 = 7.5M
    // cogs = 100M + 1M = 101M; cap = 101M × 0.30 = 30.3M
    // result = min(7.5M, 30.3M) = 7.5M
    const result = a20.computeAmount!(makeCtx({ grossProfit: -1_000_000 }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(7_500_000, 0)
  })

  // A20-R4-5: DEKAM senaryo — TRADE -%6.9 grossMargin, büyük netSales
  test('A20-R4-5 — DEKAM senaryo: TRADE -%6.9 grossMargin, netSales=400M → ~41.8M', () => {
    // netSales=400M, grossProfit=-27.6M → currentMargin = -0.069
    // gap = 0.14 - (-0.069) = 0.209
    // baseReduction = 0.209 × 400M × 0.5 = 41_800_000
    // cogs = 400M + 27.6M = 427.6M; cap = 427.6M × 0.30 = 128.28M
    // result = min(41.8M, 128.28M) = 41.8M
    const result = a20.computeAmount!(makeCtx({
      netSales:    400_000_000,
      grossProfit: -27_600_000,   // -%6.9
      sector:      'TRADE',
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(41_800_000, 0)
  })

  // A20-R4-6: buildTransactions — 2 tx (R4 kar zinciri)
  test('A20-R4-6 — buildTransactions: tx[0] 102/621 + tx[1] 690/590 (R4)', () => {
    const txs = a20.buildTransactions(makeBuildCtx({ amount: 5_000_000 }))
    expect(txs).toHaveLength(2)
    // tx[0]: nakit kanal maliyet düşüşü
    expect(txs[0].legs).toHaveLength(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT',  amount: 5_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '621', side: 'CREDIT', amount: 5_000_000 })
    // tx[1]: kar zinciri (R4, vergi YOK — A12 pattern)
    expect(txs[1].legs).toHaveLength(2)
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT',  amount: 5_000_000 })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT', amount: 5_000_000 })
  })

  // A20-R4-7: CONSTRUCTION R4 benchmark %18 validasyonu
  test('A20-R4-7 — CONSTRUCTION R4 benchmark %18: %10 marj → 4M döner', () => {
    // R4: İnşaat grossMargin 0.24 → 0.18 (Atakan kararı)
    // currentMargin = 10M/100M = 0.10; gap = 0.18 - 0.10 = 0.08
    // baseReduction = 0.08 × 100M × 0.5 = 4M
    // cogs = 100M - 10M = 90M; cap = 90M × 0.30 = 27M
    // result = min(4M, 27M) = 4M
    const result = a20.computeAmount!(makeCtx({
      sector:       'CONSTRUCTION',
      grossProfit:  10_000_000,   // %10 < CONSTRUCTION benchmark %18
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(4_000_000, 0)
  })

})
