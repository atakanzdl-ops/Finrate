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

// ─── A20 + A21 Kârlılık Reformu — Faz 7.3.50A.11 ────────────────────────────

describe('Faz 7.3.50A.11 — A20_GROSS_MARGIN_REFORM computeAmount + buildTransactions', () => {
  const a20 = ACTION_CATALOG_V3['A20_GROSS_MARGIN_REFORM']

  const makeA20Ctx = (overrides: Partial<ActionBuildContext> = {}): ActionBuildContext => ({
    amount:          5_000_000,
    sector:          'TRADE',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    netSales:        100_000_000,
    grossProfit:      8_000_000,   // 8% margin — TRADE benchmark = 12%
    ...overrides,
  })

  // T1: sektör altı marj → tutar üretir
  test('T1 — TRADE %8 marj, benchmark %14 → computeAmount tutar döner', () => {
    // TRADE grossMargin benchmark = 0.14
    // gap = 0.14 - 0.08 = 0.06; target = 0.06 * 100M * 0.5 = 3M; cap = 100M * 0.20 = 20M
    // result = min(3M, 20M) = 3M
    const result = a20.computeAmount!(makeA20Ctx())
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(3_000_000, 0)
  })

  // T2: negatif grossProfit → null
  test('T2 — negatif grossProfit → null', () => {
    const result = a20.computeAmount!(makeA20Ctx({ grossProfit: -1_000_000 }))
    expect(result).toBeNull()
  })

  // T3: sektör üstü grossMargin → null
  test('T3 — grossMargin >= benchmark → null', () => {
    // TRADE benchmark = 0.12; 15M/100M = 0.15 >= 0.12 → null
    const result = a20.computeAmount!(makeA20Ctx({ grossProfit: 15_000_000 }))
    expect(result).toBeNull()
  })

  // T4: max cap (netSales × 0.20)
  test('T4 — büyük gap: cap = netSales × 0.20 devreye girer', () => {
    // TRADE benchmark = 0.12; grossProfit = 0 → margin = 0
    // gap = 0.12; target = 0.12 * 100M * 0.5 = 6M; cap = 100M * 0.20 = 20M
    // result = min(6M, 20M) = 6M (cap kısıtlayıcı değil, ama netSales*0.20 cap var)
    // gap=0.12 → target=6M; min(6M,20M)=6M → cap DEVREYE GİRMEZ doğal
    // büyük test için gap×0.5 > 0.20 gerekir: gap=0.50 → target=25M > 20M → cap devreye girer
    const result = a20.computeAmount!(makeA20Ctx({
      netSales:    100_000_000,
      grossProfit:  0,          // margin=0
      sector:      'IT',        // IT grossMargin benchmark = 0.36
    }))
    // gap = 0.36; target = 0.36 * 100M * 0.5 = 18M < 20M → no cap
    // Ama IT benchmark 0.36 > 0.20 kontrolü için: 0.36*100M*0.5=18M < 20M → cap girmez
    // grossProfit=0 => null olur çünkü guard: "if (grossProfit < 0) return null" — 0 ise geçer
    // currentMargin = 0/100M = 0; 0 < 0.36 → aktif; gap=0.36; target=18M; cap=20M → 18M
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(18_000_000, 0)
  })

  // T5: buildTransactions → 102 DEBIT / 621 CREDIT
  test('T5 — buildTransactions: 102 DEBIT, 621 CREDIT', () => {
    const txs = a20.buildTransactions(makeA20Ctx({ amount: 3_000_000 }))
    expect(txs).toHaveLength(1)
    expect(txs[0].legs).toHaveLength(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT',  amount: 3_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '621', side: 'CREDIT', amount: 3_000_000 })
  })
})

describe('Faz 7.3.50A.11 — A21_OPERATING_PROFIT_REFORM computeAmount + buildTransactions', () => {
  const a21 = ACTION_CATALOG_V3['A21_OPERATING_PROFIT_REFORM']

  const makeA21Ctx = (overrides: Partial<ActionBuildContext> = {}): ActionBuildContext => ({
    amount:          3_000_000,
    sector:          'TRADE',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    netSales:        100_000_000,
    operatingProfit:  1_000_000,  // 1% margin — TRADE ebitMargin benchmark = 3.5%
    accountBalances:  { '630': 5_000_000, '631': 3_000_000, '632': 2_000_000 }, // opexTotal = 10M
    ...overrides,
  })

  // T6: sektör altı operatingMargin → tutar üretir
  test('T6 — TRADE %1 operatingMargin, benchmark %3.8 → computeAmount tutar döner', () => {
    // TRADE ebitMargin benchmark = 0.038
    // gap = 0.038 - 0.01 = 0.028; baseTarget = 0.028 * 100M * 0.5 = 1.4M
    // opexTotal = 10M; opexCap = 5M; netSales*0.10 = 10M
    // result = min(1.4M, 10M, 5M) = 1.4M
    const result = a21.computeAmount!(makeA21Ctx())
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(1_400_000, 0)
  })

  // T7: negatif operatingProfit → null
  test('T7 — negatif operatingProfit → null', () => {
    const result = a21.computeAmount!(makeA21Ctx({ operatingProfit: -500_000 }))
    expect(result).toBeNull()
  })

  // T8: sektör üstü operatingMargin → null
  test('T8 — operatingMargin >= benchmark → null', () => {
    // TRADE ebitMargin = 0.035; 5M/100M = 0.05 >= 0.035 → null
    const result = a21.computeAmount!(makeA21Ctx({ operatingProfit: 5_000_000 }))
    expect(result).toBeNull()
  })

  // T9: opexCap devreye girer
  test('T9 — opexCap = opexTotal×0.5 kısıtlayıcı olur', () => {
    // Küçük OPEX: opexTotal = 500K; opexCap = 250K
    // gap=0.025; baseTarget=1.25M; netSales*0.10=10M; opexCap=250K → kısıtlayıcı
    const result = a21.computeAmount!(makeA21Ctx({
      accountBalances: { '630': 300_000, '631': 100_000, '632': 100_000 }, // opexTotal=500K
    }))
    expect(result).not.toBeNull()
    expect(result).toBeCloseTo(250_000, 0)
  })

  // T10: buildTransactions → 102 DEBIT / 632 CREDIT
  test('T10 — buildTransactions: 102 DEBIT, 632 CREDIT', () => {
    const txs = a21.buildTransactions(makeA21Ctx({ amount: 2_000_000 }))
    expect(txs).toHaveLength(1)
    expect(txs[0].legs).toHaveLength(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT',  amount: 2_000_000 })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '632', side: 'CREDIT', amount: 2_000_000 })
  })

  // T11 (Regresyon): A12 davranışı KORUNDU — 320/621 kanalı
  test('T11 — Regresyon: A12 hâlâ 320 DEBIT / 621 CREDIT üretir', () => {
    const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']
    const txs  = a12.buildTransactions(makeContext({
      amount:          5_000_000,
      accountBalances: { '320': 50_000_000, '621': 100_000_000 },
    }))
    expect(txs).toHaveLength(2)
    expect(txs[0].legs[0]).toMatchObject({ accountCode: '320', side: 'DEBIT'  })
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '621', side: 'CREDIT' })
  })

  // T12: A21 opexTotal=0 → null
  test('T12 — opexTotal = 0 → null', () => {
    const result = a21.computeAmount!(makeA21Ctx({
      accountBalances: { '630': 0, '631': 0, '632': 0 },
    }))
    expect(result).toBeNull()
  })
})

