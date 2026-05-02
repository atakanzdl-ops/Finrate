import { buildIncomeStatementDeltas, runEngineV3 } from '../engineV3'
import type { EngineInput } from '../engineV3'
import type { AccountingTransaction, AccountingLeg, SemanticType } from '../contracts'

function makeTransaction(legs: AccountingLeg[]): AccountingTransaction {
  return {
    transactionId: 'TEST_TX',
    description: 'Test transaction',
    semanticType: 'OPERATIONAL_REVENUE' as SemanticType,
    legs,
  }
}

describe('buildIncomeStatementDeltas', () => {
  test('600 CREDIT increases net sales, gross profit, operating profit, and net income', () => {
    const amount = 1_000_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '120', side: 'DEBIT', amount },
        { accountCode: '600', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: amount,
      grossProfitDelta: amount,
      operatingProfitDelta: amount,
      netIncomeDelta: amount,
    })
  })

  test('621 DEBIT decreases gross profit, operating profit, and net income', () => {
    const amount = 750_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '621', side: 'DEBIT', amount },
        { accountCode: '153', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: -amount,
      operatingProfitDelta: -amount,
      netIncomeDelta: -amount,
    })
  })

  test('621 CREDIT increases gross profit, operating profit, and net income', () => {
    const amount = 500_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '320', side: 'DEBIT', amount },
        { accountCode: '621', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: amount,
      operatingProfitDelta: amount,
      netIncomeDelta: amount,
    })
  })

  test('632 DEBIT decreases operating profit and net income only', () => {
    const amount = 300_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '632', side: 'DEBIT', amount },
        { accountCode: '336', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: 0,
      operatingProfitDelta: -amount,
      netIncomeDelta: -amount,
    })
  })

  test('660 DEBIT decreases net income only', () => {
    const amount = 200_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '660', side: 'DEBIT', amount },
        { accountCode: '381', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: 0,
      operatingProfitDelta: 0,
      netIncomeDelta: -amount,
    })
  })

  test('balance-sheet-only transaction creates no income statement delta', () => {
    const amount = 400_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '102', side: 'DEBIT', amount },
        { accountCode: '120', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: 0,
      operatingProfitDelta: 0,
      netIncomeDelta: 0,
    })
  })

  test('690 result account is intentionally excluded from income statement deltas', () => {
    const amount = 600_000
    const deltas = buildIncomeStatementDeltas([
      makeTransaction([
        { accountCode: '690', side: 'DEBIT', amount },
        { accountCode: '590', side: 'CREDIT', amount },
      ]),
    ])

    expect(deltas).toEqual({
      netSalesDelta: 0,
      grossProfitDelta: 0,
      operatingProfitDelta: 0,
      netIncomeDelta: 0,
    })
  })
})

// ─── Faz 7.3.12-PRE — baseline transparency ──────────────────────────────────
// ratioTransparency.current = aksiyonlar uygulanmadan önceki gerçek firma değeri
// (UI "Bugünkü" etiketi). Greedy seçim workingContext'i ilerletir ancak
// post-processing loop baselineContext'ten yeniden üretir.

