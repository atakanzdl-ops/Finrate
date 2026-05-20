import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import {
  getPeriodDays,
  sumByCodesPrefix,
  getInventoryBalance,
  computeDIO,
  getCogs
} from '../ratioHelpers'
import type { FirmContext } from '../contracts'

describe('A06 DIO Refactor — Helper Unit Tests', () => {
  describe('getPeriodDays', () => {
    test('Q1 = 90 gün', () => {
      expect(getPeriodDays({ period: 'Q1' }).days).toBe(90)
    })
    test('Q2 = 182 gün', () => {
      expect(getPeriodDays({ period: 'Q2' }).days).toBe(182)
    })
    test('Q3 = 273 gün', () => {
      expect(getPeriodDays({ period: 'Q3' }).days).toBe(273)
    })
    test('Q4 = 365 gün (kümülatif)', () => {
      expect(getPeriodDays({ period: 'Q4' }).days).toBe(365)
    })
    test('ANNUAL = 365 gün', () => {
      expect(getPeriodDays({ period: 'ANNUAL' }).days).toBe(365)
    })
    test('H1 = 182 gün', () => {
      expect(getPeriodDays({ period: 'H1' }).days).toBe(182)
    })
    test('H2 = 182 gün', () => {
      expect(getPeriodDays({ period: 'H2' }).days).toBe(182)
    })
  })

  describe('sumByCodesPrefix', () => {
    test('exact match "150"', () => {
      const balances = { '150': 1000, '151': 2000 }
      expect(sumByCodesPrefix(balances, ['150'])).toBe(1000)
    })
    test('alt hesap nokta "150.01"', () => {
      const balances = { '150.01': 500, '150': 1000 }
      expect(sumByCodesPrefix(balances, ['150'])).toBe(1500)
    })
    test('alt hesap tire "150-01"', () => {
      const balances = { '150-01': 500, '150': 1000 }
      expect(sumByCodesPrefix(balances, ['150'])).toBe(1500)
    })
    test('"1500" yakalanmamalı (farklı hesap)', () => {
      const balances = { '1500': 1000, '150': 500 }
      expect(sumByCodesPrefix(balances, ['150'])).toBe(500)
    })
    test('birden çok prefix', () => {
      const balances = { '150': 1000, '151': 2000, '152': 3000 }
      expect(sumByCodesPrefix(balances, ['150', '151', '152'])).toBe(6000)
    })
    test('boş balance atlanmalı', () => {
      const balances = { '150': 1000, '151': null as unknown as number, '152': undefined as unknown as number }
      expect(sumByCodesPrefix(balances, ['150', '151', '152'])).toBe(1000)
    })
  })

  describe('computeDIO', () => {
    test('normal hesap', () => {
      // inventory 100, cogs 365, periodDays 365 → DIO = 100
      expect(computeDIO(100, 365, 365)).toBe(100)
    })
    test('cogs 0 → null', () => {
      expect(computeDIO(100, 0, 365)).toBeNull()
    })
    test('inventory 0 → null', () => {
      expect(computeDIO(0, 100, 365)).toBeNull()
    })
  })
})

describe('A06 computeAmount — 5 Firma Snapshot', () => {
  const a06 = ACTION_CATALOG_V3['A06_INVENTORY_MONETIZATION']!

  test('ORGANIKA (MANUFACTURING fallback, Q1) ≈ ₺13.5M', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: { '153': 54_100_000 },
      totalAssets: 106_428_996,
      totalEquity: 38_729_385,
      totalRevenue: 17_689_580,
      netIncome: 1_015_110,
      netSales: 17_689_580,
      operatingProfit: 2_886_025,
      grossProfit: 3_874_935,
      costOfGoodsSold: 13_814_645,
      interestExpense: 1_792_363,
      operatingCashFlow: null,
      period: 'Q1',
    }
    const result = a06.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(12_000_000)
    expect(result!).toBeLessThan(14_500_000)
  })

  test('ENES (MANUFACTURING, Q4) ≈ ₺6.2M', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: { '150': 24_724_639 },
      totalAssets: 39_091_324,
      totalEquity: 11_052_807,
      totalRevenue: 31_514_333,
      netIncome: 53_678,
      netSales: 31_514_333,
      operatingProfit: 974_781,
      grossProfit: 1_466_977,
      costOfGoodsSold: 30_047_356,
      interestExpense: 916_713,
      operatingCashFlow: null,
      period: 'Q4',
    }
    const result = a06.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(5_000_000)
    expect(result!).toBeLessThan(7_500_000)
  })

  test('iPOS (MANUFACTURING, Q4) ≈ ₺42M', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: { '150': 169_154_268 },
      totalAssets: 317_740_812,
      totalEquity: 114_167_869,
      totalRevenue: 229_683_295,
      netIncome: 2_097_303,
      netSales: 229_683_295,
      operatingProfit: 30_948_450,
      grossProfit: 97_366_833,
      costOfGoodsSold: 132_316_462,
      interestExpense: 16_778_863,
      operatingCashFlow: null,
      period: 'Q4',
    }
    const result = a06.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(40_000_000)
    expect(result!).toBeLessThan(44_000_000)
  })

  test('İSRA (CONSTRUCTION, Q4) → null', () => {
    const ctx: FirmContext = {
      sector: 'CONSTRUCTION',
      accountBalances: { '150': 583_255_096 },
      totalAssets: 2_567_891_662,
      totalEquity: 1_106_040_653,
      totalRevenue: 381_415_663,
      netIncome: 10_805_648,
      netSales: 381_415_663,
      operatingProfit: 29_674_828,
      grossProfit: 89_912_570,
      costOfGoodsSold: 291_503_093,
      interestExpense: 17_895_226,
      operatingCashFlow: null,
      period: 'Q4',
    }
    const result = a06.computeAmount!(ctx)
    expect(result).toBeNull()
  })

  test('DEKAM (CONSTRUCTION, Q4) → null', () => {
    const ctx: FirmContext = {
      sector: 'CONSTRUCTION',
      accountBalances: { '151': 262_435_816 },
      totalAssets: 361_243_567,
      totalEquity: 141_021_419,
      totalRevenue: 328_057_415,
      netIncome: 13_722_860,
      netSales: 328_057_415,
      operatingProfit: -26_083_975,
      grossProfit: -22_535_262,
      costOfGoodsSold: 350_592_677,
      interestExpense: 5_369_133,
      operatingCashFlow: null,
      period: 'Q4',
    }
    const result = a06.computeAmount!(ctx)
    expect(result).toBeNull()
  })
})