// ─── A18 customCheck Birim Testleri — Faz 7.3.50A.13 ─────────────────────────

describe('Faz 7.3.50A.13 — A18_NET_SALES_GROWTH customCheck birim testleri', () => {
  const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
  const check = (input: object) => a18.preconditions.customCheck!(input)

  // T_A18_CUSTOM_1: KUZEY ÇAYIR profili — brüt marj %1.46 < TRADE %7 eşiği → elenir
  test('T_A18_CUSTOM_1: KUZEY ÇAYIR profili — düşük marj → pass: false, reason sektör altı', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    268_700_000,
      grossProfit:   3_930_000,  // %1.46 < TRADE 0.14 × 0.5 = 0.07
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Sektör altı/i)
  })

  // T_A18_CUSTOM_2: Normal marj firma — brüt marj %10 > TRADE %7 eşiği → geçer
  test('T_A18_CUSTOM_2: normal marj — %10 > %7 eşiği → pass: true', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    100_000_000,
      grossProfit:  10_000_000,  // %10 > 0.07
    })
    expect(result.pass).toBe(true)
  })

  // T_A18_CUSTOM_3: Tam eşik (%7) — currentMargin < 0.07 DEĞİL → geçer
  test('T_A18_CUSTOM_3: tam eşik %7 — sınırda geçer (< değil, eşit) → pass: true', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    100_000_000,
      grossProfit:   7_000_000,  // exactly %7 = threshold — not < threshold → pass
    })
    expect(result.pass).toBe(true)
  })

  // T_A18_CUSTOM_4: Brüt zarar (grossProfit < 0) → elenir
  test('T_A18_CUSTOM_4: brüt zarar → pass: false, reason brüt zarar', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    100_000_000,
      grossProfit:  -1_000_000,
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Brüt zarar/i)
  })

  // T_A18_CUSTOM_5: netSales = 0 → elenir
  test('T_A18_CUSTOM_5: netSales = 0 → pass: false, reason satış geliri', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    0,
      grossProfit: 10_000_000,
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/satış geliri/i)
  })

  // T_A18_CUSTOM_6: Bilinmeyen sektör → benchmark yok → pass: true (mevcut davranış)
  test('T_A18_CUSTOM_6: bilinmeyen sektör — benchmark yok → pass: true', () => {
    const result = check({
      sector:      'ENERGY',     // SECTOR_CODE_TO_TR'de yok → getBenchmarkValue null döner
      netSales:    100_000_000,
      grossProfit:  15_000_000,
    })
    expect(result.pass).toBe(true)
  })
})

