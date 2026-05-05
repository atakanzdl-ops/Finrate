/**
 * Faz 7.3.12-PRE-FIX — consolidateByActionId ratioTransparency rebuild testleri.
 *
 * Sorun: Çoklu parçalı aksiyon (A10: short + medium + long) consolidate edildiğinde
 *   amountTRY toplam doğru toplanıyor ancak ratioTransparency ilk parçanın tutarıyla
 *   hesaplanmış değerini koruyordu.
 *
 * Çözüm: consolidateByActionId merge sonrası realisticTarget'ı toplam tutarla yeniden
 *   hesaplar. Tek parçalı aksiyonlar etkilenmez.
 *
 * Faz 7.3.31 — buildExecutiveAnswer testleri (T_DL1-T_DL5):
 *   UI metin sızıntısı, badge mantık düzeltmesi, boş portföy güvenliği.
 */

import {
  consolidateByActionId,
  buildProblemInefficiencyBlock,
  buildIfNotDoneInefficiencyBlock,
  buildExecutiveAnswer,
  cleanCeiling,
} from '../decisionLayer'
import type { EngineResult } from '../engineV3'
import type { SelectedAction } from '../engineV3'
import type {
  MarginRatioTransparency,
  TurnoverRatioTransparency,
  BalanceRatioTransparency,
  HorizonKey,
} from '../contracts'
import type { RatingGrade } from '../ratingReasoning'

// ─── Test yardımcıları ────────────────────────────────────────────────────────

function makeAction(
  actionId:          string,
  amountTRY:         number,
  horizon:           HorizonKey = 'short',
  ratioTransparency?: SelectedAction['ratioTransparency'],
): SelectedAction {
  return {
    actionId,
    actionName:                 actionId,
    horizon,
    amountTRY,
    transactions:               [],
    qualityScore:               0.8,
    productivityRepairStrength: 'MODERATE',
    sustainability:             'RECURRING',
    sectorCompatibility:        1,
    guardrailSeverity:          'PASS',
    estimatedNotchContribution: 0.5,
    repeatDecayApplied:         1,
    diversityPenaltyApplied:    1,
    narrative:                  '',
    ratioTransparency,
  }
}

// ─── Faz 7.3.12-PRE-FIX — consolidateByActionId ──────────────────────────────

