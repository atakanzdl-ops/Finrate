import { ACCOUNT_FIELD, applyAccountDelta, parentTotals } from '../accountFieldMap'
import { TDHP_GROUPS } from '../chart'

describe('accountFieldMap — hesap → alan eşlemesi', () => {
  test('hesap planındaki her hesabın (690/692 hariç) bir hedef alanı var', () => {
    const missing = TDHP_GROUPS.flatMap(g => g.accounts)
      .map(a => a.code)
      .filter(c => !['690', '692'].includes(c) && !ACCOUNT_FIELD[c])
    expect(missing).toEqual([])
  })

  test('331 ve 431 Ortaklara Borçlar yabancı kaynaktır, özkaynak değil', () => {
    expect(ACCOUNT_FIELD['331']).toEqual({ field: 'otherShortTermPayables', sign: 1 })
    expect(ACCOUNT_FIELD['431']).toEqual({ field: 'longTermOtherPayables', sign: 1 })
    expect(parentTotals('longTermOtherPayables').map(([f]) => f)).toEqual(['totalNonCurrentLiabilities', 'totalLiabilitiesAndEquity'])
    expect(parentTotals('otherShortTermPayables').map(([f]) => f)).not.toContain('totalEquity')
  })

  test('kontra hesaplar eksi işaretli (257, 129, 501, 103)', () => {
    for (const c of ['257', '129', '501', '103', '122', '268', '302']) {
      expect(ACCOUNT_FIELD[c].sign).toBe(-1)
    }
  })
})

describe('applyAccountDelta — sadece ilgili alan ve dolu üst toplamlar değişir', () => {
  const base = {
    cash: 18_575_930.29, tradeReceivables: 5_285_594.64, inventory: 15_000_639.77,
    totalCurrentAssets: 41_105_157.62, totalAssets: 52_475_095.57,
    tangibleAssets: 11_369_937.95, totalNonCurrentAssets: 11_369_937.95,
    longTermOtherPayables: 0, totalNonCurrentLiabilities: 24_000_000, totalLiabilitiesAndEquity: 52_475_095.57,
    totalEquity: 27_185_639.89, paidInCapital: 15_115_539,
    revenue: 275_036_322.99, grossProfit: 12_137_733.26, ebit: 1_850_700.72, ebt: 1_850_700.72, netProfit: 1_850_700.72,
    cogs: 262_898_589.73, taxExpense: null as number | null,
  }

  test('101 Alınan Çekler 1.000 artınca cash, dönen varlık ve aktif toplam 1.000 artar; başka alan değişmez', () => {
    const ch = applyAccountDelta(base, '101', 1000)
    expect(ch).toEqual({
      cash: base.cash + 1000,
      totalCurrentAssets: base.totalCurrentAssets + 1000,
      totalAssets: base.totalAssets + 1000,
    })
  })

  test('257 Birikmiş Amortisman 500 artınca MDV, duran varlık ve aktif 500 AZALIR', () => {
    const ch = applyAccountDelta(base, '257', 500)
    expect(ch.tangibleAssets).toBeCloseTo(base.tangibleAssets - 500, 2)
    expect(ch.totalNonCurrentAssets).toBeCloseTo(base.totalNonCurrentAssets - 500, 2)
    expect(ch.totalAssets).toBeCloseTo(base.totalAssets - 500, 2)
    expect(ch.totalEquity).toBeUndefined()
  })

  test('431 Ortaklara Borçlar artınca UV yabancı kaynak ve pasif toplam artar, özkaynak değişmez', () => {
    const ch = applyAccountDelta(base, '431', 24_000_000)
    expect(ch.longTermOtherPayables).toBe(24_000_000)
    expect(ch.totalNonCurrentLiabilities).toBe(48_000_000)
    expect(ch.totalLiabilitiesAndEquity).toBeCloseTo(base.totalLiabilitiesAndEquity + 24_000_000, 2)
    expect(ch.totalEquity).toBeUndefined()
    expect(ch.paidInCapital).toBeUndefined()
  })

  test('boş (null) üst toplam boş kalır: taxExpense null iken 691 girişi sadece taxExpense ve netProfit değiştirir', () => {
    const ch = applyAccountDelta(base, '691', 462_675.18)
    expect(ch.taxExpense).toBeCloseTo(462_675.18, 2)
    expect(ch.netProfit).toBeCloseTo(base.netProfit - 462_675.18, 2)
    expect(ch.ebt).toBeUndefined()
  })

  test('621 Satılan Ticari Mallar Maliyeti artınca brüt kar, faaliyet karı, VÖK ve net kar azalır; ciro değişmez', () => {
    const ch = applyAccountDelta(base, '621', 100)
    expect(ch.cogs).toBeCloseTo(base.cogs + 100, 2)
    expect(ch.grossProfit).toBeCloseTo(base.grossProfit - 100, 2)
    expect(ch.ebit).toBeCloseTo(base.ebit - 100, 2)
    expect(ch.netProfit).toBeCloseTo(base.netProfit - 100, 2)
    expect(ch.revenue).toBeUndefined()
  })

  test('delta 0 veya bilinmeyen kod → değişiklik yok', () => {
    expect(applyAccountDelta(base, '101', 0)).toEqual({})
    expect(applyAccountDelta(base, '999', 5)).toEqual({})
  })
})
