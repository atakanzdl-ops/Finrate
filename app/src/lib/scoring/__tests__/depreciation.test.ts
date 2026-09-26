import { deriveDepreciation } from '../depreciation'

describe('deriveDepreciation — Δ(257+268) önceki döneme göre', () => {
  test('Tekno 2025→2026 Q2: 257 446.122,43 → 1.113.527,27 = 667.404,84', () => {
    const prev = [{ accountCode: '257', amount: 446122.43 }, { accountCode: '253', amount: 0 }]
    const curr = [{ accountCode: '257', amount: 1113527.27 }, { accountCode: '253', amount: 11618833.34 }]
    expect(deriveDepreciation(prev, curr)).toBeCloseTo(667404.84, 2)
  })

  test('257 + 268 birlikte toplanır', () => {
    const prev = [{ accountCode: '257', amount: 100 }, { accountCode: '268', amount: 50 }]
    const curr = [{ accountCode: '257', amount: 160 }, { accountCode: '268', amount: 70 }]
    expect(deriveDepreciation(prev, curr)).toBe(80)
  })

  test('önceki dönemde amortisman hesabı yoksa null', () => {
    expect(deriveDepreciation([{ accountCode: '253', amount: 10 }], [{ accountCode: '257', amount: 5 }])).toBeNull()
  })

  test('cari dönemde amortisman hesabı yoksa null', () => {
    expect(deriveDepreciation([{ accountCode: '257', amount: 5 }], [{ accountCode: '253', amount: 10 }])).toBeNull()
  })

  test('azalış (duran varlık çıkışı) → null, sıfır yazılmaz', () => {
    expect(deriveDepreciation([{ accountCode: '257', amount: 500 }], [{ accountCode: '257', amount: 300 }])).toBeNull()
  })

  test('parser rawAccounts şekli ({code, amount}) de kabul edilir', () => {
    expect(deriveDepreciation([{ code: '257', amount: '100' }], [{ code: '257', amount: '250' }])).toBe(150)
  })
})
