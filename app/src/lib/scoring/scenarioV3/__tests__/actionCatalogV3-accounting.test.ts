/**
 * Faz 7.3.6A1/A3/A5 — Muhasebe bacağı doğrulama testleri.
 *
 * Projeksiyon aksiyonları (A12/A13/A14) artık yevmiye üretmez.
 * A20 yön düzeltmesi: 350 Dr / 600 Cr.
 * A07/A16/A17 katalogdan silindi (Faz 7.3.6A3).
 * A10B/A15B yeni aksiyonlar eklendi (Faz 7.3.6A5).
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

// ─── A20 YYİ Hakediş yön düzeltmesi ─────────────────────────────────────────

describe('Faz 7.3.6A1 — A20 YYİ Hakediş yön düzeltmesi', () => {
  const a20 = ACTION_CATALOG_V3['A20_YYI_MONETIZATION']

  test('A20 tanımlı', () => {
    expect(a20).toBeDefined()
  })

  test('A20 inşaat sektöründe 1 transaction üretir', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'CONSTRUCTION', amount: 5_000_000 }))
    expect(txs.length).toBe(1)
  })

  test('A20 transactionunda 2 leg var', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'CONSTRUCTION', amount: 5_000_000 }))
    expect(txs[0].legs.length).toBe(2)
  })

  test('A20 leg[0]: 350 DEBIT (Hakediş yükümlülüğü azalışı)', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'CONSTRUCTION', amount: 5_000_000 }))
    const leg = txs[0].legs[0]
    expect(leg.accountCode).toBe('350')
    expect(leg.side).toBe('DEBIT')
  })

  test('A20 leg[1]: 600 CREDIT (Hasılat artışı)', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'CONSTRUCTION', amount: 5_000_000 }))
    const leg = txs[0].legs[1]
    expect(leg.accountCode).toBe('600')
    expect(leg.side).toBe('CREDIT')
  })

  test('A20 denklik: debit toplamı === credit toplamı', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'CONSTRUCTION', amount: 5_000_000 }))
    const debitSum  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const creditSum = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debitSum).toBe(creditSum)
  })

  test('A20 inşaat dışı sektörde boş döner', () => {
    const txs = a20.buildTransactions(makeContext({ sector: 'MANUFACTURING', amount: 5_000_000 }))
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
