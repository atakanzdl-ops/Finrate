/**
 * R12.1 — ratioCategoryRegistry Unit Testleri
 *
 * findWeakestRatioPerCategory + getCoverageActionIdsForRatio temel davranışlarını doğrular.
 *
 * Fixture: ISRA benzeri TRADE sektörü profili.
 * Benchmark: Toptan Ticaret (TRADE → 'Toptan Ticaret')
 *
 * Test senaryoları:
 *   T1 — Tüm rasyolar benchmark üstünde → weakMap boş
 *   T2 — Likidite zayıf (currentRatio düşük) → liquidity key dolu
 *   T3 — Kaldıraç zayıf (debtToEquity yüksek) → leverage key dolu
 *   T4 — Faaliyet zayıf (receivablesTurnoverDays uzun) → activity key dolu
 *   T5 — Çoklu zayıf → birden fazla kategori
 *   T6 — getCoverageActionIdsForRatio: debtToEquity → A10 kalite sıralı
 *   T7 — getCoverageActionIdsForRatio: receivablesTurnoverDays → A05
 *   T8 — null rasyo değerleri atlanır
 *   T9 — En zayıf oran seçimi: logGap bazlı (büyük sapma önce)
 */

import {
  findWeakestRatioPerCategory,
  getCoverageActionIdsForRatio,
  RATIO_TO_RESULT_GROUP,
  getResultGroupCandidates,
} from '../ratioCategoryRegistry'
import type { RatioResult }    from '../../ratios'
import type { SectorBenchmark } from '../../benchmarks'

// ─── Toptan Ticaret benchmark (benchmarks.ts'den kopyalandı) ─────────────────

const TRADE_BENCHMARK: SectorBenchmark = {
  label: 'Toptan Ticaret',
  currentRatio: 1.56,  quickRatio: 0.88,
  cashRatio: 0.14,     netWorkingCapitalRatio: 0.14,  cashConversionCycle: 57,
  grossMargin: 0.14,   ebitdaMargin: 0.05,  ebitMargin: 0.038,
  netProfitMargin: 0.014, roa: 0.019,        roe: 0.048,
  roic: 0.075,         revenueGrowth: 0.40,
  debtToEquity: 1.51,  debtToAssets: 0.60,
  shortTermDebtRatio: 0.65, debtToEbitda: 3.2, interestCoverage: 4.72,
  assetTurnover: 1.66, receivablesDays: 37,  inventoryDays: 60,
  payablesTurnoverDays: 40, fixedAssetTurnover: 5.50, operatingExpenseRatio: 0.105,
  financialExpenseRatio: 0.03,
}

// ─── Yardımcı: tam benchmark üstü rasyo seti ─────────────────────────────────

function strongRatios(): Partial<RatioResult> {
  return {
    // Likidite — benchmark üstünde
    currentRatio:            2.0,    // > 1.56 ✓
    quickRatio:              1.2,    // > 0.88 ✓
    cashRatio:               0.25,   // > 0.14 ✓
    netWorkingCapitalRatio:  0.20,   // > 0.14 ✓
    cashConversionCycle:     45,     // < 57   ✓
    // Kârlılık — benchmark üstünde
    grossMargin:             0.29,   // > 0.14 ✓
    ebitdaMargin:            0.08,   // > 0.05 ✓
    ebitMargin:              0.06,   // > 0.038 ✓
    netProfitMargin:         0.056,  // > 0.014 ✓
    roa:                     0.05,   // > 0.019 ✓
    roe:                     0.10,   // > 0.048 ✓
    roic:                    0.12,   // > 0.075 ✓
    revenueGrowth:           0.50,   // > 0.40 ✓
    // Kaldıraç — benchmark üstünde
    debtToEquity:            1.0,    // < 1.51 ✓ (düşük = iyi)
    debtToAssets:            0.50,   // < 0.60 ✓
    shortTermDebtRatio:      0.55,   // < 0.65 ✓
    debtToEbitda:            2.5,    // < 3.2  ✓
    interestCoverage:        6.0,    // > 4.72 ✓
    // Faaliyet — benchmark üstünde
    assetTurnover:           2.0,    // > 1.66 ✓
    receivablesTurnoverDays: 30,     // < 37   ✓ (düşük = iyi)
    inventoryTurnoverDays:   50,     // < 60   ✓
    payablesTurnoverDays:    45,     // > 40   ✓ (yüksek = iyi)
    fixedAssetTurnover:      6.0,    // > 5.50 ✓
    operatingExpenseRatio:   0.09,   // < 0.105 ✓
  }
}

// ─── T1: Tüm rasyolar güçlü → weakMap boş ────────────────────────────────────

