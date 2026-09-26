import { annualizationFactor, annualizeFlows } from '../ratioInput'

describe('annualization — ara dönem akışları 12 aya tamamlanır', () => {
  test('katsayılar: Q1 ×4, Q2 ×2, Q3 ×12/9, Q4 ve ANNUAL ×1', () => {
    expect(annualizationFactor('Q1')).toBe(4)
    expect(annualizationFactor('Q2')).toBe(2)
    expect(annualizationFactor('Q3')).toBeCloseTo(12 / 9, 10)
    expect(annualizationFactor('Q4')).toBe(1)
    expect(annualizationFactor('ANNUAL')).toBe(1)
  })

  test('Q2: akış kalemleri ×2, bilanço kalemleri değişmez', () => {
    const out = annualizeFlows({ revenue: 275_036_322.99, netProfit: 1_388_025.54, ebitda: 2_518_105.56, cash: 751_080.29, totalAssets: 52_475_095.57, taxExpense: null }, 'Q2')
    expect(out.revenue).toBeCloseTo(550_072_645.98, 2)
    expect(out.netProfit).toBeCloseTo(2_776_051.08, 2)
    expect(out.ebitda).toBeCloseTo(5_036_211.12, 2)
    expect(out.cash).toBe(751_080.29)
    expect(out.totalAssets).toBe(52_475_095.57)
    expect(out.taxExpense).toBeNull()
  })

  test('ANNUAL: aynı nesne döner, hiçbir değer değişmez', () => {
    const src = { revenue: 100, cash: 5 }
    expect(annualizeFlows(src, 'ANNUAL')).toBe(src)
  })
})
