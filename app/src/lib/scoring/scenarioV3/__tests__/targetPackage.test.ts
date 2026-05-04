/**
 * Faz 7.3.8d-FIX2 — selectTargetPackage tests (rasyo grubu çeşitlilik önceliği)
 *
 * Bu suite şu kontratı doğrular:
 *   - Edge case'ler: boş, eşit/altında, geçersiz, ulaşılmaz
 *   - Sıralama: grup kapsama desc → cardinality asc → tutar asc → hedef yakınlığı
 *   - fullPortfolio sırası alt küme içinde korunur
 *   - DEKAM senaryosu (Codex audit): kısa ID → 0 grup → eski tie-break davranışı
 *   - N > 12 koruma: subset search atlanır
 *   - getCoveredGroups unit testleri
 *   - coveredGroupCount meta alanı
 *
 * Test stratejisi: postActionRating helper'ı `mockImplementation` ile
 * actionId'lere göre rating üretiyor — her alt küme için doğru rating dönüyor.
 *
 * ID konvansiyonu:
 *   - Mevcut testler (1-9): kısa ID ('A05') → getCoveredGroups=0 → tie-break korunur
 *   - Yeni diversity testleri (10-11): tam catalog ID ('A05_RECEIVABLE_COLLECTION')
 *     → getCoveredGroups doğru çalışır → diversity sıralama aktif
 */

import { selectTargetPackage } from '../targetPackage'
import type { SelectedAction } from '../engineV3'
import * as postActionRatingModule from '../postActionRating'
import type { ActualRatingValidation } from '../postActionRating'
import { getCoveredGroups } from '../actionRatioGroupProfile'

// ─── YARDIMCILAR ──────────────────────────────────────────────────────────────

/**
 * Minimal SelectedAction fabrikası.
 * transaction.transactionId === actionId konvansiyonu sayesinde
 * mock'lar gelen transactions listesinden hangi aksiyonların seçildiğini anlar.
 */
function makeAction(id: string, amount: number): SelectedAction {
  return {
    actionId:                   id,
    actionName:                 id,
    horizon:                    'short',
    amountTRY:                  amount,
    transactions: [
      {
        transactionId: id,                            // mock'un actionId tespit etmesi için
        description:   `${id} test tx`,
        semanticType:  'CASH_INFLOW',                 // SemanticType union'da geçerli
        legs:          [],
      },
    ],
    qualityScore:               1,
    productivityRepairStrength: 'STRONG',
    sustainability:             'RECURRING',
    sectorCompatibility:        1,
    guardrailSeverity:          'NONE',
    estimatedNotchContribution: 1,
    repeatDecayApplied:         1,
    diversityPenaltyApplied:    1,
    narrative:                  '',
  }
}

/** Mock validation — sadece postActualRating önemli */
function fakeValidation(postRating: string): ActualRatingValidation {
  return {
    currentObjectiveScore: 33,
    postObjectiveScore:    50,
    subjectiveTotal:       0,
    currentCombinedScore:  33,
    postCombinedScore:     50,
    currentActualRating:   'C',
    postActualRating:      postRating,
    v3EstimatedRating:     'BB',
    isEstimateConfirmed:   false,
    ledgerApplied:         true,
    warnings:              [],
  }
}

/** Mock kurar: gelen transactions'tan actionId set'ini çıkarıp `ratingMap`'ten
 * doğru rating üretir. Map'te yoksa varsayılan 'C' (yetersiz) döner. */
function setupRatingMock(
  ratingMap: (ids: Set<string>) => string,
): jest.SpyInstance {
  return jest
    .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
    .mockImplementation((p) => {
      const ids = new Set<string>()
      for (const t of p.transactions ?? []) {
        if (t.transactionId) ids.add(t.transactionId)
      }
      return fakeValidation(ratingMap(ids))
    })
}

const BASE_PARAMS = {
  initialBalances:       { '100': 1_000_000 },
  sector:                'inşaat',
  subjectiveTotal:       0,
  currentObjectiveScore: 33,
  currentCombinedScore:  33,
  currentActualRating:   'C',
  v3EstimatedRating:     'BB',
}