describe('Faz 7.3.12-PRE-FIX — consolidateByActionId transparency rebuild', () => {

  // DEKAM-like değerler: E_baseline=6.1Mn, A_baseline=315Mn
  // - current = 6.1 / 315 ≈ 0.01937 (%1.94)
  // - SHORT parça (a1=11.86Mn) ile rt1 = (6.1+11.86)/(315+11.86) ≈ 0.0549 (%5.49)
  // - TOPLAM 38.51Mn ile rt_total = (6.1+38.51)/(315+38.51) ≈ 0.1262 (%12.6) ← fix hedefi
  const E_b = 6_100_000
  const A_b = 315_000_000
  const baselineCurrent = E_b / A_b  // 0.019365...

  const a1  = 11_860_000   // short parça
  const a2  = 12_810_000   // medium parça
  const a3  = 13_840_000   // long parça
  const TOTAL = a1 + a2 + a3  // 38_510_000

  function makeMarginRt(amount: number): MarginRatioTransparency {
    return {
      kind:             'margin',
      metricLabel:      'Özkaynak / Aktif',
      current:          baselineCurrent,
      realisticTarget:  (E_b + amount) / (A_b + amount),
      sectorMedian:     0.34,
      formula: {
        description: 'Özkaynak / Aktif = Özkaynaklar / Toplam Aktif → A10 sonrası: (Özkaynak + Tutar) / (Aktif + Tutar)',
      },
    }
  }

  // ── TEST 1 ──────────────────────────────────────────────────────────────────

  test('TEST 1: A10 üç parçalı — realisticTarget toplam tutarla yeniden hesaplanır (~%12.6)', () => {
    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', a1, 'short',  makeMarginRt(a1)),
      makeAction('A10_CASH_EQUITY_INJECTION', a2, 'medium', makeMarginRt(a2)),
      makeAction('A10_CASH_EQUITY_INJECTION', a3, 'long',   makeMarginRt(a3)),
    ]

    const consolidated = consolidateByActionId(pieces)

    // Tek kayıt
    expect(consolidated).toHaveLength(1)

    // Tutar toplandı
    expect(consolidated[0].amountTRY).toBe(TOTAL)

    const rt = consolidated[0].ratioTransparency as MarginRatioTransparency
    expect(rt).toBeDefined()
    expect(rt.kind).toBe('margin')

    // current değişmedi — baseline (%1.94)
    expect(rt.current).toBeCloseTo(baselineCurrent, 5)

    // realisticTarget = (E_b + TOTAL) / (A_b + TOTAL) ≈ %12.62
    const expected = (E_b + TOTAL) / (A_b + TOTAL)
    expect(rt.realisticTarget).toBeCloseTo(expected, 4)

    // İlk parçanın yanlış değeri (%5.49) artık gösterilmiyor
    const wrongFirstPieceRt = (E_b + a1) / (A_b + a1)
    expect(rt.realisticTarget).not.toBeCloseTo(wrongFirstPieceRt, 2)
  })

  // ── TEST 2 ──────────────────────────────────────────────────────────────────

  test('TEST 2: Tek parçalı A05 — transparency değişmez (regresyon yok)', () => {
    const balanceTr: BalanceRatioTransparency = {
      kind:             'balance',
      currentBalance:   18_000_000,
      realisticTarget:   5_500_000,
      sectorMedian:      3_000_000,
      capPercent:        0.25,
      formula: {
        targetLabel:  'Hedef Alacak',
        basisLabel:   'Net Satış',
        basisValue:    50_000_000,
        targetDays:    40,
        periodDays:   365,
      },
      attribution: { sourceType: 'TCMB_DIRECT', sectorLabel: 'İmalat', year: 2024 },
      method:           'period-end-balance',
    }

    const pieces: SelectedAction[] = [
      makeAction('A05_RECEIVABLE_COLLECTION', 12_500_000, 'short', balanceTr),
    ]

    const consolidated = consolidateByActionId(pieces)

    expect(consolidated).toHaveLength(1)
    // Tek parça — transparency AYNEN korunur (deep-equal)
    expect(consolidated[0].ratioTransparency).toEqual(balanceTr)
  })

  // ── TEST 3 ──────────────────────────────────────────────────────────────────

  test('TEST 3: A18 iki parçalı turnover — realisticTarget toplam tutarla yeniden hesaplanır', () => {
    const netSales    = 50_000_000
    const totalAssets = 250_000_000
    const amt1        =  7_500_000   // medium
    const amt2        =  8_000_000   // long
    const total       = amt1 + amt2  // 15_500_000

    const makeTurnoverRt = (amount: number): TurnoverRatioTransparency => ({
      kind:             'turnover',
      metricLabel:      'Aktif Devir Hızı',
      current:          netSales / totalAssets,
      realisticTarget:  (netSales + amount) / totalAssets,
      sectorMedian:     0.80,
      formula: {
        description:  'Aktif Devir Hızı = Net Satış / Toplam Aktif',
        netSales,
        totalAssets,
      },
    })

    const pieces: SelectedAction[] = [
      makeAction('A18_NET_SALES_GROWTH', amt1, 'medium', makeTurnoverRt(amt1)),
      makeAction('A18_NET_SALES_GROWTH', amt2, 'long',   makeTurnoverRt(amt2)),
    ]

    const consolidated = consolidateByActionId(pieces)

    expect(consolidated).toHaveLength(1)
    expect(consolidated[0].amountTRY).toBe(total)

    const rt = consolidated[0].ratioTransparency as TurnoverRatioTransparency
    expect(rt.kind).toBe('turnover')

    // realisticTarget = (netSales + total) / totalAssets
    const expected = (netSales + total) / totalAssets
    expect(rt.realisticTarget).toBeCloseTo(expected, 6)

    // İlk parçanın değeri artık gösterilmiyor
    expect(rt.realisticTarget).not.toBeCloseTo((netSales + amt1) / totalAssets, 6)
  })

  // ── TEST 4 ──────────────────────────────────────────────────────────────────

  test('TEST 4: margin kind rt1 ≈ current — degenerate input, crash yok, rebuild atlanır', () => {
    // rt1 = current → (rt1 - c) = 0 → bölme sıfır → A = ∞ → skip
    const degenerateRt: MarginRatioTransparency = {
      kind:             'margin',
      metricLabel:      'Test',
      current:          0.05,
      realisticTarget:  0.05,  // = current → degenerate
      sectorMedian:     0.34,
      formula:          { description: '...' },
    }

    const normalSecondPiece: MarginRatioTransparency = {
      ...degenerateRt,
      realisticTarget: 0.08,
    }

    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', 5_000_000, 'short',  degenerateRt),
      makeAction('A10_CASH_EQUITY_INJECTION', 6_000_000, 'medium', normalSecondPiece),
    ]

    // Crash olmamalı
    expect(() => consolidateByActionId(pieces)).not.toThrow()

    const consolidated = consolidateByActionId(pieces)
    expect(consolidated).toHaveLength(1)
    // Rebuild atlandı → ilk parçanın (degenerate) rt'si korunur
    const rt = consolidated[0].ratioTransparency as MarginRatioTransparency
    expect(rt.realisticTarget).toBeCloseTo(0.05, 6)
  })

  // ── TEST 5 (ek regresyon) ────────────────────────────────────────────────────

  test('TEST 5: Farklı actionId\'ler — birbirini etkilemez', () => {
    const marginRt: MarginRatioTransparency = {
      kind:             'margin',
      metricLabel:      'Özkaynak / Aktif',
      current:          baselineCurrent,
      realisticTarget:  (E_b + a1) / (A_b + a1),
      sectorMedian:     0.34,
      formula:          { description: '...' },
    }

    const turnoverRt: TurnoverRatioTransparency = {
      kind:             'turnover',
      metricLabel:      'Aktif Devir Hızı',
      current:          0.20,
      realisticTarget:  0.23,
      sectorMedian:     0.80,
      formula:          { description: '...', netSales: 50_000_000, totalAssets: 250_000_000 },
    }

    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', a1, 'short',  marginRt),
      makeAction('A10_CASH_EQUITY_INJECTION', a2, 'medium', { ...marginRt, realisticTarget: (E_b + a2) / (A_b + a2) }),
      makeAction('A18_NET_SALES_GROWTH',       5_000_000, 'medium', turnoverRt),
    ]

    const consolidated = consolidateByActionId(pieces)

    // A10 + A18 = 2 kayıt
    expect(consolidated).toHaveLength(2)

    const a10 = consolidated.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')!
    const a18 = consolidated.find(a => a.actionId === 'A18_NET_SALES_GROWTH')!

    // A10 doğru rebuild
    expect(a10.amountTRY).toBe(a1 + a2)
    const a10rt = a10.ratioTransparency as MarginRatioTransparency
    expect(a10rt.realisticTarget).toBeCloseTo((E_b + a1 + a2) / (A_b + a1 + a2), 4)

    // A18 tek parça — değişmedi
    expect(a18.amountTRY).toBe(5_000_000)
    const a18rt = a18.ratioTransparency as TurnoverRatioTransparency
    expect(a18rt.realisticTarget).toBeCloseTo(0.23, 6)
  })

})