// Gerçekçi firma fixture — A10/A18 seçiminin gerçekleşmesi için yeterli büyüklük.
// totalEquity = 10M (500), totalAssets = 20M (102) + 180M (250) = 200M
// netSales = 50M → her iki baseline metrik deterministik.
const BASELINE_INPUT: EngineInput = {
  sector: 'MANUFACTURING',
  currentRating: 'B',
  targetRating:  'BBB',
  accountBalances: {
    '100': 5_000_000,   // Kasa
    '102': 15_000_000,  // Bankalar → cashBalance → currentAssets = 20M
    '120': 30_000_000,  // Ticari Alacaklar → currentAssets
    '153': 20_000_000,  // Ticari Mallar (stok) → currentAssets
    '250': 180_000_000, // Maddi Duran Varlıklar → fixedAssets
    '300': 40_000_000,  // Banka Kredileri KV → liabilities
    '320': 15_000_000,  // Satıcılar → liabilities
    '400': 60_000_000,  // Banka Kredileri UV → liabilities
    '500': 10_000_000,  // Ödenmiş Sermaye → totalEquity
    '570': 85_000_000,  // Geçmiş Yıl Kârları → totalEquity
    '600': 50_000_000,  // Yurt İçi Satışlar → A18 customCheck precondition
  },
  incomeStatement: {
    netSales:          50_000_000,
    costOfGoodsSold:   30_000_000,
    grossProfit:       20_000_000,
    operatingProfit:   10_000_000,
    netIncome:          5_000_000,
    interestExpense:    4_000_000,
    operatingCashFlow:  6_000_000,
  },
}
// cashBalance = 100+102 = 20M, currentAssets = 20M+30M+20M = 70M
// fixedAssets = 180M, totalAssets = 250M
// totalEquity = 500+570 = 95M
// BASELINE A10: current = 95M/250M = 0.38
// BASELINE A18: current = 50M/250M = 0.20

describe('Faz 7.3.12-PRE — baseline transparency', () => {
  test('A10: ratioTransparency.current = baseline özkaynak/aktif (hesaplanan değer)', () => {
    const result = runEngineV3({
      ...BASELINE_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION'] },
    })

    const allActions = result.portfolio
    const a10 = allActions.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    expect(a10).toBeDefined()

    const rt = a10!.ratioTransparency
    expect(rt).toBeDefined()
    expect(rt!.kind).toBe('margin')

    // baseline: totalEquity = 500(10M) + 570(85M) = 95M, totalAssets = 250M
    // current = 95_000_000 / 250_000_000 = 0.38
    const marginRt = rt as import('../contracts').MarginRatioTransparency
    expect(marginRt.current).toBeCloseTo(0.38, 4)
  })

  test('A18: ratioTransparency.current = baseline aktif devir hızı (hesaplanan değer)', () => {
    const result = runEngineV3({
      ...BASELINE_INPUT,
      options: { allowedActionIds: ['A18_NET_SALES_GROWTH'] },
    })

    const allActions = result.portfolio
    const a18 = allActions.find(a => a.actionId === 'A18_NET_SALES_GROWTH')
    expect(a18).toBeDefined()

    const rt = a18!.ratioTransparency
    expect(rt).toBeDefined()
    expect(rt!.kind).toBe('turnover')

    // baseline: netSales = 50M, totalAssets = 250M → 50/250 = 0.20
    const turnoverRt = rt as import('../contracts').TurnoverRatioTransparency
    expect(turnoverRt.current).toBeCloseTo(0.20, 4)
  })

  test('Portfolyo dolu kalır — baseline fix greedy seçimini bozmaz', () => {
    const result = runEngineV3(BASELINE_INPUT)
    expect(result.portfolio.length).toBeGreaterThan(0)
  })

  test('A10 + A18 birlikte: her ikisi de baseline current değerini taşır', () => {
    const result = runEngineV3({
      ...BASELINE_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION', 'A18_NET_SALES_GROWTH'] },
    })

    const allActions = result.portfolio

    const a10 = allActions.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    const a18 = allActions.find(a => a.actionId === 'A18_NET_SALES_GROWTH')

    // En az biri seçilmiş olmalı
    expect(a10 !== undefined || a18 !== undefined).toBe(true)

    if (a10?.ratioTransparency?.kind === 'margin') {
      const marginRt = a10.ratioTransparency as import('../contracts').MarginRatioTransparency
      // baseline current = 0.38 (A10 öncesi değer)
      expect(marginRt.current).toBeCloseTo(0.38, 4)
    }

    if (a18?.ratioTransparency?.kind === 'turnover') {
      const turnoverRt = a18.ratioTransparency as import('../contracts').TurnoverRatioTransparency
      // baseline current = 0.20 (A18 öncesi değer)
      expect(turnoverRt.current).toBeCloseTo(0.20, 4)
    }
  })
})