afterEach(() => {
  jest.restoreAllMocks()
})

// ─── 1. EDGE: Boş portföy ─────────────────────────────────────────────────────

describe('selectTargetPackage — edge: boş portföy', () => {
  test('boş portfolio + hedef üstte → boş paket, reachedTarget false', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toEqual([])
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.fallback).toBe(false)
    expect(r.meta.fullPortfolioActionCount).toBe(0)
    expect(r.meta.totalAmountTRY).toBe(0)
    expect(r.meta.warnings.length).toBeGreaterThan(0)
  })
})

// ─── 2. EDGE: Hedef = mevcut (eşit veya altında) ─────────────────────────────

describe('selectTargetPackage — edge: hedef mevcut rating ile aynı/altında', () => {
  test('hedef = mevcut → boş paket, reachedTarget true', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating: 'B',
      portfolio:           [makeAction('A1', 1_000_000)],
      requestedTarget:     'B',
    })
    expect(r.selectedActions).toEqual([])
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.totalAmountTRY).toBe(0)
    expect(r.meta.selectedActionCount).toBe(0)
  })

  test('hedef mevcut rating altında → boş paket, reachedTarget true', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating: 'BB',
      portfolio:           [makeAction('A1', 1_000_000)],
      requestedTarget:     'B',
    })
    expect(r.selectedActions).toEqual([])
    expect(r.meta.reachedTarget).toBe(true)
  })
})

// ─── 3. EDGE: Geçersiz hedef ──────────────────────────────────────────────────

describe('selectTargetPackage — edge: geçersiz hedef', () => {
  test('INVALID rating → tüm liste fallback + warning', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [makeAction('A1', 1_000_000)],
      requestedTarget: 'INVALID',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.warnings[0]).toMatch(/INVALID/)
  })

  test('boş target → tüm liste fallback', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [makeAction('A1', 1_000_000)],
      requestedTarget: '',
    })
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.reachedTarget).toBe(false)
  })
})

// ─── 4. EDGE: Hedef ulaşılmıyor (fallback) ────────────────────────────────────

describe('selectTargetPackage — edge: hedef ulaşılmıyor', () => {
  test('tüm alt kümeler hedefin altında → fallback = tüm liste', () => {
    setupRatingMock(() => 'C')   // hep C
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2',   500_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.achievedRating).toBe('C')
    expect(r.meta.warnings.length).toBeGreaterThan(0)
  })
})

// ─── 5. MİNİMUM CARDINALITY: tek aksiyon yeterli (ANCAK doğru olanı) ─────────

