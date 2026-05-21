/**
 * R4 — A12_GROSS_MARGIN_IMPROVEMENT computeAmount refactor birim testleri.
 *
 * Değişiklikler (R4):
 * - brüt zarar guard kaldırıldı (grossProfit < 0 artık destekleniyor)
 * - cap'ler konservatif: tedarikçi %30, COGS %20 (eski: %50)
 * - getGrossMarginReductionTarget ortak helper kullanılıyor (half-gap formülü)
 *
 * IT sektörü: SECTOR_CODE_TO_TR['IT'] → 'bilişim' → Bilişim → grossMargin 0.36
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'

const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'IT',
    accountBalances:   { '320': 50_000_000, '621': 100_000_000 },
    totalAssets:       200_000_000,
    totalEquity:        50_000_000,
    totalRevenue:      100_000_000,
    netIncome:           5_000_000,
    netSales:          100_000_000,
    operatingProfit:     8_000_000,
    grossProfit:        25_000_000,   // 25% — IT benchmark = 36%
    interestExpense:     2_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

describe('R4 — A12_GROSS_MARGIN_IMPROVEMENT computeAmount refactor', () => {

  // A12-R4-1: Base case — baseReduction kısıtlayıcı (caps aşılmıyor)
  test('A12-R4-1 — IT %25 marj, benchmark %36: baseReduction = 5.5M', () => {
    // gap = 0.36 - 0.25 = 0.11; baseReduction = 0.11 × 100M × 0.5 = 5.5M
    // maxFromSupplier = 50M × 0.30 = 15M (aşılmıyor)
    // maxFromCogs     = 100M × 0.20 = 20M (aşılmıyor)
    // result = min(5.5M, 15M, 20M) = 5.5M
    const result = a12.computeAmount!(makeCtx())
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(5_500_000, 0)
  })

  // A12-R4-2: Tedarikçi cap kısıtlayıcı (%30 konservatif — eski %50)
  test('A12-R4-2 — küçük supplier (320=8M): maxFromSupplier = 2.4M kısıtlayıcı', () => {
    // baseReduction = 5.5M
    // maxFromSupplier = 8M × 0.30 = 2.4M  ← kısıtlayıcı (eski: 8M×0.50=4M)
    // maxFromCogs     = 100M × 0.20 = 20M
    // result = min(5.5M, 2.4M, 20M) = 2.4M
    const result = a12.computeAmount!(makeCtx({
      accountBalances: { '320': 8_000_000, '621': 100_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(2_400_000, 0)
  })

  // A12-R4-3: COGS cap kısıtlayıcı (%20 konservatif)
  test('A12-R4-3 — küçük COGS (621=20M): maxFromCogs = 4M kısıtlayıcı', () => {
    // baseReduction = 5.5M
    // maxFromSupplier = 50M × 0.30 = 15M
    // maxFromCogs     = 20M × 0.20 = 4M  ← kısıtlayıcı
    // result = min(5.5M, 15M, 4M) = 4M
    const result = a12.computeAmount!(makeCtx({
      accountBalances: { '320': 50_000_000, '621': 20_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(4_000_000, 0)
  })

  // A12-R4-4: 320 bakiye yok → null (tedarikçi kanal zorunlu)
  test('A12-R4-4 — 320 = 0 → null (tedarikçi kanal şart)', () => {
    const result = a12.computeAmount!(makeCtx({
      accountBalances: { '320': 0, '621': 100_000_000 },
    }))
    expect(result).toBeNull()
  })

  // A12-R4-5: Brüt zarar — R4 guard kaldırıldı
  test('A12-R4-5 — brüt zarar (grossProfit=-5M): R4 → 15M döner', () => {
    // R4: grossProfit < 0 guard kaldırıldı; gap büyür
    // currentMargin = -0.05; gap = 0.36 + 0.05 = 0.41
    // baseReduction = 0.41 × 100M × 0.5 = 20.5M
    // maxFromSupplier = 50M × 0.30 = 15M  ← kısıtlayıcı
    // maxFromCogs     = 100M × 0.20 = 20M
    // result = min(20.5M, 15M, 20M) = 15M
    const result = a12.computeAmount!(makeCtx({ grossProfit: -5_000_000 }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(15_000_000, 0)
  })

})
