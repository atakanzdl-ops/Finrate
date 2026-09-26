/**
 * Faz 7b — A15 Ortaklara Borç → Sermaye: 431 (UV) desteği ve guardrail tam tutar kuralı.
 * Tekno Enerji 2026 Q2 benzeri: 431 = 24 Mn, 331 = 0, özkaynak 26,7 Mn (%90).
 */
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext, ActionBuildContext } from '../contracts'

const A15 = ACTION_CATALOG_V3.A15_DEBT_TO_EQUITY_SWAP

function ctx(balances: Record<string, number>, totalEquity: number, totalAssets = 52_475_095): FirmContext {
  return {
    sector: 'TRADE', accountBalances: balances, totalAssets, totalEquity,
    totalRevenue: 550_000_000, netIncome: 2_776_051, netSales: 550_000_000, operatingProfit: 3_701_401,
    grossProfit: 24_275_466, interestExpense: 0, operatingCashFlow: null,
  } as FirmContext
}

describe('A15 — 431 UV ortaklara borç kaynağı', () => {
  test('sadece 431 varsa preconditions geçer (331 = 0)', () => {
    const check = A15.preconditions.customCheck!
    expect(check({ accounts: [{ accountCode: '431', amount: 24_000_000 }] }).pass).toBe(true)
    expect(check({ accounts: [{ accountCode: '331', amount: 500_000 }] }).pass).toBe(false)
    expect(check({ accounts: [{ accountCode: '331', amount: 600_000 }, { accountCode: '431', amount: 600_000 }] }).pass).toBe(true)
  })

  test('Tekno: ortaklara borç / özkaynak %90 > %50 → tam tutar (24 Mn) önerilir', () => {
    expect(A15.computeAmount!(ctx({ '431': 24_000_000 }, 26_722_965))).toBe(24_000_000)
  })

  test('oran %25–50 arası ve özkaynak/aktif zaten hedef üstünde → kaynağın yarısı', () => {
    const c = ctx({ '331': 8_000_000 }, 20_000_000, 25_000_000)   // 8/20 = %40, özkaynak/aktif %80
    expect(A15.computeAmount!(c)).toBe(4_000_000)
  })

  test('oran %25 altı ve özkaynak/aktif hedef üstünde → öneri yok (null)', () => {
    expect(A15.computeAmount!(ctx({ '331': 2_000_000 }, 20_000_000, 25_000_000))).toBeNull()
  })

  test('fiş: 431 → 500 (331 yoksa 331 bacağı üretilmez)', () => {
    const bc = { sector: 'TRADE', horizon: 'medium', analysis: {}, amount: 24_000_000, previousActions: [], accountBalances: { '431': 24_000_000 } } as unknown as ActionBuildContext
    const tx = A15.buildTransactions(bc)
    expect(tx).toHaveLength(1)
    const legs = tx[0].legs
    expect(legs.find(l => l.accountCode === '431')?.side).toBe('DEBIT')
    expect(legs.find(l => l.accountCode === '431')?.amount).toBe(24_000_000)
    expect(legs.find(l => l.accountCode === '331')).toBeUndefined()
    expect(legs.find(l => l.accountCode === '500')?.amount).toBe(24_000_000)
  })

  test('fiş: 331 + 431 birlikte → önce 331, kalan 431; 500 toplamı', () => {
    const bc = { sector: 'TRADE', horizon: 'medium', analysis: {}, amount: 10_000_000, previousActions: [], accountBalances: { '331': 4_000_000, '431': 20_000_000 } } as unknown as ActionBuildContext
    const legs = A15.buildTransactions(bc)[0].legs
    expect(legs.find(l => l.accountCode === '331')?.amount).toBe(4_000_000)
    expect(legs.find(l => l.accountCode === '431')?.amount).toBe(6_000_000)
    expect(legs.find(l => l.accountCode === '500')?.amount).toBe(10_000_000)
  })

  test('geriye uyumluluk: accountBalances verilmezse 331 → 500 (eski davranış)', () => {
    const bc = { sector: 'TRADE', horizon: 'medium', analysis: {}, amount: 3_000_000, previousActions: [] } as unknown as ActionBuildContext
    const legs = A15.buildTransactions(bc)[0].legs
    expect(legs.find(l => l.accountCode === '331')?.amount).toBe(3_000_000)
    expect(legs.find(l => l.accountCode === '500')?.amount).toBe(3_000_000)
  })
})