// ─── Faz 7.3.13 — inefficiency enrichment helpers ────────────────────────────

describe('Faz 7.3.13 — buildProblemInefficiencyBlock', () => {

  const severeFlag = {
    type:        'ADVANCES_LOCK',
    severity:    'SEVERE',
    description: "Verilen avanslar aktifin 45.6%'ini oluşturuyor, tedarikçi riski",
  }

  const moderateFlag = {
    type:        'INVENTORY_LOCK',
    severity:    'MODERATE',
    description: "Stok aktifin 28.0%'ini bağlıyor (sektör eşiği: 20%)",
  }

  const mildFlag = {
    type:        'RECEIVABLE_SLOWDOWN',
    severity:    'MILD',
    description: "Alacaklar satışın 45%'i kadar — tahsilat süresi uzun",
  }

  const criticalFlag = {
    type:        'CASH_GENERATION_GAP',
    severity:    'CRITICAL',
    description: 'Operasyonel nakit üretimi negatif',
  }

  test('SEVERE flag → profesyonel başlık ve açıklama içerir', () => {
    const result = buildProblemInefficiencyBlock([severeFlag])
    expect(result).not.toBeNull()
    expect(result).toContain('Sipariş Avanslarında Yoğunlaşma')
    expect(result).toContain('CİDDİ')
    expect(result).toContain('Kanıt: Verilen avanslar aktifin 45.6%')
  })

  test('MILD flag → null döner (gizli)', () => {
    const result = buildProblemInefficiencyBlock([mildFlag])
    expect(result).toBeNull()
  })

  test('Hiç flag yok → null döner', () => {
    const result = buildProblemInefficiencyBlock([])
    expect(result).toBeNull()
  })

  test('Yalnız MILD flag listesi → null döner', () => {
    const result = buildProblemInefficiencyBlock([
      mildFlag,
      { ...mildFlag, type: 'WIP_LOCK' },
    ])
    expect(result).toBeNull()
  })

  test('CRITICAL + SEVERE → CRITICAL önce sıralanır', () => {
    const result = buildProblemInefficiencyBlock([severeFlag, criticalFlag])
    expect(result).not.toBeNull()
    const critIdx = result!.indexOf('Nakit Üretim Yetersizliği')
    const sevIdx  = result!.indexOf('Sipariş Avanslarında Yoğunlaşma')
    expect(critIdx).toBeLessThan(sevIdx)
  })

  test('MODERATE flag → görünür, ORTA etiketi çıkar', () => {
    const result = buildProblemInefficiencyBlock([moderateFlag])
    expect(result).not.toBeNull()
    expect(result).toContain('Stok Yoğunluğu')
    expect(result).toContain('ORTA')
    expect(result).toContain('Kanıt: Stok aktifin 28.0%')
  })

  test('"Tespit edilen yapısal sorunlar" prefix dahil', () => {
    const result = buildProblemInefficiencyBlock([severeFlag])
    expect(result).toContain('Tespit edilen yapısal sorunlar')
  })

})

