/**
 * R5 — A14_FINANCE_COST_REDUCTION Birim Testleri
 *
 * R5 değişiklikleri:
 *   - computeAmount EKLENDİ (önceden yoktu — projeksiyon aksiyon idi)
 *   - financialExpenseRatio benchmark (half-gap, katsayı 0.5)
 *   - requiredAccountCodes ['660','661','780'] KALDIRILDI
 *   - buildTransactions: 2 tx (102/780 + 690/590 kar zinciri)
 *   - KOBİ fallback: 780 yoksa borç × %25 tahmini
 *
 * Atakan Karar 4: DEKAM için A14 katkısız (finansman borcu hesapta yok).
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext, ActionBuildContext } from '../contracts'

const a14 = ACTION_CATALOG_V3['A14_FINANCE_COST_REDUCTION']

// ─── Yardımcı factory'ler ─────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       200_000_000,
    totalEquity:        80_000_000,
    totalRevenue:      100_000_000,
    netIncome:           2_000_000,
    netSales:          100_000_000,
    operatingProfit:     5_000_000,
    grossProfit:        10_000_000,
    interestExpense:     3_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

function makeBuildCtx(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount:          3_000_000,
    sector:          'TRADE',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    ...overrides,
  }
}

// ─── computeAmount testleri ───────────────────────────────────────────────────

describe('R5 — A14_FINANCE_COST_REDUCTION computeAmount (financialExpenseRatio half-gap)', () => {

  // T1: DEKAM → null (finansman borcu hesapta kayıtlı değil)
  test('T1 — DEKAM profili: 780/borç yok → null (katkısız)', () => {
    // DEKAM accountBalances: sadece 102, 320, 621 — 780/300/400 yok
    // getFinancialExpenses → { amount: null } → A14 → null
    const result = a14.computeAmount!(makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '102': 93_000, '320': 71_900_000, '621': 350_500_000 },
      netSales:        328_000_000,
      interestExpense:  10_000_000,   // FirmContext'te var ama getFinancialExpenses 780 bakar
    }))
    expect(result).toBeNull()
  })

  // T2: Yüksek finansman gideri (780 mevcut) → tutar üretir
  test('T2 — Yüksek finansman gideri: 780=8M → cap=2.4M', () => {
    // TRADE financialExpenseRatio = 0.03; finExp = 8M; ratio = 0.08 > 0.03
    // gap = 0.05; base = 0.05 × 100M × 0.5 = 2.5M
    // cap = 8M × 0.30 = 2.4M → result = min(2.5M, 2.4M) = 2.4M
    const result = a14.computeAmount!(makeCtx({
      accountBalances: { '780': 8_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(2_400_000, 0)
  })

  // T3: KOBİ fallback — 780 yok, KV mali borç var → isEstimated tutarı kullanılır
  test('T3 — KOBİ fallback: 780 yok, 300=30M → finExp = 30M×0.25=7.5M → ~2.25M', () => {
    // getShortTermFinancialDebt(300) = 30M → toplamBorç=30M → finExp=7.5M (isEstimated=true)
    // ratio = 7.5M/100M = 0.075 > 0.03; gap = 0.045; base = 2.25M
    // cap = 7.5M × 0.30 = 2.25M → result = min(2.25M, 2.25M) = 2.25M
    const result = a14.computeAmount!(makeCtx({
      accountBalances: { '300': 30_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(2_250_000, 0)
  })

  // T4: Hedef altı — finExp ratio ≤ benchmark → null
  test('T4 — Finans gideri ratio ≤ benchmark → null', () => {
    // TRADE benchmark = 0.03; finExp = 2M; ratio = 0.02 ≤ 0.03 → null
    const result = a14.computeAmount!(makeCtx({
      accountBalances: { '780': 2_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T5: Hiç borç yok, 780 yok → null
  test('T5 — 780 yok, finansman borcu yok → null', () => {
    const result = a14.computeAmount!(makeCtx({
      accountBalances: {},   // boş
    }))
    expect(result).toBeNull()
  })

  // T6: netSales = 0 → null
  test('T6 — netSales = 0 → null', () => {
    const result = a14.computeAmount!(makeCtx({
      accountBalances: { '780': 5_000_000 },
      netSales: 0,
    }))
    expect(result).toBeNull()
  })

  // T7: CONSTRUCTION yüksek finansman gideri → tutar üretir
  test('T7 — CONSTRUCTION: financialExpenseRatio=0.05, 780=10M → tutar döner', () => {
    // CONSTRUCTION financialExpenseRatio = 0.05; finExp=10M; netSales=100M
    // ratio = 0.10 > 0.05; gap = 0.05; base = 2.5M; cap = 3M → result = 2.5M
    const result = a14.computeAmount!(makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '780': 10_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

})

// ─── buildTransactions testleri ──────────────────────────────────────────────

describe('R5 — A14_FINANCE_COST_REDUCTION buildTransactions (2 tx, kar zinciri)', () => {

  // T8: 2 transaction döner
  test('T8 — buildTransactions: 2 tx döner (R5)', () => {
    const txs = a14.buildTransactions(makeBuildCtx())
    expect(txs).toHaveLength(2)
  })

  // T9: tx[0] denklik — 102/780 (gerçek 780 kaydı varsa)
  // R7A Mini: accountBalances: { '780': 3_000_000 } → isEstimated=false → '780' kullanılır
  test('T9 — tx[0]: 102 DEBIT = 780 CREDIT (780 hesabı kayıtlı)', () => {
    const txs = a14.buildTransactions(makeBuildCtx({ accountBalances: { '780': 3_000_000 } }))
    const tx0 = txs[0]
    expect(tx0.legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(tx0.legs[1]).toMatchObject({ accountCode: '780', side: 'CREDIT' })
    // Denklik
    const debit  = tx0.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx0.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T10: tx[1] denklik — 690/590 (kar zinciri)
  test('T10 — tx[1]: 690 DEBIT = 590 CREDIT (kar zinciri)', () => {
    const txs = a14.buildTransactions(makeBuildCtx())
    const tx1 = txs[1]
    expect(tx1.legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(tx1.legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // Denklik
    const debit  = tx1.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx1.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T11: Vergi hesabı (691) YOK
  test('T11 — Vergi hesabı 691 YOK (R5 — R4 pattern)', () => {
    const txs = a14.buildTransactions(makeBuildCtx())
    const allLegs = txs.flatMap(tx => tx.legs)
    const has691 = allLegs.some(leg => leg.accountCode === '691')
    expect(has691).toBe(false)
  })

  // T12: amount = 0 → boş array
  test('T12 — amount = 0 → boş array', () => {
    const txs = a14.buildTransactions(makeBuildCtx({ amount: 0 }))
    expect(txs).toHaveLength(0)
  })

  // T13: Tutar denkliği
  test('T13 — Tüm tx denklik: her tx debit toplamı = credit toplamı', () => {
    const txs = a14.buildTransactions(makeBuildCtx({ amount: 4_000_000 }))
    for (const tx of txs) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  })

  // T14: KOBİ (R7A Mini) — 780 yok → isEstimated:true → 660 kullanılır
  // Yevmiyede 780 hesabına negatif bakiye oluşmasını önler
  test('T14 — KOBİ: 780 hesabı yoksa tx[0] 102 DEBIT = 660 CREDIT', () => {
    const txs = a14.buildTransactions(makeBuildCtx({ accountBalances: {} }))
    expect(txs).toHaveLength(2)
    const tx0 = txs[0]
    expect(tx0.legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(tx0.legs[1]).toMatchObject({ accountCode: '660', side: 'CREDIT' })
    // Denklik
    const debit  = tx0.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx0.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

})
