/**
 * Faz 7.3.6A1/A3/A5/A6/B3a — Muhasebe bacağı doğrulama testleri.
 *
 * Projeksiyon aksiyonları (A13/A14) artık yevmiye üretmez.
 * A07/A16/A17 katalogdan silindi (Faz 7.3.6A3).
 * A10B/A15B yeni aksiyonlar eklendi (Faz 7.3.6A5).
 * A20 katalogdan silindi (Faz 7.3.6A6).
 * A12 gerçek yevmiye üretiyor (Faz 7.3.6B3a).
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { ActionBuildContext } from '../contracts'

function makeContext(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount: 5_000_000,
    sector: 'CONSTRUCTION',
    horizon: 'medium',
    analysis: {},
    previousActions: [],
    ...overrides,
  }
}

// ─── Projeksiyon aksiyonları boş array döner ─────────────────────────────────

describe('Faz 7.3.6A1 — Projeksiyon aksiyonları boş array döner', () => {
  const projectionActionIds = [
    'A13_OPEX_OPTIMIZATION',
    'A14_FINANCE_COST_REDUCTION',
  ]

  test.each(projectionActionIds)('%s buildTransactions boş array döner', (actionId) => {
    const action = ACTION_CATALOG_V3[actionId]
    expect(action).toBeDefined()
    const txs = action!.buildTransactions(makeContext())
    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBe(0)
  })
})

// ─── A10B Senetli Sermaye Artırımı ───────────────────────────────────────────

describe('Faz 7.3.6A5 — A10B Senetli Sermaye Artırımı muhasebe doğrulaması', () => {
  const a10b = ACTION_CATALOG_V3['A10B_PROMISSORY_NOTE_EQUITY_INJECTION']

  test('A10B tanımlı', () => {
    expect(a10b).toBeDefined()
  })

  test('A10B 1 transaction üretir', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 5_000_000 }))
    expect(txs.length).toBe(1)
  })

  test('A10B transactionunda 2 leg var', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 5_000_000 }))
    expect(txs[0].legs.length).toBe(2)
  })

  test('A10B leg[0]: 121 DEBIT (Alacak Senetleri)', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 5_000_000 }))
    const leg = txs[0].legs[0]
    expect(leg.accountCode).toBe('121')
    expect(leg.side).toBe('DEBIT')
  })

  test('A10B leg[1]: 500 CREDIT (Sermaye)', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 5_000_000 }))
    const leg = txs[0].legs[1]
    expect(leg.accountCode).toBe('500')
    expect(leg.side).toBe('CREDIT')
  })

  test('A10B denklik: debit toplamı === credit toplamı', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 5_000_000 }))
    const debitSum  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const creditSum = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debitSum).toBe(creditSum)
  })

  test('A10B amount pozitif', () => {
    const txs = a10b.buildTransactions(makeContext({ amount: 3_000_000 }))
    expect(txs[0].legs[0].amount).toBeGreaterThan(0)
  })
})

// ─── A15B Ortak Borcunu Uzun Vadeye Aktarma ──────────────────────────────────

describe('Faz 7.3.6A5 — A15B Ortak Borcunu Uzun Vadeye Aktarma muhasebe doğrulaması', () => {
  const a15b = ACTION_CATALOG_V3['A15B_SHAREHOLDER_DEBT_TO_LT']

  test('A15B tanımlı', () => {
    expect(a15b).toBeDefined()
  })

  test('A15B 1 transaction üretir', () => {
    const txs = a15b.buildTransactions(makeContext({ amount: 2_000_000 }))
    expect(txs.length).toBe(1)
  })

  test('A15B leg[0]: 331 DEBIT (KV ortak borcu azalışı)', () => {
    const txs = a15b.buildTransactions(makeContext({ amount: 2_000_000 }))
    const leg = txs[0].legs[0]
    expect(leg.accountCode).toBe('331')
    expect(leg.side).toBe('DEBIT')
  })

  test('A15B leg[1]: 431 CREDIT (UV ortak borcu artışı)', () => {
    const txs = a15b.buildTransactions(makeContext({ amount: 2_000_000 }))
    const leg = txs[0].legs[1]
    expect(leg.accountCode).toBe('431')
    expect(leg.side).toBe('CREDIT')
  })

  test('A15B denklik: debit toplamı === credit toplamı', () => {
    const txs = a15b.buildTransactions(makeContext({ amount: 2_000_000 }))
    const debitSum  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const creditSum = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debitSum).toBe(creditSum)
  })

  test('A15B amount pozitif', () => {
    const txs = a15b.buildTransactions(makeContext({ amount: 2_000_000 }))
    expect(txs[0].legs[0].amount).toBeGreaterThan(0)
  })

  test('A15B preconditions: requiredAccountCodes 331 içerir', () => {
    expect(a15b.preconditions.requiredAccountCodes).toContain('331')
  })
})

// ─── A19 Müşteri Avansını Satışa Dönüştürme ─────────────────────────────────

describe('Faz 7.3.6B2 — A19 çoklu bacak muhasebe doğrulaması', () => {
  const a19 = ACTION_CATALOG_V3['A19_ADVANCE_TO_REVENUE']

  const makeA19Context = (overrides: Partial<ActionBuildContext> = {}) =>
    makeContext({
      amount: 20_000_000,
      netSales: 100_000_000,
      grossProfit: 30_000_000,
      accountBalances: { '340': 50_000_000, '153': 100_000_000 },
      ...overrides,
    })

  test('A19 normal senaryoda 4 bacaklı tek transaction üretir', () => {
    const txs = a19.buildTransactions(makeA19Context())

    expect(txs.length).toBe(1)
    expect(txs[0].legs.length).toBe(4)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '340', side: 'DEBIT', amount: 20_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT', amount: 20_000_000 })
    expect(txs[0].legs[2]).toMatchObject({ accountCode: '621', side: 'DEBIT' })
    expect(txs[0].legs[2].amount).toBeCloseTo(14_000_000, 2)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '153', side: 'CREDIT' })
    expect(txs[0].legs[3].amount).toBeCloseTo(14_000_000, 2)
  })

  test('A19 stok kapasitesiyle tutarı sınırlar', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '153': 7_000_000 },
    }))

    expect(txs.length).toBe(1)
    expect(txs[0].legs[0].amount).toBeCloseTo(10_000_000, 2)
    expect(txs[0].legs[1].amount).toBeCloseTo(10_000_000, 2)
    expect(txs[0].legs[2].amount).toBeCloseTo(7_000_000, 2)
    expect(txs[0].legs[3].amount).toBeCloseTo(7_000_000, 2)
  })

  test('A19 stok yoksa sadece avans hasılata dönüşür', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '153': 0 },
    }))

    expect(txs.length).toBe(1)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '340', side: 'DEBIT', amount: 20_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT', amount: 20_000_000 })
  })

  test('A19 net satış yoksa boş array döner', () => {
    const txs = a19.buildTransactions(makeA19Context({ netSales: 0 }))

    expect(txs).toEqual([])
  })

  test('A19 brüt kâr yoksa boş array döner', () => {
    const txs = a19.buildTransactions(makeA19Context({ grossProfit: 0 }))

    expect(txs).toEqual([])
  })

  test('A19 brüt marj yüzde 100 veya üstüyse boş array döner', () => {
    const txs = a19.buildTransactions(makeA19Context({
      netSales: 100_000_000,
      grossProfit: 100_000_000,
    }))

    expect(txs).toEqual([])
  })

  test('A19 340 avans bakiyesi yoksa boş array döner', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 0, '153': 100_000_000 },
    }))

    expect(txs).toEqual([])
  })

  test('A19 denklik: debit toplamı === credit toplamı', () => {
    const txs = a19.buildTransactions(makeA19Context())
    const debitSum  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const creditSum = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)

    expect(debitSum).toBeCloseTo(creditSum, 2)
  })
})

// ─── A12 Brüt Kâr Marjı İyileştirme — B3a ────────────────────────────────────

describe('Faz 7.3.6B3a — A12 computeAmount + buildTransactions doğrulaması', () => {
  const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']

  const makeA12Context = (overrides: Partial<ActionBuildContext> = {}) =>
    makeContext({
      amount: 5_000_000,
      accountBalances: { '320': 50_000_000, '621': 100_000_000 },
      ...overrides,
    })

  // ── buildTransactions ──

  test('A12 normal: 2 transaction döner', () => {
    const txs = a12.buildTransactions(makeA12Context())
    expect(txs.length).toBe(2)
  })

  test('A12 tx[0]: 320 DEBIT, 621 CREDIT — denkli', () => {
    const txs = a12.buildTransactions(makeA12Context())
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '320', side: 'DEBIT',  amount: 5_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '621', side: 'CREDIT', amount: 5_000_000 })
  })

  test('A12 tx[1]: 690 DEBIT, 590 CREDIT — denkli', () => {
    const txs = a12.buildTransactions(makeA12Context())
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT',  amount: 5_000_000 })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT', amount: 5_000_000 })
  })

  test('A12 küçük rasyo-hedef tutarı 1 Mn altında olsa da transaction üretir', () => {
    const txs = a12.buildTransactions(makeA12Context({
      amount: 428_000,
      accountBalances: { '320': 10_000_000, '621': 100_000_000 },
    }))

    expect(txs.length).toBe(2)
    expect(txs[0].legs[0].amount).toBe(428_000)
    expect(txs[0].legs[1].amount).toBe(428_000)
  })

  test('A12 amount 320 bakiyesini aşarsa 320 bakiyesiyle sınırlar', () => {
    const txs = a12.buildTransactions(makeA12Context({
      amount: 15_000_000,
      accountBalances: { '320': 10_000_000, '621': 100_000_000 },
    }))

    expect(txs[0].legs[0].amount).toBe(10_000_000)
    expect(txs[0].legs[1].amount).toBe(10_000_000)
  })

  test('A12 320 yok → boş array', () => {
    const txs = a12.buildTransactions(makeA12Context({
      accountBalances: { '320': 0, '621': 100_000_000 },
    }))
    expect(txs).toEqual([])
  })

  test('A12 621 yok → boş array', () => {
    const txs = a12.buildTransactions(makeA12Context({
      accountBalances: { '320': 10_000_000, '621': 0 },
    }))
    expect(txs).toEqual([])
  })

  // ── computeAmount ──

  test('A12 useRatioBasedAmount: true', () => {
    expect(a12.useRatioBasedAmount).toBe(true)
  })

  test('A12 computeAmount: %25 margin, IT sektörü hedef %36 → 10M döner', () => {
    // IT (Bilişim) grossMargin benchmark = 0.36
    // currentMargin = 25M/100M = 0.25 < 0.36*1.05=0.378 → aktif
    // requiredImprovement = (0.36 - 0.25) * 100M = 11M
    // maxFromSupplier = 50M * 0.20 = 10M, maxFromCogs = 100M * 0.20 = 20M
    // result = min(11M, 10M, 20M) = 10M
    const result = a12.computeAmount!({
      sector:           'IT',
      accountBalances:  { '320': 50_000_000, '621': 100_000_000 },
      netSales:         100_000_000,
      grossProfit:       25_000_000,
      totalAssets:       200_000_000,
      totalEquity:        50_000_000,
      totalRevenue:      100_000_000,
      netIncome:           5_000_000,
      operatingProfit:     8_000_000,
      interestExpense:     2_000_000,
      operatingCashFlow:  null,
      period:            'ANNUAL',
    })
    expect(result).not.toBeNull()
    expect(result).toBe(10_000_000)
  })

  test('A12 computeAmount: marj zaten hedefte (IT %40 >= %36*1.05=%37.8) → null', () => {
    const result = a12.computeAmount!({
      sector:           'IT',
      accountBalances:  { '320': 50_000_000, '621': 100_000_000 },
      netSales:         100_000_000,
      grossProfit:       40_000_000,   // %40 >= %37.8
      totalAssets:       200_000_000,
      totalEquity:        50_000_000,
      totalRevenue:      100_000_000,
      netIncome:           5_000_000,
      operatingProfit:     8_000_000,
      interestExpense:     2_000_000,
      operatingCashFlow:  null,
      period:            'ANNUAL',
    })
    expect(result).toBeNull()
  })

  test('A12 computeAmount: negatif brüt kâr → null', () => {
    const result = a12.computeAmount!({
      sector:           'IT',
      accountBalances:  { '320': 50_000_000, '621': 100_000_000 },
      netSales:         100_000_000,
      grossProfit:        -5_000_000,
      totalAssets:       200_000_000,
      totalEquity:        50_000_000,
      totalRevenue:      100_000_000,
      netIncome:          -5_000_000,
      operatingProfit:    -5_000_000,
      interestExpense:     2_000_000,
      operatingCashFlow:  null,
      period:            'ANNUAL',
    })
    expect(result).toBeNull()
  })

  test('A12 computeAmount: 320 bakiye yok → null', () => {
    const result = a12.computeAmount!({
      sector:           'IT',
      accountBalances:  { '320': 0, '621': 100_000_000 },
      netSales:         100_000_000,
      grossProfit:       25_000_000,
      totalAssets:       200_000_000,
      totalEquity:        50_000_000,
      totalRevenue:      100_000_000,
      netIncome:           5_000_000,
      operatingProfit:     8_000_000,
      interestExpense:     2_000_000,
      operatingCashFlow:  null,
      period:            'ANNUAL',
    })
    expect(result).toBeNull()
  })
})
