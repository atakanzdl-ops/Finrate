/**
 * Unit testleri: A05_RECEIVABLE_COLLECTION computeAmount
 *
 * DEKAM firma verileri (Construction sektörü):
 *   currentAR    = 13,909,833 TL
 *   netSales     = 24,454,088 TL
 *   currentDSO   = (13.9M / 24.45M) × 365 = 207.7 gün
 *   benchmark DSO (Construction) = 79 gün (TCMB_DIRECT)
 *   targetAR     = (24.45M × 79) / 365 = 5,291,044 TL
 *   desiredMove  = 13.9M - 5.29M = 8,618,789 TL
 *   cap (25%)    = 13.9M × 0.25 = 3,477,458 TL
 *   result       = min(8.62M, 3.48M) = 3,477,458 TL ≈ 3.48 Mn
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

const a05 = ACTION_CATALOG_V3['A05_RECEIVABLE_COLLECTION']

const baseCtx = {
  accountBalances: { '120': 13_909_833, '121': 0 },
  netSales:        24_454_088,
  grossProfit:     2_511_470,
  sector:          'CONSTRUCTION' as const,
  totalAssets:     178_000_000,
  totalEquity:     3_000_000,
  totalRevenue:    24_454_088,
  netIncome:       -357_848,
  interestExpense: 1_401_236,
  operatingCashFlow: 0,
  period:          'ANNUAL',
} as any

describe('A05 computeAmount', () => {
  it('computeAmount tanımlı olmalı', () => {
    expect(a05).toBeDefined()
    expect(a05.computeAmount).toBeDefined()
  })

  it('DEKAM: cap 3.48 Mn dönmeli', () => {
    const result = a05?.computeAmount?.(baseCtx)
    // 3,477,458 TL — ±1K tolerans
    expect(result).toBeCloseTo(3_477_458, -3)
  })

  it('DSO benchmark altındaysa null dönmeli', () => {
    // AR = 5M → DSO = 5M/24.45M × 365 = 74.6 gün < 79 × 1.1 = 86.9 → null
    const ctx = { ...baseCtx, accountBalances: { '120': 5_000_000, '121': 0 } }
    expect(a05?.computeAmount?.(ctx)).toBeNull()
  })

  it('DSO benchmark yakınındaysa null dönmeli (1.1 tolerans)', () => {
    // targetAR = 24.45M × 79 / 365 = 5.29M
    // AR = 5.7M → DSO = 5.7/24.45 × 365 = 85.1 gün < 86.9 → null
    const ctx = { ...baseCtx, accountBalances: { '120': 5_700_000, '121': 0 } }
    expect(a05?.computeAmount?.(ctx)).toBeNull()
  })

  it('AR sıfırsa null dönmeli', () => {
    const ctx = { ...baseCtx, accountBalances: { '120': 0, '121': 0 } }
    expect(a05?.computeAmount?.(ctx)).toBeNull()
  })

  it('netSales sıfırsa null dönmeli', () => {
    const ctx = { ...baseCtx, netSales: 0 }
    expect(a05?.computeAmount?.(ctx)).toBeNull()
  })

  it('cap sonucu eski yüzde mantığından yüksek olmalı', () => {
    const result = a05?.computeAmount?.(baseCtx)
    // Eski typical: 13,909,833 × 0.15 = 2,086,475
    const oldTypical = 13_909_833 * 0.15
    expect(result!).toBeGreaterThan(oldTypical)
  })
})