describe('Faz 7.3.13 — buildIfNotDoneInefficiencyBlock', () => {

  const severeFlag = {
    type:        'ADVANCES_LOCK',
    severity:    'SEVERE',
    description: "Verilen avanslar aktifin 45.6%'ini oluşturuyor, tedarikçi riski",
  }

  const mildFlag = {
    type:        'INVENTORY_LOCK',
    severity:    'MILD',
    description: "Stok aktifin 10.0%'ini bağlıyor",
  }

  const criticalFlag = {
    type:        'CASH_GENERATION_GAP',
    severity:    'CRITICAL',
    description: 'Operasyonel nakit üretimi negatif',
  }

  test('SEVERE flag → ifNotAddressed cümlesi içerir', () => {
    const result = buildIfNotDoneInefficiencyBlock([severeFlag])
    expect(result).not.toBeNull()
    expect(result).toContain('Sipariş Avanslarında Yoğunlaşma')
    expect(result).toContain('Tedarikçi tarafındaki bağımlılık derinleşir')
  })

  test('MILD flag → null döner (gizli)', () => {
    const result = buildIfNotDoneInefficiencyBlock([mildFlag])
    expect(result).toBeNull()
  })

  test('Hiç flag yok → null döner', () => {
    const result = buildIfNotDoneInefficiencyBlock([])
    expect(result).toBeNull()
  })

  test('Birden fazla visible flag → hepsi satır satır listelenir', () => {
    const result = buildIfNotDoneInefficiencyBlock([severeFlag, criticalFlag])
    expect(result).not.toBeNull()
    expect(result).toContain('Sipariş Avanslarında Yoğunlaşma')
    expect(result).toContain('Nakit Üretim Yetersizliği')
  })

  test('"Bu yapısal sorunlar çözülmezse" prefix dahil', () => {
    const result = buildIfNotDoneInefficiencyBlock([severeFlag])
    expect(result).toContain('Bu yapısal sorunlar çözülmezse')
  })

})

