/**
 * R6 — A04_CASH_PAYDOWN_ST computeAmount Guard Testleri
 *
 * R6 değişiklikleri:
 *   - computeAmount EKLENDİ (önceden yoktu)
 *   - nakit %80 cap + borç %30 hedef + min(nakitCap, borçHedef)
 *   - %15 anlamlı etki eşiği (Atakan Karar 5)
 *   - 500K minimum
 *
 * ENES: nakit 222 TL → null (yetersiz nakit)
 * ORGANIKA: öneri/kvBorç = %4.2 < %15 → sembolik → null
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'

const a04 = ACTION_CATALOG_V3['A04_CASH_PAYDOWN_ST']

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       50_000_000,
    totalEquity:       15_000_000,
    totalRevenue:      60_000_000,
    netIncome:          1_000_000,
    netSales:          60_000_000,
    operatingProfit:    3_000_000,
    grossProfit:        8_000_000,
    interestExpense:    1_500_000,
    operatingCashFlow: null,
    ...overrides,
  }
}

// ─── computeAmount testleri ───────────────────────────────────────────────────

describe('R6 — A04_CASH_PAYDOWN_ST computeAmount', () => {

  // T1: ENES profili — nakit 222 TL → null
  test('T1 — ENES: nakit=222 TL → null (mevcutNakit ≤ 0 değil ama < 500K)', () => {
    // nakit=222 → nakitCap=177.6 → oneri=min(177.6, ...) < 500K → null
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 222, '300': 5_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T2: ORGANIKA — öneri / kvBorç = %4.2 < %15 → sembolik → null
  test('T2 — ORGANIKA: nakit=960K, kvBorç=22.8M → öneri=684K/22.8M=%3 < %15 → null', () => {
    // nakitCap = 960K × 0.80 = 768K
    // borçHedef = 22.8M × 0.30 = 6.84M
    // oneri = min(768K, 6.84M) = 768K
    // 768K / 22.8M = %3.4 < %15 → null
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 960_000, '300': 22_800_000 },
    }))
    expect(result).toBeNull()
  })

  // T3: Yeterli nakit — öneri geçerli → tutar döner
  test('T3 — Yeterli nakit: 102=10M, 300=20M → öneri=6M (>%15)', () => {
    // nakitCap = 10M × 0.80 = 8M
    // borçHedef = 20M × 0.30 = 6M
    // oneri = min(8M, 6M) = 6M
    // 6M/20M = %30 > %15 ✓
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 10_000_000, '300': 20_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(6_000_000, 0)
  })

  // T4: KV borç yok → null
  test('T4 — KV borç yok (300=0) → null', () => {
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 5_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T5: Nakit yok → null
  test('T5 — Nakit yok (102=0) → null', () => {
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '300': 10_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T6: nakitCap kısıtlayıcı (nakit küçük, borç büyük)
  test('T6 — nakitCap kısıtlayıcı: 102=5M (cap=4M), 300=50M (hedef=15M) → 4M', () => {
    // nakitCap = 5M × 0.80 = 4M
    // borçHedef = 50M × 0.30 = 15M
    // oneri = min(4M, 15M) = 4M
    // 4M/50M = %8 < %15 → null (anlamlı etki eşiği)
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 5_000_000, '300': 50_000_000 },
    }))
    expect(result).toBeNull()   // 4M/50M = %8 < %15
  })

  // T7: Sınırda — tam %15 eşiği geçen durum
  test('T7 — %15 eşiği tam aşılan: öneri/kvBorç=%16 → tutar döner', () => {
    // nakitCap = 4M × 0.80 = 3.2M
    // borçHedef = 20M × 0.30 = 6M
    // oneri = min(3.2M, 6M) = 3.2M
    // 3.2M/20M = %16 > %15 ✓
    const result = a04.computeAmount!(makeCtx({
      accountBalances: { '102': 4_000_000, '300': 20_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(3_200_000, 0)
  })

})
