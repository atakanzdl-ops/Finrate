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

  test('A19 normal senaryoda 2 transaction üretir (4 leg + Tx2 690/590)', () => {
    const txs = a19.buildTransactions(makeA19Context())

    expect(txs.length).toBe(2)
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

    expect(txs.length).toBe(2)
    expect(txs[0].legs[0].amount).toBeCloseTo(10_000_000, 2)
    expect(txs[0].legs[1].amount).toBeCloseTo(10_000_000, 2)
    expect(txs[0].legs[2].amount).toBeCloseTo(7_000_000, 2)
    expect(txs[0].legs[3].amount).toBeCloseTo(7_000_000, 2)
  })

  test('A19 stok hepsi boş: 2 tx (Tx1: 340/600, Tx2: 690/590)', () => {
    // 150-153 hepsinin bakiyesi 0 → totalStock=0 → stoksuz dal
    // B3b-1-FIX: stoksuz dalda da Tx2 eklenir; profitAmount = amount
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '150': 0, '151': 0, '152': 0, '153': 0 },
    }))

    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '340', side: 'DEBIT',  amount: 20_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT', amount: 20_000_000 })
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT',  amount: 20_000_000 })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT', amount: 20_000_000 })
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

  // ── Dominant stok seçimi testleri (B3a-FIX2) ──

  test('A19 151 dolu 153 boş: dominant=151, 4 leg 151 CREDIT', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '151': 6_000_000, '153': 0 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(4)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '151', side: 'CREDIT' })
  })

  test('A19 151=4M 153=6M: dominant=153 (daha büyük), 153 CREDIT', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '151': 4_000_000, '153': 6_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '153', side: 'CREDIT' })
  })

  test('A19 151=8M 153=3M: dominant=151 (daha büyük), 151 CREDIT', () => {
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '151': 8_000_000, '153': 3_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '151', side: 'CREDIT' })
  })

  test('A19 dominant sınırı: 151=6M grossMargin=0.30 → maxByStock=8.57M, costAmount ≤ 6M', () => {
    // maxByStock = 6M / (1 - 0.30) = 8.571M
    // amount = min(20M, 50M, 8.571M) = 8.571M
    // costAmount = 8.571M * 0.70 = 6M (dominant bakiyesini aşmaz)
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '151': 6_000_000 },
      grossProfit: 30_000_000, // grossMargin = 30M/100M = 0.30
    }))
    expect(txs.length).toBe(2)
    const costLeg = txs[0].legs[3]
    expect(costLeg.accountCode).toBe('151')
    expect(costLeg.amount).toBeCloseTo(6_000_000, 0)
  })

  test('A19 159 bakiyeli: 159 artık stok havuzunda yok, 153 dominant olur', () => {
    // B3b-1: 159 stockAccounts listesinden çıkarıldı — avans niteliği
    // 159 bakiyesi olsa bile yok sayılır; dominant 153 seçilir
    const txs = a19.buildTransactions(makeA19Context({
      accountBalances: { '340': 50_000_000, '153': 5_000_000, '159': 20_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(4)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '153', side: 'CREDIT' })
  })
})

// ─── A18 Net Satış Artışı — B3a-FIX3 ────────────────────────────────────────

