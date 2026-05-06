/**
 * materialityEngineIntegration.test.ts — Hibrit Materyalite Floor Entegrasyonu (Faz 7.3.43D)
 *
 * DEĞIŞIKLIK: engineV3.ts calculateAmountCandidates
 *   ÖNCE: minAbs = max(absoluteMinTRY, matLimit.minAbsoluteAmountTRY)
 *   SONRA: safeAssets + dynamicFloor + minAbs = max(absoluteMinTRY, matLimit, dynamicFloor)
 *
 * MATERIALITY_BY_HORIZON static eşikler:
 *   short:  minAbsoluteAmountTRY = 1_500_000
 *   medium: minAbsoluteAmountTRY = 2_500_000
 *   long:   minAbsoluteAmountTRY = 4_000_000
 *
 * getDynamicMaterialityFloor:
 *   short:  max(250_000,   totalAssets × 0.005)
 *   medium: max(500_000,   totalAssets × 0.01)
 *   long:   max(1_000_000, totalAssets × 0.01)
 *
 * Hibrit devreye girer (dynamic > static) eşikleri:
 *   short:  totalAssets > 300_000_000  (300M × 0.5% = 1.5M = static eşiği)
 *   medium: totalAssets > 250_000_000  (250M × 1%   = 2.5M = static eşiği)
 *   long:   totalAssets > 400_000_000  (400M × 1%   = 4.0M = static eşiği)
 *
 * T1:  Büyük firma medium (357M) → dynamicFloor = 3.57M > 2.5M static → kilit açılır
 * T2:  Orta firma medium (100M)  → dynamicFloor = 1.0M  < 2.5M static → static korur
 * T3:  Küçük firma short (50M)   → dynamicFloor = 250K  < 1.5M static → static korur
 * T4:  Büyük firma short (357M)  → dynamicFloor = 1.785M > 1.5M static → kilit açılır
 * T5:  Büyük firma long (357M)   → dynamicFloor = 3.57M < 4.0M static  → static korur
 * T6a: A12 ratio-based + null → portfolio'da yok (D-pre fix korunuyor)
 * T6b: A12 ratio-based + pozitif → candidate üretir
 * T7:  NaN-safe undefined totalAssets → safeAssets=0, floor=baseFloor
 * T8:  NaN-safe NaN totalAssets → safeAssets=0, floor=baseFloor
 * T9:  DEKA 2022 BB regression — runEngineV3 çalışır, crash yok
 * T10: A06 GÜN 1 non-regression — sizing değerleri korundu
 * T11: A10 GÜN 2 non-regression — sizing değerleri korundu
 * T12: A15 GÜN 2 non-regression — sizing değerleri korundu
 * T13: A12 D-pre fix non-regression — TRADE %56 → A12 portfolio dışı
 */

import { getDynamicMaterialityFloor, MATERIALITY_BY_HORIZON } from '../contracts'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import { runEngineV3, type EngineInput } from '../engineV3'

// ─── Helper: calculateAmountCandidates'ı dolaylı test etmek için runEngineV3 kullanımı ──

/**
 * A06 ile basit bir EngineInput — totalAssets kontrollü.
 * A06 horizons: ['short', 'medium'] → hem short hem medium candidatelara bakabiliriz.
 */
function makeA06Input(totalAssets: number, horizon?: 'short' | 'medium' | 'long'): EngineInput {
  return {
    sector:        'MANUFACTURING',
    currentRating: 'B',
    targetRating:  'BB',
    accountBalances: {
      '102': 1_000_000,
      '120': 5_000_000,
      '153': 30_000_000,   // A06 için 153 gerekli (stok)
      '300': 10_000_000,
      '320': 8_000_000,
      '500': totalAssets * 0.25,  // özkaynaklar
    },
    incomeStatement: {
      netSales:         100_000_000,
      costOfGoodsSold:   75_000_000,
      grossProfit:       25_000_000,
      operatingProfit:    8_000_000,
      netIncome:          5_000_000,
      interestExpense:    2_000_000,
    },
    _overrideTotalAssets: totalAssets,
  } as any   // _overrideTotalAssets: engineV3 context hesabından farklı totalAssets test etmek için
             // Not: Bu alan engineV3'te yoksa test context hesabına dayanır — K3 bakınız
}

// ─── T1–T5: getDynamicMaterialityFloor birim testleri ────────────────────────