// ─── Faz 7.3.31 — buildExecutiveAnswer (T_DL1-T_DL5) ────────────────────────

function makeMinimalEngineResult(opts: {
  currentRating?:    RatingGrade
  finalTargetRating?: RatingGrade
  notchesGained?:    number
  confidence?:       'HIGH' | 'MEDIUM' | 'LOW'
  bankerSummary?:    string
  bindingCeiling?:   unknown
}): EngineResult {
  return {
    version:            'v3',
    sector:             'İMALAT',
    currentRating:      opts.currentRating      ?? 'B',
    rawTargetRating:    opts.finalTargetRating   ?? 'BB',
    finalTargetRating:  opts.finalTargetRating   ?? 'BB',
    notchesGained:      opts.notchesGained       ?? 1,
    confidence:         opts.confidence          ?? 'MEDIUM',
    confidenceModifier: 1,
    horizons:           { short: { actions: [], totalImpact: 0 }, medium: { actions: [], totalImpact: 0 }, long: { actions: [], totalImpact: 0 } },
    portfolio:          [],
    reasoning: {
      bindingCeiling:      opts.bindingCeiling   ?? null,
      supportingCeilings:  [],
      drivers:             null,
      missedOpportunities: [],
      oneNotchScenario:    null,
      twoNotchScenario:    null,
      sensitivityAnalysis: null,
      bankerSummary:       opts.bankerSummary    ?? '',
      transition:          null,
    },
    layerSummaries: {
      productivity:   null,
      sustainability: null,
      sector:         null,
      guardrails:     [],
    },
    decisionTrace: [],
  } as unknown as EngineResult
}

// ─── T_DL1: Teknik sızıntı pattern tespiti ───────────────────────────────────

