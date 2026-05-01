/**
 * Faz 7.3.6A1/A3/A5/A6 — Muhasebe bacağı doğrulama testleri.
 *
 * Projeksiyon aksiyonları (A12/A13/A14) artık yevmiye üretmez.
 * A07/A16/A17 katalogdan silindi (Faz 7.3.6A3).
 * A10B/A15B yeni aksiyonlar eklendi (Faz 7.3.6A5).
 * A20 katalogdan silindi (Faz 7.3.6A6).
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
    'A12_GROSS_MARGIN_IMPROVEMENT',
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
