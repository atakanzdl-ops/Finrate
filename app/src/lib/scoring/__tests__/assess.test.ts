import { assess, assessStatus, summarizeAssessments } from '../assess'

describe('assess — tek değerlendirme kuralı', () => {
  test('eşikler: ≥1,10 iyi, ≥0,75 uyarı, altı risk (up ve down yönleri)', () => {
    expect(assessStatus(2.5, 2.0, 'up').status).toBe('iyi')
    expect(assessStatus(1.8, 2.0, 'up').status).toBe('uyari')
    expect(assessStatus(1.0, 2.0, 'up').status).toBe('risk')
    expect(assessStatus(0.5, 0.76, 'down').status).toBe('iyi')     // düşük iyi
    expect(assessStatus(0.96, 0.76, 'down').status).toBe('uyari')  // Tekno D/E
    expect(assessStatus(2.0, 0.76, 'down').status).toBe('risk')
    expect(assessStatus(null, 1, 'up').status).toBe('eksik')
  })

  test('faiz karşılama 9999 → uygulanamaz (risk değil)', () => {
    const a = assess('interestCoverage', 9999, 3.5)
    expect(a.status).toBe('na')
    expect(a.sentence).toMatch(/uygulanamaz/i)
  })

  test('net borç / FAVÖK negatif → net nakit; ≥99 → risk', () => {
    expect(assess('debtToEbitda', -7.4, 3).status).toBe('na')
    expect(assess('debtToEbitda', 99, 3).status).toBe('risk')
    expect(assess('debtToEbitda', 2.0, 3).status).toBe('iyi')
  })

  test('aynı değer her yerde aynı hükmü verir (Tekno: cari 31,88 vs 2,29 → iyi; net marj 0,5% vs 4% → risk)', () => {
    expect(assess('currentRatio', 31.88, 2.29).status).toBe('iyi')
    expect(assess('netProfitMargin', 0.005, 0.04).status).toBe('risk')
    expect(assess('debtToEquity', 0.96, 0.76).status).toBe('uyari')
  })

  test('summarizeAssessments: dağılım, en güçlü/en zayıf, uygulanamazlar sayılmaz', () => {
    const s = summarizeAssessments(
      { currentRatio: 31.88, quickRatio: 20, netProfitMargin: 0.005, ebitdaMargin: 0.009, roe: 0.1, debtToEquity: 0.96, debtToEbitda: -7, interestCoverage: 9999, receivablesTurnoverDays: 3.5, inventoryTurnoverDays: 10, assetTurnover: 10.5 },
      { currentRatio: 2.29, quickRatio: 1.5, netProfitMargin: 0.04, ebitdaMargin: 0.12, roe: 0.15, debtToEquity: 0.76, debtToEbitda: 3, interestCoverage: 3.5, receivablesDays: 60, inventoryDays: 45, assetTurnover: 0.32 },
    )
    expect(s.total).toBe(9)
    expect(s.notApplicable).toEqual(['Net borç / FAVÖK', 'Faiz karşılama'])
    expect(s.good + s.warn + s.risk).toBe(9)
    expect(s.strongest.length).toBeLessThanOrEqual(2)
    expect(s.weakest[0]).toMatch(/marj/i)
  })
})