describe('selectTargetPackage — minimum cardinality', () => {
  test('A2 tek başına yeterli, A1 yetersiz → [A2] seçilir (NOT [A1])', () => {
    setupRatingMock((ids) => {
      // A2 dahilse → BB; sadece A1 dahilse → CCC; ikisi → BB; boş → C
      if (ids.has('A2')) return 'BB'
      if (ids.has('A1')) return 'CCC'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 50_000_000),   // engine sırasında önce — ama yetersiz
        makeAction('A2',  5_000_000),   // tek başına yeterli, daha düşük tutar
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A2')
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.totalAmountTRY).toBe(5_000_000)
    expect(r.meta.achievedRating).toBe('BB')
  })

  test('iki tekli yeterli → daha düşük tutarlı seçilir (A1 değil A2)', () => {
    setupRatingMock((ids) => {
      // Hem A1 hem A2 tek başına yeterli; ama A2 daha ucuz
      if (ids.has('A1') || ids.has('A2')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 100_000_000),
        makeAction('A2',  10_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A2')
    expect(r.meta.totalAmountTRY).toBe(10_000_000)
  })

  test('aynı k, aynı tutar → en yakın hedef (achievedIdx asc) seçilir', () => {
    setupRatingMock((ids) => {
      // Tek aksiyonların tümü hedefe ulaşır ama farklı seviyelerde
      if (ids.size !== 1) return 'C'
      // A1 → BBB (overshoot), A2 → B (tam hedef), A3 → BB (orta)
      if (ids.has('A1')) return 'BBB'
      if (ids.has('A2')) return 'B'
      if (ids.has('A3')) return 'BB'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2', 1_000_000),
        makeAction('A3', 1_000_000),
      ],
      requestedTarget: 'B',
    })
    // 3 alt küme de tutar=1M, k=1; en yakın hedef A2 (B == hedef)
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A2')
    expect(r.meta.achievedRating).toBe('B')
  })

  test('tek aksiyon yetmez ama 2-aksiyonluk subset yeter (k=2 minimum)', () => {
    setupRatingMock((ids) => {
      // Sadece A1+A3 birlikte yeter, diğer 2-li alt kümeler de C
      if (ids.size === 2 && ids.has('A1') && ids.has('A3')) return 'B'
      if (ids.size >= 3) return 'B'   // 3+ kombinasyonlar da yeter
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 30_000_000),
        makeAction('A2', 50_000_000),   // tek başına yetersiz, dahil edilmemeli
        makeAction('A3', 20_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A1', 'A3'])
    expect(r.meta.totalAmountTRY).toBe(50_000_000)
  })
})

// ─── 6. fullPortfolio sırası alt küme içinde korunur ──────────────────────────

describe('selectTargetPackage — sıra korunması', () => {
  test('engine sırasında A19 index 2, A10 index 6 → seçilen alt küme [A19, A10]', () => {
    setupRatingMock((ids) => {
      if (ids.size === 2 && ids.has('A19') && ids.has('A10')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A05', 5_000_000),
        makeAction('A06', 5_000_000),
        makeAction('A19', 30_000_000),
        makeAction('A04', 5_000_000),
        makeAction('A18', 5_000_000),
        makeAction('A12', 5_000_000),
        makeAction('A10', 38_500_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A19', 'A10'])
    // Sıra: portfolio'da A19 index 2, A10 index 6 → asc index düzeni
  })
})

// ─── 7. DEKAM SENARYOSU (Codex audit referansı) ───────────────────────────────

describe('selectTargetPackage — DEKAM senaryosu (Codex audit referansı)', () => {
  /**
   * Engine sırası: A05 → A06 → A19 → A04 → A18 → A12 → A10
   * Codex audit V2:
   *   A10 tek (38.5 Mn)         → CCC
   *   A19 + A10 (68 Mn)         → B
   *   Tam paket (92.5 Mn, 7 aks) → BB
   *
   * Beklenen:
   *   CCC hedefi → [A10]              (1 aksiyon, 38.5 Mn)
   *   B hedefi   → [A19, A10]         (2 aksiyon, 68 Mn)
   *   BB hedefi  → tam 7 aksiyon       (92.5 Mn)
   *
   * Çözüm öncesi sorun (greedy prefix): 3'ü de tüm listeyi gösteriyordu.
   */

  function dekamPortfolio(): SelectedAction[] {
    return [
      makeAction('A05',  5_000_000),
      makeAction('A06',  5_000_000),
      makeAction('A19', 30_000_000),
      makeAction('A04',  5_000_000),
      makeAction('A18',  5_000_000),
      makeAction('A12',  4_000_000),
      makeAction('A10', 38_500_000),
    ]
  }

  /**
   * DEKAM rating fonksiyonu: alt küme içeriğine bakıp Codex tablo değerini döner.
   * Kapsanmayan alt kümeler 'C' (yetersiz) döner.
   */
  function dekamRating(ids: Set<string>): string {
    if (ids.size === 7) return 'BB'                                              // Tam paket
    if (ids.size === 2 && ids.has('A19') && ids.has('A10')) return 'B'           // A19+A10
    if (ids.size === 1 && ids.has('A10')) return 'CCC'                           // A10 tek
    return 'C'                                                                    // Aksi
  }

  test('hedef CCC → [A10] (1 aksiyon, A10 tek başına yeterli)', () => {
    setupRatingMock(dekamRating)
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'CCC',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10')
    expect(r.meta.achievedRating).toBe('CCC')
    expect(r.meta.totalAmountTRY).toBe(38_500_000)
    expect(r.meta.fallback).toBe(false)
    expect(r.meta.reachedTarget).toBe(true)
  })

  test('hedef B → [A19, A10] (2 aksiyon, 68 Mn)', () => {
    setupRatingMock(dekamRating)
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A19', 'A10'])
    expect(r.meta.totalAmountTRY).toBe(30_000_000 + 38_500_000)
    expect(r.meta.achievedRating).toBe('B')
  })

  test('hedef BB → tüm 7 aksiyon (tam paket)', () => {
    setupRatingMock(dekamRating)
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'BB',
    })
    expect(r.selectedActions).toHaveLength(7)
    expect(r.selectedActions.map(a => a.actionId)).toEqual(
      ['A05', 'A06', 'A19', 'A04', 'A18', 'A12', 'A10'],
    )
    expect(r.meta.achievedRating).toBe('BB')
    expect(r.meta.totalAmountTRY).toBe(92_500_000)
  })

  test('regression guard: 3 hedef → 3 farklı paket boyutu (1, 2, 7)', () => {
    setupRatingMock(dekamRating)
    const sizes = (['CCC', 'B', 'BB'] as const).map(t => {
      // Her çağrı için mock'u yeniden ayarlıyoruz — değil, mockImplementation kalıcı
      const r = selectTargetPackage({
        ...BASE_PARAMS,
        portfolio:       dekamPortfolio(),
        requestedTarget: t,
      })
      return r.selectedActions.length
    })
    expect(sizes).toEqual([1, 2, 7])
    // En kritik iddia: 3 hedef için 3 farklı boyut
    expect(new Set(sizes).size).toBe(3)
  })
})

// ─── 8. N > 12 KORUMA ────────────────────────────────────────────────────────

describe('selectTargetPackage — N > SUBSET_SEARCH_LIMIT koruma', () => {
  test('13 aksiyon → subset search atlanır, fallback + warning', () => {
    const spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValue(fakeValidation('BB'))
    const portfolio = Array.from({ length: 13 }, (_, i) =>
      makeAction(`A${i}`, 1_000_000),
    )
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio,
      requestedTarget: 'B',
    })
    // Subset search atlanmalı: tek bir validation çağrısı tüm liste için
    expect(spy).toHaveBeenCalledTimes(1)
    expect(r.selectedActions).toHaveLength(13)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.warnings.some(w => /eşi(k|ği)/.test(w))).toBe(true)
    // BB hedefin üstünde olduğu için reachedTarget true ama fallback de true
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.achievedRating).toBe('BB')
  })

  test('12 aksiyon → subset search uygulanır (sınırın altında)', () => {
    setupRatingMock((ids) => (ids.has('A0') ? 'B' : 'C'))
    const portfolio = Array.from({ length: 12 }, (_, i) =>
      makeAction(`A${i}`, 1_000_000),
    )
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio,
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A0')
    expect(r.meta.fallback).toBe(false)
  })
})

// ─── 9. META ALAN TUTARLILIĞI ─────────────────────────────────────────────────

describe('selectTargetPackage — meta tutarlılığı', () => {
  test('selectedActionCount = selectedActions.length', () => {
    setupRatingMock((ids) => (ids.has('A2') ? 'B' : 'C'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 1), makeAction('A2', 2), makeAction('A3', 3)],
      requestedTarget: 'B',
    })
    expect(r.meta.selectedActionCount).toBe(r.selectedActions.length)
    expect(r.meta.fullPortfolioActionCount).toBe(3)
  })

  test('totalAmountTRY = selectedActions amountTRY toplamı', () => {
    setupRatingMock((ids) => (ids.size >= 2 ? 'B' : 'C'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 7_000_000), makeAction('A2', 3_000_000)],
      requestedTarget: 'B',
    })
    const sum = r.selectedActions.reduce((s, a) => s + a.amountTRY, 0)
    expect(r.meta.totalAmountTRY).toBe(sum)
  })

  test('warnings boş olduğunda da meta tutarlı', () => {
    setupRatingMock(() => 'B')
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 1_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.warnings).toEqual([])
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.fallback).toBe(false)
  })
})