test('T1 — Tüm rasyolar benchmark üstünde → weakMap boş', () => {
  const weak = findWeakestRatioPerCategory(strongRatios(), TRADE_BENCHMARK)
  expect(Object.keys(weak)).toHaveLength(0)
})

// ─── T2: Likidite zayıf (currentRatio düşük) ─────────────────────────────────

test('T2 — currentRatio < benchmark → liquidity zayıf', () => {
  const ratios = { ...strongRatios(), currentRatio: 1.0 }  // < 1.56
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)

  expect(weak.liquidity).toBeDefined()
  expect(weak.liquidity!.isWeak).toBe(true)
  expect(weak.liquidity!.current).toBe(1.0)
  expect(weak.liquidity!.benchmark).toBe(1.56)
  expect(weak.profitability).toBeUndefined()
  expect(weak.leverage).toBeUndefined()
  expect(weak.activity).toBeUndefined()
})

// ─── T3: Kaldıraç zayıf (debtToEquity yüksek — direction=lower) ──────────────

test('T3 — debtToEquity > benchmark → leverage zayıf', () => {
  const ratios = { ...strongRatios(), debtToEquity: 3.0 }  // > 1.51
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)

  expect(weak.leverage).toBeDefined()
  expect(weak.leverage!.ratioField).toBe('debtToEquity')
  expect(weak.leverage!.direction).toBe('lower')
  expect(weak.leverage!.isWeak).toBe(true)
  expect(weak.liquidity).toBeUndefined()
  expect(weak.activity).toBeUndefined()
})

// ─── T4: Faaliyet zayıf (receivablesTurnoverDays uzun) ───────────────────────

test('T4 — receivablesTurnoverDays > benchmark → activity zayıf', () => {
  const ratios = { ...strongRatios(), receivablesTurnoverDays: 97 }  // > 37
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)

  expect(weak.activity).toBeDefined()
  expect(weak.activity!.ratioField).toBe('receivablesTurnoverDays')
  expect(weak.activity!.benchmarkField).toBe('receivablesDays')
  expect(weak.activity!.direction).toBe('lower')
})

// ─── T5: Çoklu zayıf kategori ────────────────────────────────────────────────

test('T5 — Likidite + Kaldıraç + Faaliyet zayıf → 3 kategori', () => {
  const ratios = {
    ...strongRatios(),
    currentRatio:            1.0,   // liquidity zayıf
    debtToEquity:            3.5,   // leverage zayıf
    receivablesTurnoverDays: 90,    // activity zayıf
  }
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)

  expect(weak.liquidity).toBeDefined()
  expect(weak.leverage).toBeDefined()
  expect(weak.activity).toBeDefined()
  expect(weak.profitability).toBeUndefined()
})

// ─── T6: getCoverageActionIdsForRatio — kalite sıralı dinamik eşleşme ────────

test('T6 — getCoverageActionIdsForRatio: debtToEquity → A10 kalite sıralı döner', () => {
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const catalog = Object.values(ACTION_CATALOG_V3) as any[]

  const actions = getCoverageActionIdsForRatio('debtToEquity', catalog)

  // DEBT_TO_EQUITY metric'li aksiyonlar: A10 (1.00) > A10B (0.55) > A15 (0.40)
  expect(actions.length).toBeGreaterThan(0)
  expect(actions[0]).toBe('A10_CASH_EQUITY_INJECTION')  // en yüksek kalite
  // Tüm dönen aksiyonlar DEBT_TO_EQUITY hedefli
  for (const id of actions) {
    const action = ACTION_CATALOG_V3[id]
    expect(action?.targetRatio?.metric).toBe('DEBT_TO_EQUITY')
  }
})

// ─── T7: getCoverageActionIdsForRatio — DSO aksiyonu tespiti ─────────────────

test('T7 — getCoverageActionIdsForRatio: receivablesTurnoverDays → A05 döner', () => {
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const catalog = Object.values(ACTION_CATALOG_V3) as any[]

  const actions = getCoverageActionIdsForRatio('receivablesTurnoverDays', catalog)

  expect(actions.length).toBeGreaterThan(0)
  expect(actions[0]).toBe('A05_RECEIVABLE_COLLECTION')
  expect(ACTION_CATALOG_V3['A05_RECEIVABLE_COLLECTION']?.targetRatio?.metric).toBe('DSO')
})

// ─── T8: null rasyo değerleri atlanır ────────────────────────────────────────

test('T8 — null rasyo değerleri sessizce atlanır', () => {
  const ratios: Partial<RatioResult> = {
    currentRatio: null,
    quickRatio:   null,
    cashRatio:    null,
  }
  // Null değerler → benchmark karşılaştırması yapılamaz → weakMap boş
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)
  expect(weak.liquidity).toBeUndefined()
})

