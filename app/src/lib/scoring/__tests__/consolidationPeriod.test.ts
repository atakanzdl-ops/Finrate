import {
  periodOrderNum, pickScoringPeriod, selectForPeriod, annualizeAggregated, periodLabel,
} from '../consolidationPeriod'
import type { AggregatedFinancials } from '../consolidation'

describe('periodOrderNum', () => {
  it('ANNUAL aynı yılın ara dönemlerinden sonra gelir (sözlük sırası değil)', () => {
    expect(periodOrderNum(2025, 'ANNUAL')).toBeGreaterThan(periodOrderNum(2025, 'Q3'))
    expect(periodOrderNum(2025, 'Q1')).toBeGreaterThan(periodOrderNum(2024, 'ANNUAL'))
  })
})

describe('pickScoringPeriod', () => {
  it('tüm şirketlerin ortak sahip olduğu en son dönemi seçer', () => {
    const m = new Map([
      ['A', [{ year: 2024, period: 'ANNUAL' }, { year: 2025, period: 'ANNUAL' }]],
      ['B', [{ year: 2024, period: 'ANNUAL' }, { year: 2025, period: 'Q2' }]],
    ])
    expect(pickScoringPeriod(m)).toEqual({ year: 2024, period: 'ANNUAL' })
  })

  it('ortak dönem yoksa genel en son dönemi seçer', () => {
    const m = new Map([
      ['A', [{ year: 2025, period: 'ANNUAL' }]],
      ['B', [{ year: 2024, period: 'Q3' }]],
    ])
    expect(pickScoringPeriod(m)).toEqual({ year: 2025, period: 'ANNUAL' })
  })

  it('veri yoksa null', () => {
    expect(pickScoringPeriod(new Map([['A', []]]))).toBeNull()
  })
})

describe('selectForPeriod', () => {
  const items = [
    { year: 2023, period: 'ANNUAL', id: 'a23' },
    { year: 2024, period: 'Q2',     id: 'a24q2' },
    { year: 2025, period: 'ANNUAL', id: 'a25' },
  ]
  it('tam eşleşme', () => {
    expect(selectForPeriod(items, { year: 2025, period: 'ANNUAL' })).toEqual({ item: items[2], exact: true })
  })
  it('eşleşme yoksa hedeften önceki en son', () => {
    expect(selectForPeriod(items, { year: 2024, period: 'ANNUAL' })).toEqual({ item: items[1], exact: false })
  })
  it('hedeften önce veri yoksa null', () => {
    expect(selectForPeriod(items, { year: 2022, period: 'ANNUAL' })).toBeNull()
  })
})

describe('annualizeAggregated', () => {
  const base: AggregatedFinancials = {
    totalAssets: 1000, totalCurrentAssets: 600, totalNonCurrentAssets: 400,
    totalCurrentLiabilities: 300, totalNonCurrentLiabilities: 200, totalDebt: 500,
    shortTermFinancialDebt: 100, longTermFinancialDebt: 150, totalEquity: 500, totalLiabilitiesAndEquity: 1000,
    revenue: 500, cogs: 300, grossProfit: 200, operatingExpenses: 100, ebit: 100, ebitda: 120,
    interestExpense: 10, ebt: 90, netProfit: 70, depreciation: 20,
    minorityInterest: 5, fullyConsolidatedCount: 2, equityMethodCount: 0, excludedCount: 0,
  }
  it('Q2 için akışlar ×2, bilanço aynı', () => {
    const out = annualizeAggregated(base, 'Q2')
    expect(out.revenue).toBe(1000)
    expect(out.netProfit).toBe(140)
    expect(out.totalAssets).toBe(1000)
    expect(out.totalEquity).toBe(500)
  })
  it('ANNUAL için aynı nesne', () => {
    expect(annualizeAggregated(base, 'ANNUAL')).toBe(base)
  })
})

describe('periodLabel', () => {
  it('yıllık → "2025", ara dönem → "2025/Q2"', () => {
    expect(periodLabel({ year: 2025, period: 'ANNUAL' })).toBe('2025')
    expect(periodLabel({ year: 2025, period: 'Q2' })).toBe('2025/Q2')
  })
})