// ─── 10. getCoveredGroups UNIT TESTLERİ ──────────────────────────────────────

describe('getCoveredGroups — unit', () => {
  test('tek aksiyon primary only → 1 grup', () => {
    // A11_RETAIN_EARNINGS: primary=LEVERAGE, secondary yok
    const groups = getCoveredGroups(['A11_RETAIN_EARNINGS'])
    expect(groups.size).toBe(1)
    expect(groups.has('LEVERAGE')).toBe(true)
  })

  test('tek aksiyon primary+secondary → 2 grup', () => {
    // A10_CASH_EQUITY_INJECTION: primary=LEVERAGE, secondary=LIQUIDITY
    const groups = getCoveredGroups(['A10_CASH_EQUITY_INJECTION'])
    expect(groups.size).toBe(2)
    expect(groups.has('LEVERAGE')).toBe(true)
    expect(groups.has('LIQUIDITY')).toBe(true)
  })

  test('iki aksiyon tüm 4 grubu kapsıyor', () => {
    // A10: LEVERAGE+LIQUIDITY  |  A18: PROFITABILITY+ACTIVITY  → 4 grup
    const groups = getCoveredGroups(['A10_CASH_EQUITY_INJECTION', 'A18_NET_SALES_GROWTH'])
    expect(groups.size).toBe(4)
    expect(groups.has('LEVERAGE')).toBe(true)
    expect(groups.has('LIQUIDITY')).toBe(true)
    expect(groups.has('PROFITABILITY')).toBe(true)
    expect(groups.has('ACTIVITY')).toBe(true)
  })

  test('aksiyonlar örtüşen gruplara sahip → dedupe', () => {
    // A10: LEVERAGE+LIQUIDITY  |  A01: LEVERAGE+LIQUIDITY  → hâlâ 2 grup
    const groups = getCoveredGroups(['A10_CASH_EQUITY_INJECTION', 'A01_ST_FIN_DEBT_TO_LT'])
    expect(groups.size).toBe(2)
  })

  test('profile dışı ID → katkı sıfır (sessiz fallback)', () => {
    const groups = getCoveredGroups(['UNKNOWN_ACTION', 'A99_FAKE'])
    expect(groups.size).toBe(0)
  })

  test('kısa ID (A10 değil A10_CASH_EQUITY_INJECTION) → profile bulunamaz → 0 grup', () => {
    // Kısa ID yanlış format — production'da tam ID gelir
    const groups = getCoveredGroups(['A10'])
    expect(groups.size).toBe(0)
  })

  test('boş dizi → 0 grup', () => {
    expect(getCoveredGroups([]).size).toBe(0)
  })

  test('projeksiyon aksiyonu (A13_OPEX_OPTIMIZATION) da profilde var', () => {
    // Projeksiyon olsa da diversity hesabına dahil
    const groups = getCoveredGroups(['A13_OPEX_OPTIMIZATION'])
    expect(groups.size).toBe(1)
    expect(groups.has('PROFITABILITY')).toBe(true)
  })
})

