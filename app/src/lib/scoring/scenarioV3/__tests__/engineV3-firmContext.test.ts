import { buildIncomeStatementDeltas } from '../engineV3'
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