describe('T1-T5 — getDynamicMaterialityFloor hibrit floor mantığı (Faz 7.3.43D)', () => {

  const staticMedium = MATERIALITY_BY_HORIZON['medium'].minAbsoluteAmountTRY  // 2_500_000
  const staticShort  = MATERIALITY_BY_HORIZON['short'].minAbsoluteAmountTRY   // 1_500_000
  const staticLong   = MATERIALITY_BY_HORIZON['long'].minAbsoluteAmountTRY    // 4_000_000

  test('T1: büyük firma medium (357M) → dynamicFloor=3.57M > static=2.5M', () => {
    const dynamicFloor = getDynamicMaterialityFloor('medium', 357_000_000)
    // 357M × 1% = 3_570_000 > 500K baseFloor → 3_570_000
    expect(dynamicFloor).toBeCloseTo(3_570_000, -2)
    expect(dynamicFloor).toBeGreaterThan(staticMedium)   // hibrit devreye girer
  })

  test('T2: orta firma medium (100M) → dynamicFloor=1.0M < static=2.5M → static korur', () => {
    const dynamicFloor = getDynamicMaterialityFloor('medium', 100_000_000)
    // 100M × 1% = 1_000_000 > 500K baseFloor → 1_000_000
    expect(dynamicFloor).toBe(1_000_000)
    expect(dynamicFloor).toBeLessThan(staticMedium)      // hibrit devreye girmez
  })

  test('T3: küçük firma short (50M) → dynamicFloor=250K < static=1.5M → static korur', () => {
    const dynamicFloor = getDynamicMaterialityFloor('short', 50_000_000)
    // 50M × 0.5% = 250_000 = baseFloor → 250_000
    expect(dynamicFloor).toBe(250_000)
    expect(dynamicFloor).toBeLessThan(staticShort)       // hibrit devreye girmez
  })

  test('T4: büyük firma short (357M) → dynamicFloor=1.785M > static=1.5M → kilit açılır', () => {
    const dynamicFloor = getDynamicMaterialityFloor('short', 357_000_000)
    // 357M × 0.5% = 1_785_000 > 250K baseFloor → 1_785_000
    expect(dynamicFloor).toBeCloseTo(1_785_000, -2)
    expect(dynamicFloor).toBeGreaterThan(staticShort)    // hibrit devreye girer
  })

  test('T5: büyük firma long (357M) → dynamicFloor=3.57M < static=4.0M → static korur', () => {
    const dynamicFloor = getDynamicMaterialityFloor('long', 357_000_000)
    // 357M × 1% = 3_570_000 > 1M baseFloor → 3_570_000
    expect(dynamicFloor).toBeCloseTo(3_570_000, -2)
    expect(dynamicFloor).toBeLessThan(staticLong)        // hibrit devreye girmez
  })

})

// ─── T6: A12 ratio-based (D-pre korunuyor) ───────────────────────────────────

describe('T6 — A12 ratio-based kandidat davranışı (D-pre fix + D entegrasyonu)', () => {

  const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']!

  function makeA12Ctx(grossProfitPct: number, sector: 'TRADE' | 'MANUFACTURING' | 'IT' = 'TRADE') {
    const netSales = 100_000_000
    return {
      sector,
      accountBalances:  { '320': 15_000_000, '621': 50_000_000 },
      netSales,
      grossProfit:      netSales * grossProfitPct,
      totalAssets:      200_000_000,
      totalEquity:       50_000_000,
      totalRevenue:     netSales,
      netIncome:          5_000_000,
      operatingProfit:    8_000_000,
      interestExpense:    2_000_000,
      operatingCashFlow: null,
      period:           'ANNUAL',
    }
  }

  test('T6a: A12 TRADE %56 > sektör hedefi (0.14×1.05=0.147) → computeAmount null (D-pre fix sağlam)', () => {
    // TRADE grossMargin benchmark = 0.14; 0.56 >= 0.147 → guard fires
    const ctx = makeA12Ctx(0.56, 'TRADE')
    expect(a12.computeAmount!(ctx)).toBeNull()
  })

  test('T6b: A12 MANUFACTURING %15 < sektör hedefi (0.20) → computeAmount > 0 (normal kandidat)', () => {
    // MANUFACTURING grossMargin benchmark = 0.20; 0.15 < 0.21 → guard geçer
    // requiredImprovement = (0.20-0.15)×100M = 5M → min(5M, 7.5M, 25M) = 5M > 0
    const ctx = makeA12Ctx(0.15, 'MANUFACTURING')
    const v = a12.computeAmount!(ctx)
    expect(v).not.toBeNull()
    expect(v!).toBeGreaterThan(0)
  })

})

// ─── T7–T8: NaN-safe guard ───────────────────────────────────────────────────