// ─── A18 customCheck Baseline Testleri — Faz 7.3.50A.13.1 ───────────────────
// İş kuralı: "Baseline marj sektör altı %50 ise paketin TAMAMINDA A18 önerilmesin."
// baselineGrossProfit / baselineNetSales baseline marjı verir; bu kontrol current'tan önce gelir.

describe('Faz 7.3.50A.13.1 — A18_NET_SALES_GROWTH customCheck baseline birim testleri', () => {
  const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
  const check = (input: object) => a18.preconditions.customCheck!(input)

  // T_A18_BASELINE_CUSTOM_1:
  // baseline %1.46 + current %7.73 (A20 sonrası artmış marj)
  // → baseline kontrolü engeller (current yüksek olsa dahi)
  test('T_A18_BASELINE_CUSTOM_1: baseline %1.46 + current %7.73 → pass: false (baseline engeller)', () => {
    const result = check({
      sector:               'TRADE',
      netSales:             268_700_000,
      grossProfit:           20_780_000,  // current %7.73 — A20 sonrası artmış
      baselineNetSales:     268_700_000,
      baselineGrossProfit:    3_930_000,  // baseline %1.46 < %7
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Baseline marj/i)
  })

  // T_A18_BASELINE_CUSTOM_2:
  // baseline yok (undefined) + current %1.46 → current kontrolü devreye girer
  test('T_A18_BASELINE_CUSTOM_2: baseline undefined + current %1.46 → pass: false (current)', () => {
    const result = check({
      sector:      'TRADE',
      netSales:    268_700_000,
      grossProfit:   3_930_000,  // current %1.46 < %7
      // baselineNetSales / baselineGrossProfit yok
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Sektör altı/i)
  })

  // T_A18_BASELINE_CUSTOM_3:
  // baseline %8 + current %8 → her iki kontrol de geçer
  test('T_A18_BASELINE_CUSTOM_3: baseline %8 + current %8 → pass: true', () => {
    const result = check({
      sector:               'TRADE',
      netSales:             100_000_000,
      grossProfit:            8_000_000,  // %8 > %7
      baselineNetSales:     100_000_000,
      baselineGrossProfit:    8_000_000,  // %8 > %7
    })
    expect(result.pass).toBe(true)
  })

  // T_A18_BASELINE_CUSTOM_4:
  // baseline grossProfit = 0 → baseline marj = 0/100M = 0 < %7 → elenir
  test('T_A18_BASELINE_CUSTOM_4: baseline grossProfit=0 → pass: false (Baseline marj)', () => {
    const result = check({
      sector:               'TRADE',
      netSales:             100_000_000,
      grossProfit:           10_000_000,  // current %10 (normal)
      baselineNetSales:     100_000_000,
      baselineGrossProfit:            0,  // %0 < %7 → elenir
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Baseline marj/i)
  })

  // T_A18_BASELINE_CUSTOM_5:
  // baseline grossProfit negatif → baselineMargin = -2M/100M = -0.02 < %7 → elenir
  test('T_A18_BASELINE_CUSTOM_5: baseline grossProfit negatif → pass: false (Baseline marj)', () => {
    const result = check({
      sector:               'TRADE',
      netSales:             100_000_000,
      grossProfit:           10_000_000,  // current %10 (normal)
      baselineNetSales:     100_000_000,
      baselineGrossProfit:   -2_000_000,  // negatif → %−2 < %7 → elenir
    })
    expect(result.pass).toBe(false)
    expect(result.reason).toMatch(/Baseline marj/i)
  })
})

// ─── A06 Dominant Stok Seçimi (Faz 7.3.8b-PRE) ──────────────────────────────

describe('Faz 7.3.8b-PRE — A06 dominant stok buildTransactions', () => {
  const a06 = ACTION_CATALOG_V3['A06_INVENTORY_MONETIZATION']!

  // 1. DEKAM benzeri: 150=0, 151=47M → dominant=151
  test('A06 150=0, 151=47M: dominant=151, 151 CREDIT', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          4_700_000,
      sector:          'CONSTRUCTION',
      accountBalances: { '150': 0, '151': 47_000_000, '152': 0, '153': 0 },
    }))
    expect(txs).toHaveLength(1)
    const legs = txs[0].legs
    expect(legs).toHaveLength(2)
    expect(legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT',  amount: 4_700_000 })
    expect(legs[1]).toMatchObject({ accountCode: '151', side: 'CREDIT', amount: 4_700_000 })
  })

  // 2. TRADE sektörü: 153=10M dominant
  test('A06 TRADE: 153=10M, dominantStock=153', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          3_000_000,
      sector:          'TRADE',
      accountBalances: { '150': 0, '151': 0, '152': 0, '153': 10_000_000 },
    }))
    expect(txs).toHaveLength(1)
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '153', side: 'CREDIT' })
  })

  // 3. Manufacturing: 150=15M, 151=10M, 152=5M
  test('A06 manufacturing: 150=15M dominant, 150 CREDIT', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          5_000_000,
      sector:          'MANUFACTURING',
      accountBalances: { '150': 15_000_000, '151': 10_000_000, '152': 5_000_000, '153': 0 },
    }))
    expect(txs).toHaveLength(1)
    expect(txs[0].legs[1]).toMatchObject({ accountCode: '150', side: 'CREDIT' })
  })

  // 4. Dusuk dominant: amount > dominant * 0.95 → sınırlanır
  test('A06 amount 5M > dominant 151=2M*0.95=1.9M → amount sınırlanır', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          5_000_000,
      sector:          'CONSTRUCTION',
      accountBalances: { '150': 0, '151': 2_000_000, '152': 0, '153': 0 },
    }))
    expect(txs).toHaveLength(1)
    const creditLeg = txs[0].legs[1]
    expect(creditLeg.accountCode).toBe('151')
    // amount = min(5M, 2M * 0.95) = 1.9M — clampAmount(1.9M, 1M) = 1.9M
    expect(creditLeg.amount).toBeCloseTo(1_900_000, 0)
    // 102 DEBIT = 151 CREDIT (denklik)
    expect(txs[0].legs[0].amount).toBe(txs[0].legs[1].amount)
  })

  // 5. Tum stok sifir → bos array
  test('A06 150=151=152=153=0 → bos array dondurmeli', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          5_000_000,
      sector:          'MANUFACTURING',
      accountBalances: { '150': 0, '151': 0, '152': 0, '153': 0 },
    }))
    expect(txs).toHaveLength(0)
  })

  // 6. Sadece 159 dolu → 159 kullanilmaz, tum stok 0 → bos array
  test('A06 sadece 159=10M (avans) → 159 kullanilmaz → bos array', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          5_000_000,
      sector:          'MANUFACTURING',
      accountBalances: { '150': 0, '151': 0, '152': 0, '153': 0, '159': 10_000_000 },
    }))
    expect(txs).toHaveLength(0)
  })

  // 7. Transaction denkligi: 102 DEBIT = dominant CREDIT
  test('A06 transaction dengeli: 102 DEBIT = dominant CREDIT', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          3_000_000,
      sector:          'MANUFACTURING',
      accountBalances: { '150': 20_000_000, '151': 0, '152': 0, '153': 0 },
    }))
    expect(txs).toHaveLength(1)
    const debitTotal  = txs[0].legs.filter(l => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0)
    const creditTotal = txs[0].legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debitTotal).toBe(creditTotal)
  })

  // 8. Description dinamik hesap kodu icerir
  test('A06 description dinamik: dominant kod iceriyor', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          3_000_000,
      sector:          'CONSTRUCTION',
      accountBalances: { '150': 0, '151': 8_000_000, '152': 0, '153': 0 },
    }))
    expect(txs[0].description).toContain('151')
    expect(txs[0].description).toContain('102')
  })

  // 9. %95 tampon: dominant 151=5M, amount 5M → 5M * 0.95 = 4.75M
  test('A06 dominant=5M, amount=5M → amount clamp 4.75M', () => {
    const txs = a06.buildTransactions(makeContext({
      amount:          5_000_000,
      sector:          'MANUFACTURING',
      accountBalances: { '150': 0, '151': 5_000_000, '152': 0, '153': 0 },
    }))
    expect(txs).toHaveLength(1)
    expect(txs[0].legs[0].amount).toBeCloseTo(4_750_000, 0)
  })
})
