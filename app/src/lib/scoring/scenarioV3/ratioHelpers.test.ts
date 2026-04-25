import { getCogs, applyFeasibilityCap, detectExtremeDeviation, getPeriodDays, getBenchmarkValue } from './ratioHelpers'

describe('getCogs', () => {
  it('ctx.cogs mevcutsa kullanır', () => {
    expect(getCogs({ cogs: 100, netSales: 200, grossProfit: 100 } as any)).toBe(100)
  })
  it('netSales - grossProfit türetir', () => {
    expect(getCogs({ netSales: 100, grossProfit: 30 } as any)).toBe(70)
  })
  it('netSales === grossProfit → null', () => {
    expect(getCogs({ netSales: 100, grossProfit: 100 } as any)).toBeNull()
  })
  it('netSales 0 → null', () => {
    expect(getCogs({ netSales: 0, grossProfit: 30 } as any)).toBeNull()
  })
})

describe('applyFeasibilityCap', () => {
  it('desired > max → max döner', () => {
    expect(applyFeasibilityCap(100, 50, 0.25)).toBe(25)
  })
  it('desired < max → desired döner', () => {
    expect(applyFeasibilityCap(100, 80, 0.25)).toBe(20)
  })
  it('target > current → 0', () => {
    expect(applyFeasibilityCap(100, 120, 0.25)).toBe(0)
  })
  it('current 0 → 0', () => {
    expect(applyFeasibilityCap(0, 50, 0.25)).toBe(0)
  })
  it('target 0 → min(25, 100) = 25', () => {
    expect(applyFeasibilityCap(100, 0, 0.25)).toBe(25)
  })
})

describe('detectExtremeDeviation', () => {
  it('DEKAM A05: ratio 2.6, not extreme', () => {
    const r = detectExtremeDeviation(207, 79)
    expect(r.isExtreme).toBe(false)
    expect(r.severity).toBeCloseTo(2.62, 1)
  })
  it('DEKAM A06: ratio 28, extreme', () => {
    const r = detectExtremeDeviation(2205, 78)
    expect(r.isExtreme).toBe(true)
  })
  it('benchmark 0 → isExtreme false', () => {
    expect(detectExtremeDeviation(100, 0)).toEqual({ isExtreme: false, severity: 0 })
  })
  it('current 0 → isExtreme false', () => {
    expect(detectExtremeDeviation(0, 79)).toEqual({ isExtreme: false, severity: 0 })
  })
  it('eşit değerler → severity 1', () => {
    const r = detectExtremeDeviation(79, 79)
    expect(r.severity).toBe(1)
    expect(r.isExtreme).toBe(false)
  })
})

describe('getPeriodDays', () => {
  it('ANNUAL → 365, source derived', () => {
    const r = getPeriodDays({ period: 'ANNUAL' })
    expect(r.days).toBe(365)
    expect(r.source).toBe('derived')
  })
  it('Q1 → 90, source derived', () => {
    const r = getPeriodDays({ period: 'Q1' })
    expect(r.days).toBe(90)
    expect(r.source).toBe('derived')
  })
  it('periodStart + periodEnd mevcutsa explicit', () => {
    const r = getPeriodDays({ periodStart: '2024-01-01', periodEnd: '2024-12-31' })
    expect(r.source).toBe('explicit')
    expect(r.days).toBeGreaterThan(360)
    expect(r.days).toBeLessThan(370)
  })
  it('period bilinmiyorsa unknown + 365', () => {
    const r = getPeriodDays({ period: 'BILINMIYOR' })
    expect(r.days).toBe(365)
    expect(r.source).toBe('unknown')
  })
  it('null fd → unknown + 365', () => {
    const r = getPeriodDays(null)
    expect(r.days).toBe(365)
    expect(r.source).toBe('unknown')
  })
})

describe('getBenchmarkValue', () => {
  it('inşaat sektörü currentRatio TCMB_DIRECT döner', () => {
    const r = getBenchmarkValue('inşaat', 'currentRatio')
    expect(r).not.toBeNull()
    expect(r!.reliability).toBe('TCMB_DIRECT')
    expect(typeof r!.value).toBe('number')
  })
  it('ebitdaMargin FINRATE_ESTIMATE döner', () => {
    const r = getBenchmarkValue('imalat', 'ebitdaMargin')
    expect(r).not.toBeNull()
    expect(r!.reliability).toBe('FINRATE_ESTIMATE')
  })
  it('bilinmeyen sektör Genel fallback kullanır, null değil', () => {
    const r = getBenchmarkValue('bilinmeyen-sektör-xyz', 'currentRatio')
    expect(r).not.toBeNull()
  })
})