describe('Faz 7.3.6B3a-FIX3 — A18 Net Satış Artışı muhasebe doğrulaması', () => {
  const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']

  const makeA18Context = (overrides: Partial<ActionBuildContext> = {}) =>
    makeContext({
      amount:      10_000_000,
      netSales:   100_000_000,
      grossProfit: 30_000_000,   // grossMargin = 0.30
      ...overrides,
    })

  // ── 2-leg + Tx2 (stok yok — B3b-1-FIX) ──

  test('A18 inşaat + stok yok: 2 tx (Tx1: 120/600, Tx2: 690/590)', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'CONSTRUCTION',
      accountBalances: {},
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '120', side: 'DEBIT'  })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT' })
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // stoksuzda profitAmount = amount (costAmount yok)
    expect(txs[1].legs[0].amount).toBe(txs[0].legs[0].amount)
  })

  test('A18 hizmet + stok yok: 2 tx (Tx1: 102/600, Tx2: 690/590)', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'SERVICES',
      accountBalances: {},
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT' })
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
  })

  test('A18 IT + stok yok: 2 tx, Tx1: 102 DEBIT, Tx2: 690/590', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'IT',
      accountBalances: {},
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
  })

  // ── 4-leg (stok var) ──

  test('A18 inşaat + 151=6M: 4 leg + Tx2, 120 DEBIT, 151 CREDIT', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'CONSTRUCTION',
      accountBalances: { '151': 6_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(4)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '120', side: 'DEBIT'  })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '600', side: 'CREDIT' })
    expect(txs[0].legs[2]).toMatchObject({ accountCode: '621', side: 'DEBIT'  })
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '151', side: 'CREDIT' })
  })

  test('A18 imalat + 152=8M: dominant=152, 152 CREDIT, txs.length=2', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'MANUFACTURING',
      accountBalances: { '152': 8_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(4)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '152', side: 'CREDIT' })
  })

  test('A18 dominant sınırı: 151=4M 153=6M grossMargin=0.30 → dominant=153, costAmount≤6M', () => {
    // maxByStock = 6M / (1-0.30) = 8.571M
    // amount = min(10M, 8.571M) = 8.571M
    // costAmount = 8.571M * 0.70 = 6M (153 bakiyesini aşmaz)
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'MANUFACTURING',
      accountBalances: { '151': 4_000_000, '153': 6_000_000 },
    }))
    expect(txs.length).toBe(2)
    const costLeg = txs[0].legs[3]
    expect(costLeg.accountCode).toBe('153')
    expect(costLeg.amount).toBeCloseTo(6_000_000, 0)
  })

  // ── guard koşulları ──

  test('A18 netSales <= 0 → boş array', () => {
    expect(a18.buildTransactions(makeA18Context({ netSales: 0 }))).toEqual([])
  })

  test('A18 grossProfit <= 0 → boş array', () => {
    expect(a18.buildTransactions(makeA18Context({ grossProfit: 0 }))).toEqual([])
  })

  test('A18 grossMargin >= 1 → boş array', () => {
    expect(a18.buildTransactions(makeA18Context({
      netSales:   100_000_000,
      grossProfit: 100_000_000,
    }))).toEqual([])
  })

  test('A18 denklik: 4-leg DEBIT = CREDIT toplamı (Tx1)', () => {
    const txs = a18.buildTransactions(makeA18Context({
      sector:         'MANUFACTURING',
      accountBalances: { '153': 20_000_000 },
    }))
    const debit  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBeCloseTo(credit, 2)
  })
})

// ─── A18/A19 B3b-1: Tx2 + 159 çıkarma ───────────────────────────────────────