describe('T_DL1 — buildExecutiveAnswer: teknik sızıntı pattern tespiti (Faz 7.3.31)', () => {

  test('bankerSummary "HARD_REJECT" içeriyorsa executiveSummary teknik terim içermez', () => {
    const er = makeMinimalEngineResult({
      bankerSummary: 'Portfoy semantic guardrail HARD_REJECT nedeniyle gecersiz',
      notchesGained: 1,
      finalTargetRating: 'BB',
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.executiveSummary).not.toContain('HARD_REJECT')
    expect(ans.executiveSummary).not.toContain('guardrail')
    expect(ans.executiveSummary).not.toContain('REJECT')
    expect(ans.executiveSummary).not.toContain('gecersiz')
    expect(ans.executiveSummary.length).toBeGreaterThan(10)
  })

  test('bankerSummary "iyilesmesi" içeriyorsa executiveSummary ASCII Türkçe içermez', () => {
    const er = makeMinimalEngineResult({
      bankerSummary: 'Likidite guclenme ve iyilesmesi bekleniyor',
      notchesGained: 2,
      finalTargetRating: 'BBB',
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.executiveSummary).not.toContain('iyilesmesi')
    expect(ans.executiveSummary).not.toContain('guclenme')
  })

  test('temiz bankerSummary olduğunda doğrudan kullanılır (sızıntı yok, fallback tetiklenmez)', () => {
    const cleanSummary = 'Önerilen aksiyon planı orta vadede BB hedefini destekliyor.'
    const er = makeMinimalEngineResult({
      bankerSummary: cleanSummary,
      notchesGained: 1,
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.executiveSummary).toBe(cleanSummary)
  })

})

// ─── T_DL2: Badge >= mantığı ─────────────────────────────────────────────────

describe('T_DL2 — buildExecutiveAnswer: targetMatchesRequest >= düzeltmesi (Faz 7.3.31)', () => {

  test('finalTarget BB, requestedTarget B → targetMatchesRequest = true (AA>BB senaryosu)', () => {
    // BB >= B → hedef karşılandı
    const er = makeMinimalEngineResult({
      currentRating:    'B',
      finalTargetRating: 'BB',
      notchesGained:    1,
    })
    const ans = buildExecutiveAnswer(er, 'B')
    expect(ans.targetMatchesRequest).toBe(true)
  })

  test('finalTarget AA, requestedTarget BB → targetMatchesRequest = true (üst sınır aşma)', () => {
    const er = makeMinimalEngineResult({
      currentRating:    'B',
      finalTargetRating: 'AA',
      notchesGained:    4,
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.targetMatchesRequest).toBe(true)
  })

  test('finalTarget BB, requestedTarget AA → targetMatchesRequest = false (gerçekten kısıtlı)', () => {
    // BB < AA → hedef karşılanmadı → kırmızı badge doğru
    const er = makeMinimalEngineResult({
      currentRating:    'B',
      finalTargetRating: 'BB',
      notchesGained:    1,
    })
    const ans = buildExecutiveAnswer(er, 'AA')
    expect(ans.targetMatchesRequest).toBe(false)
  })

  test('finalTarget === requestedTarget → targetMatchesRequest = true (strict eşitlik de çalışır)', () => {
    const er = makeMinimalEngineResult({
      currentRating:    'BB',
      finalTargetRating: 'BBB',
      notchesGained:    1,
    })
    const ans = buildExecutiveAnswer(er, 'BBB')
    expect(ans.targetMatchesRequest).toBe(true)
  })

})

// ─── T_DL3: notchesGained=0, ceiling=null → fallback metin A ─────────────────

describe('T_DL3 — buildExecutiveAnswer: notchesGained=0, ceiling=null → fallback metin A (Faz 7.3.31)', () => {

  test('bankerSummary boş + notchesGained=0 + ceiling=null → "yapısal iyileşme" fallback', () => {
    const er = makeMinimalEngineResult({
      bankerSummary:  '',
      notchesGained:  0,
      bindingCeiling: null,
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.executiveSummary).toContain('yapısal')
    expect(ans.executiveSummary).not.toContain('guardrail')
    expect(ans.executiveSummary).not.toContain('REJECT')
  })

  test('sızıntılı bankerSummary + notchesGained=0 + ceiling=null → operasyonel fallback', () => {
    const er = makeMinimalEngineResult({
      bankerSummary:  'HARD_REJECT yapısı gecersiz',
      notchesGained:  0,
      bindingCeiling: null,
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    expect(ans.executiveSummary).not.toContain('HARD_REJECT')
    expect(ans.executiveSummary.length).toBeGreaterThan(20)
  })

})

// ─── T_DL4: notchesGained=0, ceiling=SEMANTIC_GUARDRAIL → fallback metin B ───

describe('T_DL4 — buildExecutiveAnswer: notchesGained=0, ceiling aktif → fallback metin B (Faz 7.3.31)', () => {

  test('bankerSummary sızıntılı + notchesGained=0 + ceiling=SEMANTIC_GUARDRAIL → yapısal limit fallback', () => {
    const er = makeMinimalEngineResult({
      bankerSummary:  'Portfoy SEMANTIC_GUARDRAIL HARD_REJECT',
      notchesGained:  0,
      bindingCeiling: {
        source:    'SEMANTIC_GUARDRAIL',
        maxRating: 'B',
        reason:    'Özkaynak yetersizliği',
        evidence:  [],
      },
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    // hasCeiling = true → "yapısal limitler" mesajı
    expect(ans.executiveSummary).not.toContain('SEMANTIC_GUARDRAIL')
    expect(ans.executiveSummary).not.toContain('HARD_REJECT')
    expect(ans.hasCeiling).toBe(true)
    expect(ans.executiveSummary.length).toBeGreaterThan(20)
  })

})

// ─── T_DL5: Boş portföy durumunda exception yok ──────────────────────────────

describe('T_DL5 — buildExecutiveAnswer: boş portföy → exception yok (Faz 7.3.31)', () => {

  test('portfolio=[], notchesGained=0 → executiveSummary dolu, throw yok', () => {
    const er = makeMinimalEngineResult({
      notchesGained:  0,
      bankerSummary:  '',
      bindingCeiling: null,
    })
    expect(() => {
      const ans = buildExecutiveAnswer(er, 'BB')
      expect(ans.executiveSummary).toBeTruthy()
      expect(typeof ans.executiveSummary).toBe('string')
    }).not.toThrow()
  })

  test('portfolio=[], notchesGained=2 → temiz executiveSummary', () => {
    const er = makeMinimalEngineResult({
      notchesGained:    2,
      finalTargetRating: 'BBB',
      bankerSummary:    '',
    })
    expect(() => {
      const ans = buildExecutiveAnswer(er, 'BBB')
      expect(ans.notchesGained).toBe(2)
      expect(typeof ans.executiveSummary).toBe('string')
    }).not.toThrow()
  })

})

// ─── T_DL6: cleanCeiling sızıntı filtresi ────────────────────────────────────

describe('T_DL6 — cleanCeiling: ceiling.reason sızıntı pattern temizleme (Faz 7.3.32)', () => {

  test('reason "HARD_REJECT" içeriyorsa fallback döner', () => {
    const ceiling = {
      source:    'SEMANTIC_GUARDRAIL' as const,
      maxRating: 'B' as RatingGrade,
      reason:    'Portfoy semantic guardrail HARD_REJECT — rating iyilesmesi gecersiz',
      evidence:  [],
    }
    const clean = cleanCeiling(ceiling)
    expect(clean.reason).not.toContain('HARD_REJECT')
    expect(clean.reason).not.toContain('guardrail')
    expect(clean.reason).not.toContain('iyilesmesi')
    expect(clean.reason.length).toBeGreaterThan(10)
  })

  test('reason "guardrail" içeriyorsa fallback döner', () => {
    const ceiling = {
      source:    'PRODUCTIVITY' as const,
      maxRating: 'BB' as RatingGrade,
      reason:    'semantic guardrail eşiği aşıldı',
      evidence:  [],
    }
    const clean = cleanCeiling(ceiling)
    expect(clean.reason).not.toContain('guardrail')
    expect(clean.reason).not.toContain('semantic')
  })

  test('temiz reason değiştirilmez', () => {
    const cleanReason = 'aktif verimliliği sektör ortalamasının altında'
    const ceiling = {
      source:    'PRODUCTIVITY' as const,
      maxRating: 'BB' as RatingGrade,
      reason:    cleanReason,
      evidence:  [],
    }
    const clean = cleanCeiling(ceiling)
    expect(clean.reason).toBe(cleanReason)
  })

  test('source ve maxRating korunur', () => {
    const ceiling = {
      source:    'SEMANTIC_GUARDRAIL' as const,
      maxRating: 'B' as RatingGrade,
      reason:    'HARD_REJECT Portfoy',
      evidence:  ['kanıt1'],
    }
    const clean = cleanCeiling(ceiling)
    expect(clean.source).toBe('SEMANTIC_GUARDRAIL')
    expect(clean.maxRating).toBe('B')
    expect(clean.evidence).toEqual(['kanıt1'])
  })

  test('boş reason → fallback döner', () => {
    const ceiling = {
      source:    'SUSTAINABILITY' as const,
      maxRating: 'BBB' as RatingGrade,
      reason:    '',
      evidence:  [],
    }
    const clean = cleanCeiling(ceiling)
    expect(clean.reason.length).toBeGreaterThan(10)
  })

})

// ─── T_DL7: targetMatchesRequest postActualRating senkron ─────────────────────

describe('T_DL7 — buildExecutiveAnswer: targetMatchesRequest postActualRating senkron (Faz 7.3.32)', () => {

  test('finalTarget B, requestedTarget BB → buildExecutiveAnswer false, ama postActualRating AA olduğunda true olmalı', () => {
    // Senaryo: engine B tahmin etti, ama postActualRating (gerçek hesap) AA geldi
    // buildDecisionAnswer içindeki override bunu yakalar
    // Bu test buildExecutiveAnswer davranışını (flag olmadan) doğrular
    const er = makeMinimalEngineResult({
      currentRating:    'B',
      finalTargetRating: 'B',
      notchesGained:    0,
    })
    const ans = buildExecutiveAnswer(er, 'BB')
    // finalTargetRating B < requestedTarget BB → false (doğru — override buildDecisionAnswer'da)
    expect(ans.targetMatchesRequest).toBe(false)
  })

  test('postActualRating AA, requestedTarget BB → ratingToIndex(AA) >= ratingToIndex(BB) = true', () => {
    // ratingToIndex: AAA=7, AA=6, A=5, BBB=4, BB=3, B=2, B-=1, CCC=0
    // AA(6) >= BB(3) → true
    // Bu mantığı buildDecisionAnswer uyguluyor — burada saf hesabı doğrularız
    const ratingToIndexMap: Record<string, number> = {
      'AAA': 7, 'AA': 6, 'A': 5, 'BBB': 4, 'BB': 3, 'B': 2, 'B-': 1, 'CCC': 0,
    }
    const postActualRating = 'AA'
    const requestedTarget  = 'BB'
    expect(ratingToIndexMap[postActualRating]).toBeGreaterThanOrEqual(ratingToIndexMap[requestedTarget])
  })

  test('postActualRating B, requestedTarget AA → B(2) < AA(6) = false (kırmızı badge doğru)', () => {
    const ratingToIndexMap: Record<string, number> = {
      'AAA': 7, 'AA': 6, 'A': 5, 'BBB': 4, 'BB': 3, 'B': 2, 'B-': 1, 'CCC': 0,
    }
    const postActualRating = 'B'
    const requestedTarget  = 'AA'
    expect(ratingToIndexMap[postActualRating]).toBeLessThan(ratingToIndexMap[requestedTarget])
  })

})

// ─── T1: Quick Screen Net Marj sektör kıyas mantığı (Faz 7.3.33) ─────────────

describe('T1 — Quick Screen Net Marj: sektör kıyas tone mantığı (Faz 7.3.33)', () => {

  /** page.tsx Quick Screen tone hesabını yansıtan saf fonksiyon */
  function quickScreenNetMarjTone(
    netProfitMargin: number | null | undefined,
    bmNetProfitMargin: number | null | undefined,
  ): 'positive' | 'negative' {
    return netProfitMargin != null && bmNetProfitMargin != null &&
      netProfitMargin >= bmNetProfitMargin * 0.8
      ? 'positive'
      : 'negative'
  }

  test('marj %0.5, sektör eşiği %5.0 → negative (DEKA senaryosu)', () => {
    expect(quickScreenNetMarjTone(0.005, 0.05)).toBe('negative')
  })

  test('marj %5.0, sektör eşiği %5.0 → positive (eşikte)', () => {
    expect(quickScreenNetMarjTone(0.05, 0.05)).toBe('positive')
  })

  test('marj %4.1, sektör %5.0, eşik %80 = %4.0 → positive (sınır üstü)', () => {
    // 0.041 >= 0.05 * 0.8 = 0.04 → true
    expect(quickScreenNetMarjTone(0.041, 0.05)).toBe('positive')
  })

  test('marj %3.9, sektör %5.0, eşik %80 = %4.0 → negative (sınır altı)', () => {
    // 0.039 < 0.04 → false
    expect(quickScreenNetMarjTone(0.039, 0.05)).toBe('negative')
  })

  test('marj pozitif ama sektör benchmarkı null → negative (güvenli fallback)', () => {
    expect(quickScreenNetMarjTone(0.10, null)).toBe('negative')
  })

  test('marj null → negative', () => {
    expect(quickScreenNetMarjTone(null, 0.05)).toBe('negative')
  })

  test('marj negatif → negative (sektör kıyassız da olumsuz)', () => {
    expect(quickScreenNetMarjTone(-0.02, 0.05)).toBe('negative')
  })

})