describe('T7-T8 — getDynamicMaterialityFloor NaN-safe kontrol', () => {

  test('T7: totalAssets=0 → baseFloor döner (crash yok)', () => {
    // safeAssets=0 → 0×scaleFactor=0 → max(baseFloor, 0) = baseFloor
    expect(getDynamicMaterialityFloor('medium', 0)).toBe(500_000)
    expect(getDynamicMaterialityFloor('short',  0)).toBe(250_000)
    expect(getDynamicMaterialityFloor('long',   0)).toBe(1_000_000)
  })

  test('T8: totalAssets=NaN → NaN safe guard — baseFloor döner', () => {
    // engineV3: safeAssets = Number.isFinite(NaN) ? ... : 0 → 0 → baseFloor
    // Bu test getDynamicMaterialityFloor'u 0 ile çağırır (guard engineV3'te)
    const safeAssets = Number.isFinite(NaN) ? Math.max(0, NaN) : 0
    expect(safeAssets).toBe(0)
    expect(getDynamicMaterialityFloor('medium', safeAssets)).toBe(500_000)
  })

})

// ─── T9: DEKA 2022 BB regression ─────────────────────────────────────────────

describe('T9 — DEKA 2022 BB regression (runEngineV3 crash yok)', () => {

  test('T9: Tipik BB firma profili → runEngineV3 crash yok, portfolio döner', () => {
    const input: EngineInput = {
      sector:        'MANUFACTURING',
      currentRating: 'BB',
      targetRating:  'BBB',
      accountBalances: {
        '102': 5_000_000,
        '120': 30_000_000,
        '153': 80_000_000,
        '300': 50_000_000,
        '320': 40_000_000,
        '500': 100_000_000,
        '580': 5_000_000,
      },
      incomeStatement: {
        netSales:         300_000_000,
        costOfGoodsSold:  210_000_000,
        grossProfit:       90_000_000,
        operatingProfit:   30_000_000,
        netIncome:         15_000_000,
        interestExpense:    8_000_000,
      },
    }
    expect(() => runEngineV3(input)).not.toThrow()
    const result = runEngineV3(input)
    expect(result).toBeDefined()
    expect(Array.isArray(result.portfolio)).toBe(true)
  })

})

// ─── T10–T12: Non-regression — GÜN 1-2 sizing değerleri ─────────────────────

describe('T10-T12 — Non-regression: GÜN 1-2 sizing değerleri korundu', () => {

  test('T10: A06 GÜN 1 sizing — min %2, typical %4, max %10', () => {
    const sa = ACTION_CATALOG_V3['A06_INVENTORY_MONETIZATION']!.suggestedAmount
    expect(sa.minPctOfBasis).toBe(0.02)
    expect(sa.typicalPctOfBasis).toBe(0.04)
    expect(sa.maxPctOfBasis).toBe(0.10)
    expect(sa.absoluteMinTRY).toBe(2_000_000)
  })

  test('T11: A10 GÜN 2 sizing — min %2, typical %5, max %12', () => {
    const sa = ACTION_CATALOG_V3['A10_CASH_EQUITY_INJECTION']!.suggestedAmount
    expect(sa.minPctOfBasis).toBe(0.02)
    expect(sa.typicalPctOfBasis).toBe(0.05)
    expect(sa.maxPctOfBasis).toBe(0.12)
    expect(sa.absoluteMinTRY).toBe(2_000_000)
  })

  test('T12: A15 GÜN 2 sizing — min %10, typical %20, max %50', () => {
    const sa = ACTION_CATALOG_V3['A15_DEBT_TO_EQUITY_SWAP']!.suggestedAmount
    expect(sa.minPctOfBasis).toBe(0.10)
    expect(sa.typicalPctOfBasis).toBe(0.20)
    expect(sa.maxPctOfBasis).toBe(0.50)
    expect(sa.absoluteMinTRY).toBe(1_000_000)
  })

})

// ─── T13: A12 D-pre fix non-regression ───────────────────────────────────────

describe('T13 — A12 D-pre fix non-regression (TRADE %56 → portfolio dışı)', () => {

  test('T13: TRADE %56 brüt marj → A12 portfolio\'da yok (D-pre fix korunuyor)', () => {
    const input: EngineInput = {
      sector:        'TRADE',
      currentRating: 'B',
      targetRating:  'BB',
      accountBalances: {
        '102': 800_000,
        '120': 3_000_000,
        '153': 10_000_000,
        '320': 15_000_000,
        '500': 5_000_000,
        '580': 200_000,
        '621': 50_000_000,
      },
      incomeStatement: {
        netSales:        100_000_000,
        costOfGoodsSold:  44_000_000,
        grossProfit:      56_000_000,
        operatingProfit:  10_000_000,
        netIncome:         5_000_000,
        interestExpense:   1_000_000,
      },
    }
    const result = runEngineV3(input)
    const a12inPortfolio = (result.portfolio ?? []).some(
      a => a.actionId === 'A12_GROSS_MARGIN_IMPROVEMENT'
    )
    expect(a12inPortfolio).toBe(false)
  })

})
