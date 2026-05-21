/**
 * R5 — getOperatingExpenses + getFinancialExpenses Helper Testleri
 *
 * getOperatingExpenses:
 *   1. Detay (632+633+634) — büyük firma
 *   2. KOBİ fallback (grossProfit − operatingProfit)
 *   3. Null (detay yok + fallback ≤ 0)
 *
 * getFinancialExpenses:
 *   1. 780/781 mevcut → isEstimated=false
 *   2. 780 yok, borç var → isEstimated=true (borç × %25)
 *   3. Hiçbir şey yok → { amount: null }
 */

import {
  getOperatingExpenses,
  getFinancialExpenses,
} from '../ratioHelpers'
import type { FirmContext } from '../contracts'

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       100_000_000,
    totalEquity:        40_000_000,
    totalRevenue:       80_000_000,
    netIncome:           2_000_000,
    netSales:           80_000_000,
    operatingProfit:     5_000_000,
    grossProfit:        15_000_000,
    interestExpense:     2_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

// ─── getOperatingExpenses testleri ────────────────────────────────────────────

describe('R5 — getOperatingExpenses', () => {

  // T1: Detay hesaplar (büyük firma — 632+633+634)
  test('T1 — 632+633+634 detay → toplamları döner', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: { '632': 5_000_000, '633': 3_000_000, '634': 2_000_000 },
    }))
    expect(result).toBe(10_000_000)
  })

  // T2: Sadece 632 (633/634 yok)
  test('T2 — Sadece 632 → 632 değerini döner', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: { '632': 8_000_000 },
    }))
    expect(result).toBe(8_000_000)
  })

  // T3: 630/631 dahil edilmez (R5 — sadece 632-634)
  test('T3 — 630/631 olan ama 632-634 sıfır → KOBİ fallback kullanılır', () => {
    // 632+633+634 = 0 → detay yok → fallback = grossProfit(15M) - operatingProfit(5M) = 10M
    const result = getOperatingExpenses(makeCtx({
      accountBalances: { '630': 10_000_000, '631': 5_000_000 },
    }))
    expect(result).toBe(10_000_000)  // fallback, 630/631 değil
  })

  // T4: KOBİ fallback (accountBalances boş)
  test('T4 — KOBİ fallback: detay yok → grossProfit - operatingProfit', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: {},
      grossProfit:     18_000_000,
      operatingProfit:  8_000_000,
    }))
    expect(result).toBe(10_000_000)  // 18M - 8M = 10M
  })

  // T5: Fallback negatif → null
  test('T5 — Fallback negatif (grossProfit < operatingProfit) → null', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: {},
      grossProfit:     3_000_000,
      operatingProfit: 5_000_000,   // fark = -2M < 0 → null
    }))
    expect(result).toBeNull()
  })

  // T6: Fallback sıfır → null
  test('T6 — Fallback sıfır (grossProfit = operatingProfit) → null', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: {},
      grossProfit:     5_000_000,
      operatingProfit: 5_000_000,   // fark = 0 → null
    }))
    expect(result).toBeNull()
  })

  // T7: Detay var ama sıfır, fallback da sıfır → null
  test('T7 — Detay sıfır + fallback sıfır → null', () => {
    const result = getOperatingExpenses(makeCtx({
      accountBalances: { '632': 0 },
      grossProfit:     5_000_000,
      operatingProfit: 5_000_000,
    }))
    expect(result).toBeNull()
  })

  // T8: Alt kırılım key'leri (632.01) doğrudan erişimle eşleşmez → KOBİ fallback devreye girer
  test('T8 — 632.01 key eşleşmez → KOBİ fallback (grossProfit-operatingProfit)', () => {
    // getOperatingExpenses accountBalances['632'] doğrudan bakar (prefix match yapmaz)
    // 632.01 → opexDetay=0 → fallback = grossProfit(15M) - operatingProfit(5M) = 10M
    const result = getOperatingExpenses(makeCtx({
      accountBalances: { '632.01': 4_000_000, '634.02': 2_000_000 },
    }))
    expect(result).toBe(10_000_000)  // KOBİ fallback devreye girdi
  })

})

// ─── getFinancialExpenses testleri ───────────────────────────────────────────

describe('R5 — getFinancialExpenses', () => {

  // T9: 780 mevcut → { amount: fin780, isEstimated: false }
  test('T9 — 780 mevcut → isEstimated=false', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '780': 5_000_000 },
    }))
    expect(result.amount).toBe(5_000_000)
    expect(result.isEstimated).toBe(false)
  })

  // T10: 780+781 ikisi var → toplam döner
  test('T10 — 780+781 ikisi var → toplam, isEstimated=false', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '780': 3_000_000, '781': 2_000_000 },
    }))
    expect(result.amount).toBe(5_000_000)
    expect(result.isEstimated).toBe(false)
  })

  // T11: 780 yok, KV mali borç var → isEstimated=true, borç × 0.25
  test('T11 — 780 yok, 300=20M → isEstimated=true, amount=5M (20M×0.25)', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '300': 20_000_000 },
    }))
    expect(result.amount).toBe(5_000_000)
    expect(result.isEstimated).toBe(true)
  })

  // T12: 780 yok, UV mali borç var → isEstimated=true
  test('T12 — 780 yok, 400=40M → isEstimated=true, amount=10M', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '400': 40_000_000 },
    }))
    expect(result.amount).toBe(10_000_000)  // 40M × 0.25
    expect(result.isEstimated).toBe(true)
  })

  // T13: KV + UV borç → toplamı kullanır
  test('T13 — 300=20M + 400=10M → isEstimated=true, amount=7.5M', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '300': 20_000_000, '400': 10_000_000 },
    }))
    expect(result.amount).toBe(7_500_000)  // (20M+10M) × 0.25
    expect(result.isEstimated).toBe(true)
  })

  // T14: Hiçbir şey yok → { amount: null, isEstimated: false }
  test('T14 — Hiçbir şey yok → { amount: null, isEstimated: false }', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: {},
    }))
    expect(result.amount).toBeNull()
    expect(result.isEstimated).toBe(false)
  })

  // T15: DEKAM profili — 780 yok, borç hesap yok → null
  test('T15 — DEKAM: 320/621 var ama 780/borç yok → { amount: null }', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '102': 93_000, '320': 71_900_000, '621': 350_500_000 },
    }))
    expect(result.amount).toBeNull()
    expect(result.isEstimated).toBe(false)
  })

})
