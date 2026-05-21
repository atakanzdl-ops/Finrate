/**
 * R5 — A21_OPERATING_PROFIT_REFORM Birim Testleri
 *
 * R5 değişiklikleri:
 *   - computeAmount: ebitMargin → operatingExpenseRatio benchmark (half-gap)
 *   - operatingProfit < 0 guard KALDIRILDI
 *   - buildTransactions: 2 tx (102/632 nakit + 690/590 kar zinciri)
 *   - KOBİ fallback: detay yoksa grossProfit - operatingProfit kullanılır
 *
 * Atakan Karar 4: DEKAM için A21 katkısız (paradoks — brüt zarar + yüksek opex fallback negatif).
 * Atakan Karar 5: Half-gap katsayısı 0.5 (R4 ile tutarlı).
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext, ActionBuildContext } from '../contracts'

const a21 = ACTION_CATALOG_V3['A21_OPERATING_PROFIT_REFORM']

// ─── Yardımcı factory'ler ─────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       200_000_000,
    totalEquity:        80_000_000,
    totalRevenue:      100_000_000,
    netIncome:           1_000_000,
    netSales:          100_000_000,
    operatingProfit:     5_000_000,
    grossProfit:        20_000_000,
    interestExpense:     2_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

function makeBuildCtx(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount:          5_000_000,
    sector:          'TRADE',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    ...overrides,
  }
}

// ─── Testler ──────────────────────────────────────────────────────────────────

describe('R5 — A21_OPERATING_PROFIT_REFORM computeAmount (operatingExpenseRatio half-gap)', () => {

  // T1: DEKAM → null (paradoks: brüt zarar + negatif opex fallback)
  test('T1 — DEKAM profili: brüt zarar ortamı → null (A21 katkısız)', () => {
    // DEKAM: grossProfit=-22.5M, operatingProfit=-3M
    // opexFallback = -22.5M - (-3M) = -19.5M < 0 → opex = null → null
    const result = a21.computeAmount!(makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '102': 93_000, '320': 71_900_000, '621': 350_500_000 },
      netSales:        328_000_000,
      grossProfit:     -22_500_000,
      operatingProfit:  -3_000_000,
    }))
    expect(result).toBeNull()
  })

  // T2: ENES profili — IT sektörü, opex benchmark üstü → tutar üretir
  test('T2 — ENES (IT): opex 30M > benchmark 21M → ~4.5M', () => {
    // IT operatingExpenseRatio = 0.210; opex = 30M; currentRatio = 0.30
    // gap = 0.09; base = 0.09 × 100M × 0.5 = 4.5M; cap = 30M × 0.25 = 7.5M
    // result = min(4.5M, 7.5M) = 4.5M
    const result = a21.computeAmount!(makeCtx({
      sector:          'IT',
      accountBalances: { '632': 30_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(4_500_000, 0)
  })

  // T3: ORGANIKA — KOBİ fallback (detay yok, gelir tablosu farkı)
  test('T3 — ORGANIKA (KOBİ fallback): grossProfit-operatingProfit = 15M > 10.5M → ~2.25M', () => {
    // Detay hesap yok → fallback = 20M - 5M = 15M; TRADE ratio = 0.15 > 0.105
    // gap = 0.045; base = 2.25M; cap = 3.75M → result = 2.25M
    const result = a21.computeAmount!(makeCtx({
      accountBalances: {},   // KOBİ: detay yok
      grossProfit:     20_000_000,
      operatingProfit:  5_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(2_250_000, 0)
  })

  // T4: Brüt zarar firma + yüksek opex → tutar üretir (R5 guard yok)
  test('T4 — Brüt zarar firma: opex fallback 20M > benchmark → ~4.75M (guard kaldırıldı)', () => {
    // grossProfit=-5M, operatingProfit=-25M → fallback = -5M - (-25M) = 20M > 0
    // TRADE ratio = 0.20 > 0.105; gap = 0.095; base = 4.75M; cap = 5M
    // result = min(4.75M, 5M) = 4.75M
    const result = a21.computeAmount!(makeCtx({
      accountBalances: {},
      grossProfit:      -5_000_000,
      operatingProfit: -25_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(4_750_000, 0)
  })

  // T5: Hedef altı — opex ratio ≤ benchmark → null
  test('T5 — Opex ratio ≤ benchmark → null', () => {
    // TRADE benchmark = 0.105; opex = 8M; ratio = 0.08 ≤ 0.105 → null
    const result = a21.computeAmount!(makeCtx({
      accountBalances: { '632': 8_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T6: netSales = 0 → null
  test('T6 — netSales = 0 → null', () => {
    const result = a21.computeAmount!(makeCtx({ netSales: 0 }))
    expect(result).toBeNull()
  })

  // T7: KOBİ fallback → opex negatif → null
  test('T7 — KOBİ fallback negatif (grossProfit < operatingProfit) → null', () => {
    // fallback = 5M - 10M = -5M < 0 → opex = null → null
    const result = a21.computeAmount!(makeCtx({
      accountBalances: {},
      grossProfit:      5_000_000,
      operatingProfit: 10_000_000,
    }))
    expect(result).toBeNull()
  })

  // T8: cap devreye girer (opex × 0.25)
  test('T8 — cap = opex×0.25 kısıtlayıcı olur (büyük gap)', () => {
    // opex = 50M; ratio = 0.50 >> 0.105; gap = 0.395; base = 19.75M
    // cap = 50M × 0.25 = 12.5M → result = min(19.75M, 12.5M) = 12.5M
    const result = a21.computeAmount!(makeCtx({
      accountBalances: { '632': 50_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(12_500_000, 0)
  })

})

describe('R5 — A21_OPERATING_PROFIT_REFORM buildTransactions (2 tx, kar zinciri)', () => {

  // T9: 2 transaction döner
  test('T9 — buildTransactions: 2 tx döner (R5)', () => {
    const txs = a21.buildTransactions(makeBuildCtx())
    expect(txs).toHaveLength(2)
  })

  // T10: tx[0] denklik — 102/632
  test('T10 — tx[0]: 102 DEBIT = 632 CREDIT (nakit kanal)', () => {
    const txs = a21.buildTransactions(makeBuildCtx())
    const tx0 = txs[0]
    expect(tx0.legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(tx0.legs[1]).toMatchObject({ accountCode: '632', side: 'CREDIT' })
    // Denklik
    const debit  = tx0.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx0.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T11: tx[1] denklik — 690/590 (kar zinciri)
  test('T11 — tx[1]: 690 DEBIT = 590 CREDIT (kar zinciri)', () => {
    const txs = a21.buildTransactions(makeBuildCtx())
    const tx1 = txs[1]
    expect(tx1.legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(tx1.legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // Denklik
    const debit  = tx1.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx1.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T12: Vergi hesabı (691) YOK — kar zincirinde kurumlar vergisi kaydı yok (R5)
  test('T12 — Vergi hesabı 691 YOK (R5 — R4 pattern)', () => {
    const txs = a21.buildTransactions(makeBuildCtx())
    const allLegs = txs.flatMap(tx => tx.legs)
    const has691 = allLegs.some(leg => leg.accountCode === '691')
    expect(has691).toBe(false)
  })

  // T13: amount = 0 → boş array
  test('T13 — amount = 0 → boş array', () => {
    const txs = a21.buildTransactions(makeBuildCtx({ amount: 0 }))
    expect(txs).toHaveLength(0)
  })

})