// ─── T9: En zayıf oran seçimi — logGap bazlı ─────────────────────────────────

test('T9 — logGap bazlı: daha büyük sapmalı oran seçilir', () => {
  // cashRatio: 0.02 (benchmark 0.14) → logGap = |log(0.02/0.14)| ≈ 1.95
  // currentRatio: 1.4 (benchmark 1.56) → logGap = |log(1.4/1.56)| ≈ 0.11
  // cashRatio daha zayıf → seçilmeli
  const ratios = {
    ...strongRatios(),
    currentRatio: 1.4,    // hafif zayıf
    cashRatio:    0.02,   // çok zayıf
  }
  const weak = findWeakestRatioPerCategory(ratios, TRADE_BENCHMARK)

  expect(weak.liquidity).toBeDefined()
  expect(weak.liquidity!.ratioField).toBe('cashRatio')   // daha büyük logGap
  expect(weak.liquidity!.logGap).toBeGreaterThan(1.0)
})

// ─── R12.1-FIX2: 3 Grup Coverage testleri ────────────────────────────────────

describe('R12.1-FIX2: Sonuç rasyoları 3 grup coverage', () => {

  // T_FIX2_1: Likidite sonuç rasyosu → LIQUIDITY_RESULT grubu
  test('T_FIX2_1: cashRatio LIQUIDITY_RESULT grubuna bağlanır', () => {
    expect(RATIO_TO_RESULT_GROUP.cashRatio).toBe('LIQUIDITY_RESULT')
    const candidates = getResultGroupCandidates('cashRatio')
    // En güçlü etki: dış nakit → pay direkt artar
    expect(candidates[0]).toBe('A10_CASH_EQUITY_INJECTION')
    // A04 matematik: oran düşer → listede OLMAMALI
    expect(candidates).not.toContain('A04_CASH_PAYDOWN_ST')
  })

  // T_FIX2_2: Kârlılık sonuç rasyosu → PROFIT_RESULT grubu
  test('T_FIX2_2: roic PROFIT_RESULT grubuna bağlanır', () => {
    expect(RATIO_TO_RESULT_GROUP.roic).toBe('PROFIT_RESULT')
    const candidates = getResultGroupCandidates('roic')
    expect(candidates[0]).toBe('A12_GROSS_MARGIN_IMPROVEMENT')
    // A14 A13'ten önce: A13 kodda devre dışı (customCheck:false), sona alındı
    expect(candidates.indexOf('A14_FINANCE_COST_REDUCTION'))
      .toBeLessThan(candidates.indexOf('A13_OPEX_OPTIMIZATION'))
  })

  // T_FIX2_3: Sermaye sonuç rasyosu → CAPITAL_RESULT, A01/A02/A03 yok
  test('T_FIX2_3: debtToEbitda CAPITAL_RESULT, A01/A02/A03 yok (matematik 0)', () => {
    // equityRatio RATIO_SPEC'te yok → findWeakRatios atlar → tetiklenmez
    // debtToEbitda RATIO_SPEC'te VAR → coverage tetiklenir
    expect(RATIO_TO_RESULT_GROUP.debtToEbitda).toBe('CAPITAL_RESULT')
    const candidates = getResultGroupCandidates('debtToEbitda')
    // KV→UV reclass equityRatio/debtToEbitda etkisi sıfır → listede OLMAMALI
    expect(candidates).not.toContain('A01_ST_FIN_DEBT_TO_LT')
    expect(candidates).not.toContain('A02_TRADE_PAYABLE_TO_LT')
    expect(candidates).not.toContain('A03_ADVANCE_TO_LT')
    // A21 dahil: EBITDA artışı → debtToEbitda direkt düşer
    expect(candidates).toContain('A21_OPERATING_PROFIT_REFORM')
    // equityRatio listede ama tetiklenmez (zararsız)
    expect(RATIO_TO_RESULT_GROUP.equityRatio).toBe('CAPITAL_RESULT')
  })

  // T_FIX2_4: Girdi rasyoları grup haritasında YOK
  test('T_FIX2_4: Girdi rasyoları grup haritasında YOK', () => {
    // Bu rasyolar RATIO_FIELD_TO_METRIC üzerinden kapsanır → ayrıca grup yok
    expect(RATIO_TO_RESULT_GROUP.receivablesTurnoverDays).toBeUndefined()
    expect(RATIO_TO_RESULT_GROUP.inventoryTurnoverDays).toBeUndefined()
    expect(RATIO_TO_RESULT_GROUP.grossMargin).toBeUndefined()
    expect(RATIO_TO_RESULT_GROUP.debtToEquity).toBeUndefined()
    expect(getResultGroupCandidates('grossMargin')).toEqual([])
  })
})