// ─── 11. DİVERSİTY ÖNCELİĞİ (tam catalog ID ile) ─────────────────────────────
//
// Bu testlerde makeAction'a TAM catalog ID'si verilir.
// getCoveredGroups doğru grubu bulur → diversity sıralama aktif olur.

describe('selectTargetPackage — diversity önceliği (tam catalog ID)', () => {
  test('1-grup vs 2-grup (aynı cardinality) → 2-grup seçilir', () => {
    // A11_RETAIN_EARNINGS: LEVERAGE (1 grup), 10M
    // A10_CASH_EQUITY_INJECTION: LEVERAGE+LIQUIDITY (2 grup), 15M
    // Her ikisi de tek başına hedefi tutuyor. Cardinality eşit (k=1).
    // Diversity: 2 grup > 1 grup → A10 seçilir (daha pahalı ama dengeli)
    setupRatingMock((ids) => {
      if (ids.has('A11_RETAIN_EARNINGS') || ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A11_RETAIN_EARNINGS', 10_000_000),       // 1 grup — ucuz
        makeAction('A10_CASH_EQUITY_INJECTION', 15_000_000), // 2 grup — pahalı
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10_CASH_EQUITY_INJECTION')
    expect(r.meta.coveredGroupCount).toBe(2)
    expect(r.meta.reachedTarget).toBe(true)
  })

  test('3-grup 2-aksiyon vs 2-grup 1-aksiyon → 3-grup seçilir (diversity > cardinality)', () => {
    // A10 tek: LEVERAGE+LIQUIDITY (2 grup), k=1, 38.5M
    // A05+A18: LIQUIDITY+ACTIVITY+PROFITABILITY (3 grup), k=2, 15M
    // Diversity (3>2) önce gelir → A05+A18 seçilir
    // NOT: ids.size kontrolü ile sadece belirtilen kombinasyonlar B döner;
    //      A18+A10 gibi diğer çiftler C kalır (mock'u basit tutar)
    setupRatingMock((ids) => {
      if (ids.size === 1 && ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      if (ids.size === 2 && ids.has('A05_RECEIVABLE_COLLECTION') && ids.has('A18_NET_SALES_GROWTH')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A05_RECEIVABLE_COLLECTION', 5_000_000),   // LIQUIDITY+ACTIVITY
        makeAction('A18_NET_SALES_GROWTH', 10_000_000),       // PROFITABILITY+ACTIVITY
        makeAction('A10_CASH_EQUITY_INJECTION', 38_500_000),  // LEVERAGE+LIQUIDITY
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions.map(a => a.actionId)).toEqual([
      'A05_RECEIVABLE_COLLECTION',
      'A18_NET_SALES_GROWTH',
    ])
    expect(r.meta.coveredGroupCount).toBe(3)
  })

  test('eşit grup, farklı cardinality → az aksiyon seçilir', () => {
    // A10 tek: LEVERAGE+LIQUIDITY (2 grup), k=1
    // A01+A04: LEVERAGE+LIQUIDITY (2 grup), k=2  — aynı gruplar, daha fazla aksiyon
    // Diversity tie → cardinality: k=1 kazanır → A10
    setupRatingMock((ids) => {
      if (ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      if (ids.has('A01_ST_FIN_DEBT_TO_LT') && ids.has('A04_CASH_PAYDOWN_ST')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A01_ST_FIN_DEBT_TO_LT', 20_000_000),    // LEVERAGE+LIQUIDITY
        makeAction('A04_CASH_PAYDOWN_ST', 15_000_000),      // LEVERAGE+LIQUIDITY
        makeAction('A10_CASH_EQUITY_INJECTION', 30_000_000), // LEVERAGE+LIQUIDITY
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10_CASH_EQUITY_INJECTION')
    expect(r.meta.coveredGroupCount).toBe(2)
  })

  test('eşit grup, eşit cardinality → daha düşük tutar seçilir', () => {
    // A01: LEVERAGE+LIQUIDITY (2 grup), 50M
    // A10: LEVERAGE+LIQUIDITY (2 grup), 30M
    // Her ikisi de tek başına yeterli (k=1). Tie: 2 grup eşit, k eşit → tutar → 30M kazanır
    setupRatingMock((ids) => {
      if (ids.has('A01_ST_FIN_DEBT_TO_LT') || ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A01_ST_FIN_DEBT_TO_LT', 50_000_000),    // LEVERAGE+LIQUIDITY, pahalı
        makeAction('A10_CASH_EQUITY_INJECTION', 30_000_000), // LEVERAGE+LIQUIDITY, ucuz
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10_CASH_EQUITY_INJECTION')
    expect(r.meta.totalAmountTRY).toBe(30_000_000)
    expect(r.meta.coveredGroupCount).toBe(2)
  })

  test('4 grup kapsayan paket → coveredGroupCount=4', () => {
    // A10: LEVERAGE+LIQUIDITY  |  A18: PROFITABILITY+ACTIVITY  → 4 grup birlikte
    setupRatingMock((ids) => {
      if (ids.has('A10_CASH_EQUITY_INJECTION') && ids.has('A18_NET_SALES_GROWTH')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A10_CASH_EQUITY_INJECTION', 10_000_000),
        makeAction('A18_NET_SALES_GROWTH', 10_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.coveredGroupCount).toBe(4)
    expect(r.meta.reachedTarget).toBe(true)
  })

  test('profile dışı ID → coveredGroupCount=0, işlev bozulmaz', () => {
    // Profile'da olmayan aksiyon: diversity=0, fallback sessiz
    setupRatingMock(() => 'B')
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('LEGACY_ACTION_XYZ', 5_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.coveredGroupCount).toBe(0)
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.fallback).toBe(false)
  })
})

// ─── 12. FIX3: SAYIM UYUMU (rawSelectedActionCount / displayActionCount / tutar alanları) ──

describe('selectTargetPackage — FIX3 sayım uyumu', () => {
  /**
   * Horizon parçalı aksiyon fabrikası: aynı actionId'ye farklı transactionId atar.
   * Böylece mock her parçayı ayrı tanıyabilir.
   */
  function makeHorizonPart(
    actionId: string,
    amount:   number,
    part:     'short' | 'medium' | 'long',
  ): SelectedAction {
    return {
      ...makeAction(actionId, amount),
      transactions: [{
        transactionId: `${actionId}::${part}`,
        description:   `${actionId} ${part} horizon`,
        semanticType:  'CASH_INFLOW' as const,
        legs:          [],
      }],
    }
  }

  test('aynı actionId üç horizon parçası → rawSelectedActionCount=3, displayActionCount=1', () => {
    // Tüm 3 parça bir arada gerekli: mock sadece hepsini görünce B döner
    setupRatingMock((ids) => {
      const hasAll =
        ids.has('A10_CASH_EQUITY_INJECTION::short')   &&
        ids.has('A10_CASH_EQUITY_INJECTION::medium')  &&
        ids.has('A10_CASH_EQUITY_INJECTION::long')
      return hasAll ? 'B' : 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeHorizonPart('A10_CASH_EQUITY_INJECTION', 10_000_000, 'short'),
        makeHorizonPart('A10_CASH_EQUITY_INJECTION', 20_000_000, 'medium'),
        makeHorizonPart('A10_CASH_EQUITY_INJECTION', 30_000_000, 'long'),
      ],
      requestedTarget: 'B',
    })
    // 3 raw satır seçildi, ama display'de tek kart
    expect(r.meta.rawSelectedActionCount).toBe(3)
    expect(r.meta.displayActionCount).toBe(1)
    // geriye uyum alias'ı da tutarlı
    expect(r.meta.selectedActionCount).toBe(r.meta.rawSelectedActionCount)
  })

  test('subset seçildiğinde fullPortfolioAmountTRY ≠ selectedPackageAmountTRY', () => {
    // Portföyde 3 aksiyon, sadece ilki yeterli
    setupRatingMock((ids) => (ids.has('A1') ? 'B' : 'C'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1',  5_000_000),   // tek başına yeterli
        makeAction('A2', 10_000_000),
        makeAction('A3', 15_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.fullPortfolioAmountTRY).toBe(30_000_000)   // 5+10+15 tüm portföy
    expect(r.meta.selectedPackageAmountTRY).toBe(5_000_000)  // sadece A1
    expect(r.meta.fullPortfolioAmountTRY).not.toBe(r.meta.selectedPackageAmountTRY)
    // totalAmountTRY geriye uyum alias'ı: seçilen paketle eşit
    expect(r.meta.totalAmountTRY).toBe(r.meta.selectedPackageAmountTRY)
  })

  test('A10 ve A10B ayrı prefix → displayActionCount=2', () => {
    // 'A10_CASH_EQUITY_INJECTION'         → split → 'A10'
    // 'A10B_PROMISSORY_NOTE_EQUITY_INJECTION' → split → 'A10B'
    // Farklı prefix → 2 UI kartı
    setupRatingMock((ids) => {
      if (ids.has('A10_CASH_EQUITY_INJECTION') && ids.has('A10B_PROMISSORY_NOTE_EQUITY_INJECTION')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A10_CASH_EQUITY_INJECTION', 10_000_000),
        makeAction('A10B_PROMISSORY_NOTE_EQUITY_INJECTION', 15_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.rawSelectedActionCount).toBe(2)
    expect(r.meta.displayActionCount).toBe(2)  // 'A10' ≠ 'A10B'
  })

  test('boş portföy → dört yeni alan tümü sıfır', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [],
      requestedTarget: 'B',
    })
    expect(r.meta.rawSelectedActionCount).toBe(0)
    expect(r.meta.displayActionCount).toBe(0)
    expect(r.meta.fullPortfolioAmountTRY).toBe(0)
    expect(r.meta.selectedPackageAmountTRY).toBe(0)
  })

  test('hedef ulaşılamaz fallback → fullPortfolioAmountTRY === selectedPackageAmountTRY', () => {
    setupRatingMock(() => 'C')   // hiçbir zaman hedefe ulaşmıyor
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1',  5_000_000),
        makeAction('A2', 10_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.rawSelectedActionCount).toBe(2)
    expect(r.meta.displayActionCount).toBe(2)
    expect(r.meta.fullPortfolioAmountTRY).toBe(15_000_000)
    expect(r.meta.selectedPackageAmountTRY).toBe(15_000_000)
    expect(r.meta.fullPortfolioAmountTRY).toBe(r.meta.selectedPackageAmountTRY)
  })
})

// ─── 13. TUTARSIZ KAYNAK (Faz 7.3.19) ────────────────────────────────────────
//
// decisionCurrentRating parametresi: iki rating kaynağı arasındaki çelişki tespiti.
// currentActualRating >= target ama decisionCurrentRating < target → inconsistentSources=true.

describe('selectTargetPackage — decisionCurrentRating tutarsız kaynak tespiti (Faz 7.3.19)', () => {

  // T13: Tutarsızlık — currentActualRating hedefte, decisionCurrentRating altında
  test('T13 — currentActualRating≥target ama decisionCurrentRating<target → inconsistentSources:true, tam portföy döner', () => {
    // Hiçbir mock gerekmez — erken çıkış calculateActualPostActionRating çağırmaz
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating:    'BB',   // >= 'B' → normal erken çıkış tetikler
      decisionCurrentRating:  'CCC',  // < 'B' → tutarsızlık tespiti
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2', 2_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.inconsistentSources).toBe(true)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.selectedActions).toHaveLength(2)         // tam portföy — boş değil
    expect(r.meta.warnings.length).toBeGreaterThan(0)
    expect(r.meta.warnings[0]).toMatch(/tutarsızlık/i)
  })

  // T14: Tutarlı — her iki kaynak da hedefin üstünde → normal boş paket
  test('T14 — her iki kaynak da hedefte → inconsistentSources:false, boş paket', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating:    'BB',   // >= 'B'
      decisionCurrentRating:  'A',    // >= 'B' → tutarlı
      portfolio: [makeAction('A1', 1_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.inconsistentSources).toBe(false)
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.selectedActions).toHaveLength(0)
    expect(r.meta.selectedActionCount).toBe(0)
  })

  // T15: decisionCurrentRating sağlanmadı → geriye uyumlu davranış (boş paket, reachedTarget true)
  test('T15 — decisionCurrentRating yok → geriye uyumlu: boş paket, inconsistentSources undefined/false', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating: 'BB',   // >= 'B'
      // decisionCurrentRating: undefined (sağlanmıyor)
      portfolio: [makeAction('A1', 1_000_000)],
      requestedTarget: 'B',
    })
    // Geriye uyumlu: erken çıkış, boş paket
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.selectedActions).toHaveLength(0)
    // inconsistentSources ya false ya da undefined — her ikisi de kabul edilir
    expect(r.meta.inconsistentSources).toBeFalsy()
  })
})