describe('Faz 7.3.6B3b-1 — A18/A19 Tx2 (690/590) + 159 stok hariç', () => {
  const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
  const a19 = ACTION_CATALOG_V3['A19_ADVANCE_TO_REVENUE']

  const makeA18Ctx = (overrides: Partial<ActionBuildContext> = {}) =>
    makeContext({
      amount: 10_000_000,
      netSales: 100_000_000,
      grossProfit: 30_000_000, // grossMargin = 0.30
      sector: 'MANUFACTURING',
      ...overrides,
    })

  const makeA19Ctx = (overrides: Partial<ActionBuildContext> = {}) =>
    makeContext({
      amount: 20_000_000,
      netSales: 100_000_000,
      grossProfit: 30_000_000, // grossMargin = 0.30
      accountBalances: { '340': 50_000_000, '153': 100_000_000 },
      ...overrides,
    })

  // ── A18 Tx2 ──

  test('A18 stoklu: 2 transaction döner — Tx2 690 DEBIT / 590 CREDIT', () => {
    const txs = a18.buildTransactions(makeA18Ctx({
      accountBalances: { '153': 20_000_000 },
    }))
    expect(txs.length).toBe(2)
    const tx2 = txs[1]
    expect(tx2.legs.length).toBe(2)
    expect(tx2.legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(tx2.legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // profitAmount = amount × grossMargin = 10M × 0.30 = 3M
    expect(tx2.legs[0].amount).toBeCloseTo(3_000_000, 0)
    expect(tx2.legs[1].amount).toBeCloseTo(3_000_000, 0)
  })

  test('A18 stoksuz: 2 tx (Tx2: 690/590, profitAmount=amount)', () => {
    // B3b-1-FIX: stoksuzda da Tx2 eklenir; maliyet yok → profitAmount = amount
    const txs = a18.buildTransactions(makeA18Ctx({ accountBalances: {} }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // stoksuzda profitAmount = amount (costAmount yok)
    expect(txs[1].legs[0].amount).toBe(txs[0].legs[0].amount)
  })

  test('A18 Tx2 denklik: 690 DEBIT = 590 CREDIT', () => {
    const txs = a18.buildTransactions(makeA18Ctx({
      accountBalances: { '153': 20_000_000 },
    }))
    const tx2debit  = txs[1].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const tx2credit = txs[1].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(tx2debit).toBeCloseTo(tx2credit, 2)
  })

  test('A18 159 bakiyeli: 159 stok havuzunda değil, totalStock=0 → stoksuz dal (2 tx)', () => {
    // 159 B3b-1 ile stockAccounts'tan çıkarıldı; stoksuz dal tetiklenir
    // B3b-1-FIX: stoksuz dalda da Tx2 var → 2 transaction
    const txs = a18.buildTransactions(makeA18Ctx({
      accountBalances: { '159': 10_000_000 }, // sadece 159 var
    }))
    expect(txs.length).toBe(2)        // stoksuz → Tx1 (2 leg) + Tx2 (690/590)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT' })
  })

  // ── A19 Tx2 ──

  test('A19 stoklu: 2 transaction döner — Tx2 690 DEBIT / 590 CREDIT', () => {
    const txs = a19.buildTransactions(makeA19Ctx())
    expect(txs.length).toBe(2)
    const tx2 = txs[1]
    expect(tx2.legs.length).toBe(2)
    expect(tx2.legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(tx2.legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // grossMargin = 0.30; amount = min(20M, 50M, ...) = 20M; profitAmount = 6M
    expect(tx2.legs[0].amount).toBeCloseTo(6_000_000, 0)
    expect(tx2.legs[1].amount).toBeCloseTo(6_000_000, 0)
  })

  test('A19 stoksuz: 2 tx (Tx1: 340/600, Tx2: 690/590, profitAmount=amount)', () => {
    // B3b-1-FIX: stoksuzda da Tx2 eklenir; maliyet yok → profitAmount = amount
    const txs = a19.buildTransactions(makeA19Ctx({
      accountBalances: { '340': 50_000_000, '150': 0, '151': 0, '152': 0, '153': 0 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs.length).toBe(2)
    expect(txs[1].legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(txs[1].legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // profitAmount = amount (costAmount = 0 çünkü stok yok)
    expect(txs[1].legs[0].amount).toBe(txs[0].legs[0].amount)
  })

  test('A19 Tx2 denklik: 690 DEBIT = 590 CREDIT', () => {
    const txs = a19.buildTransactions(makeA19Ctx())
    const tx2debit  = txs[1].legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const tx2credit = txs[1].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(tx2debit).toBeCloseTo(tx2credit, 2)
  })

  test('A19 159 bakiyeli: 159 stok havuzunda değil, dominant 153 seçilir', () => {
    // 159 B3b-1 ile stockAccounts'tan çıkarıldı
    const txs = a19.buildTransactions(makeA19Ctx({
      accountBalances: { '340': 50_000_000, '153': 5_000_000, '159': 50_000_000 },
    }))
    expect(txs.length).toBe(2)
    expect(txs[0].legs[3]).toMatchObject({ accountCode: '153', side: 'CREDIT' })
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

  test('A12 computeAmount: %25 margin, IT sektörü hedef %36 → 11M döner (cap %50)', () => {
    // IT (Bilişim) grossMargin benchmark = 0.36
    // currentMargin = 25M/100M = 0.25 < 0.36*1.05=0.378 → aktif
    // requiredImprovement = (0.36 - 0.25) * 100M = 11M
    // cap = 0.50
    // maxFromSupplier = 50M * 0.50 = 25M, maxFromCogs = 100M * 0.50 = 50M
    // result = min(11M, 25M, 50M) = 11M  (requiredImprovement kısıtlayıcı)
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
    // (0.36 - 0.25) * 100M = float ≈ 11M — toBeCloseTo(0 dp) güvenli
    expect(result).toBeCloseTo(11_000_000, 0)
  })

  test('A12 computeAmount: küçük supplier — maxFromSupplier cap kısıtlayıcı', () => {
    // requiredImprovement = (0.36 - 0.25) * 100M = 11M
    // maxFromSupplier = 8M * 0.50 = 4M  ← kısıtlayıcı
    // maxFromCogs     = 100M * 0.50 = 50M
    // result = min(11M, 4M, 50M) = 4M
    const result = a12.computeAmount!({
      sector:           'IT',
      accountBalances:  { '320': 8_000_000, '621': 100_000_000 },
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
    expect(result).toBe(4_000_000)
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
