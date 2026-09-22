/**
 * Faz 7.3.8d-FIX2 / R3.3 — selectTargetPackage tests
 *
 * Bu suite şu kontratı doğrular:
 *   - Edge case'ler: boş, eşit/altında, geçersiz, ulaşılmaz
 *   - R3.3 sıralama: grup kapsama desc → |k-desiredMinK| asc → tutar asc → hedef yakınlığı
 *   - R3.3 desiredMinK: gap büyüdükçe daha büyük paket boyutu tercih edilir
 *   - fullPortfolio sırası alt küme içinde korunur
 *   - DEKAM senaryosu (Codex audit): kısa ID → 0 grup → tie-break korunur
 *   - N > 12 koruma: subset search atlanır
 *   - getCoveredGroups unit testleri
 *   - coveredGroupCount meta alanı
 *
 * Test stratejisi: postActionRating helper'ı `mockImplementation` ile
 * actionId'lere göre rating üretiyor — her alt küme için doğru rating dönüyor.
 *
 * R3.3 FIX (ADIM 1-3):
 *   ADIM 1: currentIdx = ratingToIndex(decisionCurrentRating ?? currentActualRating)
 *           SOURCE_MISMATCH erken çıkışı dead code (decisionCurrentRating<target → search çalışır)
 *   ADIM 2: runSubsetSearch(1, fullCount) tek çağrı — fallback kaldırıldı
 *   ADIM 3: compareCandidate gap-aware: kolay(≤1) → desiredMinK eşiği+az aksiyon; zor(≥2) → dist
 *   desiredMinK = f(targetGap): gap=0→1, gap=1→2, gap=2→4, gap=3→5, gap≥4→6
 *
 * BASE_PARAMS: currentActualRating='C' (idx=1).
 *   'CCC'=idx3 (gap=2→desiredMinK=4), 'B'=idx4 (gap=3→desiredMinK=5),
 *   'BB'=idx5 (gap=4→desiredMinK=6), 'BBB'=idx6 (gap=5→desiredMinK=6).
 *
 * ID konvansiyonu:
 *   - Mevcut testler (1-9): kısa ID ('A05') → getCoveredGroups=0 → tie-break
 *   - Diversity testleri (10-11): tam catalog ID ('A05_RECEIVABLE_COLLECTION')
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

// ─── 5. CARDINALITY / desiredMinK: R3.3 hedef-aware paket boyutu ──────────────
//
// R3.3: BASE_PARAMS currentActualRating='C' (idx=1) + requestedTarget='B' (idx=4)
// → gap=3 → desiredMinK = min(5, portfolioSize).
// Küçük portföylerde (≤5 aksiyon) desiredMinK portfolio boyutuna kaplandığından
// subset arama her zaman tam portföyü de içerir.

describe('selectTargetPackage — R3.3 hedef-aware cardinality', () => {
  test('R3.3: 2-aksiyon portföy, gap=3 → desiredMinK=2; tam portföy seçilir (A1+A2)', () => {
    // BASE_PARAMS: C→B gap=3 → desiredMinK=min(5,2)=2
    // Loop k=2: {A1,A2} → A2 dahil → 'BB' → feasible; tek aday → [A1,A2]
    setupRatingMock((ids) => {
      if (ids.has('A2')) return 'BB'
      if (ids.has('A1')) return 'CCC'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 50_000_000),
        makeAction('A2',  5_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)  // R3.3: desiredMinK=2, tam portföy
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A1', 'A2'])
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.totalAmountTRY).toBe(55_000_000)
    expect(r.meta.achievedRating).toBe('BB')
  })

  test('R3.3: 2-aksiyon portföy, iki tekli yeterli, gap=3 → tam portföy seçilir', () => {
    // desiredMinK=min(5,2)=2 → Loop k=2: {A1,A2} feasible → tek aday
    setupRatingMock((ids) => {
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
    expect(r.selectedActions).toHaveLength(2)  // R3.3: desiredMinK=2 → tam portföy
    expect(r.meta.totalAmountTRY).toBe(110_000_000)
  })

  test('R3.3 fallback: k=3 yok, k=1 adaylar bulunur → achievedIdx asc tiebreak', () => {
    // desiredMinK=min(5,3)=3; k=3 subsets all 'C' (mock: ids.size!==1 → C)
    // Fallback k=1..2: k=1 A1→BBB, A2→B, A3→BB; k=2 all C
    // compareCandidate (desiredMinK=3): groups=0 all, dist=|1-3|=2 same, amount=1M same
    // achievedIdx asc: B(4) < BB(5) < BBB(6) → A2 wins
    setupRatingMock((ids) => {
      if (ids.size !== 1) return 'C'
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
    // Fallback k=1: A2 (B == hedef, achievedIdx en küçük)
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A2')
    expect(r.meta.achievedRating).toBe('B')
  })

  test('R3.3: 3-aksiyon, k=3 feasible → tam portföy seçilir (desiredMinK=3)', () => {
    // desiredMinK=min(5,3)=3; k=3: {A1,A2,A3} → ids.size>=3 → 'B' → feasible
    setupRatingMock((ids) => {
      if (ids.size === 2 && ids.has('A1') && ids.has('A3')) return 'B'
      if (ids.size >= 3) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 30_000_000),
        makeAction('A2', 50_000_000),
        makeAction('A3', 20_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(3)  // R3.3: k=3 tam portföy
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A1', 'A2', 'A3'])
    expect(r.meta.totalAmountTRY).toBe(100_000_000)
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

// ─── 7. DEKAM SENARYOSU (Codex audit referansı + R3.3 güncelleme) ────────────

describe('selectTargetPackage — DEKAM senaryosu (Codex audit / R3.3)', () => {
  /**
   * Engine sırası: A05 → A06 → A19 → A04 → A18 → A12 → A10
   * DEKAM mock:
   *   A10 tek (38.5 Mn)         → CCC
   *   A19 + A10 (68 Mn)         → B
   *   Tam paket (92.5 Mn, 7 aks) → BB
   *
   * BASE_PARAMS: currentActualRating='C' (idx=1)
   * R3.3 hedef-aware desiredMinK (kısa ID → getCoveredGroups=0 → grup tiebreak yok):
   *   CCC hedef (idx=3): gap=2 → desiredMinK=4 → ilk pass k=4..7 → sadece k=7 (BB) feasible
   *   B hedef   (idx=4): gap=3 → desiredMinK=5 → ilk pass k=5..7 → sadece k=7 (BB) feasible
   *   BB hedef  (idx=5): gap=4 → desiredMinK=6 → ilk pass k=6..7 → sadece k=7 (BB) feasible
   *
   * R3.3 davranışı: 3 hedef de tam portföyü seçer.
   * Bu beklenen davranış — büyük sıçramalarda tek/çift aksiyonlu paket anlamsız.
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

  function dekamRating(ids: Set<string>): string {
    if (ids.size === 7) return 'BB'                                              // Tam paket
    if (ids.size === 2 && ids.has('A19') && ids.has('A10')) return 'B'           // A19+A10
    if (ids.size === 1 && ids.has('A10')) return 'CCC'                           // A10 tek
    return 'C'
  }

  test('R3.3 fix — hedef CCC: k=1..7 tam tarama; gap=2 ZOR HEDEF, desiredMinK=4 → {A19,A10}(dist=2) kazanır', () => {
    // C(1)→CCC(3): gap=2 → desiredMinK=4; k=1..7 tam tarama (ADIM 2 fix)
    // Feasible: k=1 {A10}→CCC(dist|1-4|=3), k=2 {A19,A10}→B≥CCC(dist|2-4|=2), k=7→BB(dist|7-4|=3)
    // ZOR HEDEF (gap≥2): groups(0=tie) → dist asc: k=2 kazanır (dist=2)
    setupRatingMock(dekamRating)
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'CCC',
    })
    expect(r.selectedActions).toHaveLength(2)       // {A19,A10} — dist=2 kazanır
    expect(r.meta.achievedRating).toBe('B')          // B ≥ CCC hedef
    expect(r.meta.totalAmountTRY).toBe(68_500_000)  // 30M + 38.5M
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.fallback).toBe(false)
  })

  test('R3.3 — hedef B: gap=3 → desiredMinK=5 → k=5..7 aramada k=7 (BB) seçilir', () => {
    // C(1)→B(4): gap=3 → desiredMinK=5; k=5..7: sadece k=7 feasible (BB≥B)
    setupRatingMock(dekamRating)
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(7)
    expect(r.meta.achievedRating).toBe('BB')
    expect(r.meta.totalAmountTRY).toBe(92_500_000)
  })

  test('R3.3 — hedef BB: gap=4 → desiredMinK=6 → k=6..7 aramada k=7 (BB) seçilir', () => {
    // C(1)→BB(5): gap=4 → desiredMinK=6; k=6..7: sadece k=7 feasible (BB≥BB)
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

  test('R3.3 fix — regression guard: CCC→k=2(dist=2), B/BB→k=7(dist=2/1)', () => {
    // R3.3 fix (ADIM 2): k=1..7 tam tarama; seçim distance-a göre
    // CCC(gap=2, desiredMinK=4): feasible {A19,A10}(dist=2) < k=7(dist=3) → size=2
    // B  (gap=3, desiredMinK=5): feasible {A19,A10}→B(dist=3) < k=7→BB(dist=2) → size=7
    // BB (gap=4, desiredMinK=6): sadece k=7 feasible → size=7
    setupRatingMock(dekamRating)
    const sizes = (['CCC', 'B', 'BB'] as const).map(t => {
      const r = selectTargetPackage({
        ...BASE_PARAMS,
        portfolio:       dekamPortfolio(),
        requestedTarget: t,
      })
      return r.selectedActions.length
    })
    expect(sizes).toEqual([2, 7, 7])
  })

  test('R3.3 — fallback demo: sadece k=1 feasible ise fallback devreye girer', () => {
    // Senaryo: k≥desiredMinK'de hiç feasible yok → fallback k=1..desiredMinK-1 → {A10} bulunur
    // currentRating='B' (idx=4), target='BB' (idx=5) → gap=1 → desiredMinK=2
    // mock: sadece A10 tek başına feasible, 2+ aksiyon C
    setupRatingMock((ids) => {
      if (ids.size === 1 && ids.has('A10')) return 'BB'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating: 'B',
      portfolio: dekamPortfolio(),
      requestedTarget: 'BB',
    })
    // desiredMinK=2; k=2..7 → C; fallback k=1 → {A10}(BB) found
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10')
    expect(r.meta.achievedRating).toBe('BB')
    expect(r.meta.reachedTarget).toBe(true)
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

  test('R3.3: 12 aksiyon → subset search uygulanır (sınırın altında); desiredMinK=5 → k=5 subset seçilir', () => {
    // BASE_PARAMS C→B gap=3 → desiredMinK=min(5,12)=5
    // mock: A0 varsa B döner; k=5 subset {A0,A1,A2,A3,A4} first lex feasible
    setupRatingMock((ids) => (ids.has('A0') ? 'B' : 'C'))
    const portfolio = Array.from({ length: 12 }, (_, i) =>
      makeAction(`A${i}`, 1_000_000),
    )
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio,
      requestedTarget: 'B',
    })
    // R3.3: desiredMinK=5 → k=5 subset seçilir (A0 dahil)
    expect(r.selectedActions).toHaveLength(5)
    expect(r.selectedActions.some(a => a.actionId === 'A0')).toBe(true)
    expect(r.meta.fallback).toBe(false)
    expect(r.meta.reachedTarget).toBe(true)
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
//
// R3.3 NOT: 2-aksiyon portföylerde desiredMinK=min(5,2)=2, yani loop k=2 başlar.
// Tek-aksiyon adaylar için fallback (k=1) gereklidir (k>=2'de feasible yok ise).

describe('selectTargetPackage — diversity önceliği (tam catalog ID)', () => {
  test('R3.3: 2-aksiyon portföy, gap=3 → desiredMinK=2; k=2 tam portföy seçilir; coveredGroupCount=2', () => {
    // Her iki aksiyon tek başına yeterli ama desiredMinK=2 olduğundan k=2 subset bulunur.
    // {A11,A10}: LEVERAGE ∪ (LEVERAGE+LIQUIDITY) = {LEVERAGE,LIQUIDITY} = 2 grup
    setupRatingMock((ids) => {
      if (ids.has('A11_RETAIN_EARNINGS') || ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A11_RETAIN_EARNINGS', 10_000_000),
        makeAction('A10_CASH_EQUITY_INJECTION', 15_000_000),
      ],
      requestedTarget: 'B',
    })
    // R3.3: desiredMinK=2 → k=2 tek aday → [A11,A10]
    expect(r.selectedActions).toHaveLength(2)
    expect(r.meta.coveredGroupCount).toBe(2)
    expect(r.meta.reachedTarget).toBe(true)
  })

  test('R3.3 fallback: 3-aksiyon, k=3 infeasible → fallback k=1..2; diversity öncelikli — [A05,A18]', () => {
    // desiredMinK=min(5,3)=3; k=3 → C (mock: size=1 A10 or size=2 A05+A18 only)
    // Fallback k=1..2: {A10}(2 grup), {A05,A18}(3 grup) feasible
    // compareCandidate: grup desc → A05+A18 (3 grup) > A10 (2 grup) wins
    setupRatingMock((ids) => {
      if (ids.size === 1 && ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      if (ids.size === 2 && ids.has('A05_RECEIVABLE_COLLECTION') && ids.has('A18_NET_SALES_GROWTH')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A05_RECEIVABLE_COLLECTION', 5_000_000),
        makeAction('A18_NET_SALES_GROWTH', 10_000_000),
        makeAction('A10_CASH_EQUITY_INJECTION', 38_500_000),
      ],
      requestedTarget: 'B',
    })
    // Fallback: 3-grup [A05,A18] diversity önceliği sayesinde kazanır
    expect(r.selectedActions.map(a => a.actionId)).toEqual([
      'A05_RECEIVABLE_COLLECTION',
      'A18_NET_SALES_GROWTH',
    ])
    expect(r.meta.coveredGroupCount).toBe(3)
  })

  test('R3.3: 3-aksiyon, k=3 feasible (A10 dahil) → tam portföy; grup birleşimi', () => {
    // desiredMinK=3; k=3: ids.has('A10') → 'B' → feasible (tam portföy)
    // coveredGroupCount: {A01}(LEVERAGE+LIQUIDITY) ∪ {A04}(LEVERAGE+LIQUIDITY) ∪ {A10}(LEVERAGE+LIQUIDITY) = 2
    setupRatingMock((ids) => {
      if (ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      if (ids.has('A01_ST_FIN_DEBT_TO_LT') && ids.has('A04_CASH_PAYDOWN_ST')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A01_ST_FIN_DEBT_TO_LT', 20_000_000),
        makeAction('A04_CASH_PAYDOWN_ST', 15_000_000),
        makeAction('A10_CASH_EQUITY_INJECTION', 30_000_000),
      ],
      requestedTarget: 'B',
    })
    // R3.3: k=3 tam portföy feasible → seçilir
    expect(r.selectedActions).toHaveLength(3)
    expect(r.meta.coveredGroupCount).toBe(2)  // 3 aksiyon hepsi LEVERAGE+LIQUIDITY
  })

  test('R3.3: 2-aksiyon, desiredMinK=2 → tam portföy; tutar alanları tutarlı', () => {
    // A01 ve A10 tek başına yeterli ama desiredMinK=2 → k=2 {A01,A10} seçilir
    setupRatingMock((ids) => {
      if (ids.has('A01_ST_FIN_DEBT_TO_LT') || ids.has('A10_CASH_EQUITY_INJECTION')) return 'B'
      return 'C'
    })
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A01_ST_FIN_DEBT_TO_LT', 50_000_000),
        makeAction('A10_CASH_EQUITY_INJECTION', 30_000_000),
      ],
      requestedTarget: 'B',
    })
    // R3.3: k=2 tek aday → [A01,A10]; tutar=80M
    expect(r.selectedActions).toHaveLength(2)
    expect(r.meta.totalAmountTRY).toBe(80_000_000)
    expect(r.meta.coveredGroupCount).toBe(2)  // LEVERAGE+LIQUIDITY
  })

  test('4 grup kapsayan paket → coveredGroupCount=4', () => {
    // A10: LEVERAGE+LIQUIDITY  |  A18: PROFITABILITY+ACTIVITY  → 4 grup birlikte
    // desiredMinK=min(5,2)=2 → k=2: {A10,A18} → both present → 'B' → feasible
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

  test('R3.3 — subset seçildiğinde fullPortfolioAmountTRY ≠ selectedPackageAmountTRY (gap=1 senaryo)', () => {
    // R3.3: gap=1 (BB→BBB) → desiredMinK=2; 3-aksiyon portföy → k=2 subset seçilir
    // mock: A1 varsa 'BBB'; A1+A2 (k=2) → 'BBB' → feasible; A1+A3 → 'BBB' → feasible
    // compareCandidate (desiredMinK=2): k=2 dist=0, groups=0 (kısa ID), amount → A1+A2 (15M) < A1+A3 (20M)
    setupRatingMock((ids) => (ids.has('A1') ? 'BBB' : 'C'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating: 'BB',    // gap: BB(5)→BBB(6)=1 → desiredMinK=2
      portfolio: [
        makeAction('A1',  5_000_000),
        makeAction('A2', 10_000_000),
        makeAction('A3', 15_000_000),
      ],
      requestedTarget: 'BBB',
    })
    expect(r.meta.fullPortfolioAmountTRY).toBe(30_000_000)     // 5+10+15 tüm portföy
    expect(r.meta.selectedPackageAmountTRY).toBe(15_000_000)   // A1+A2 (k=2 en ucuz)
    expect(r.meta.fullPortfolioAmountTRY).not.toBe(r.meta.selectedPackageAmountTRY)
    // totalAmountTRY geriye uyum alias'ı: seçilen paketle eşit
    expect(r.meta.totalAmountTRY).toBe(r.meta.selectedPackageAmountTRY)
    expect(r.selectedActions).toHaveLength(2)
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

  // T13: R3.3 ADIM 1 — decisionCurrentRating currentIdx'i sürer, SOURCE_MISMATCH erken çıkışı artık yok
  test('T13 — R3.3 ADIM 1: decisionCurrentRating<target ≤ currentActualRating → subset search çalışır, NOT_REACHED', () => {
    // ADIM 1: currentIdx = ratingToIndex(decisionCurrentRating ?? currentActualRating)
    // decisionCurrentRating='CCC'(3) < target='B'(4) → erken çıkış TETİKLENMİYOR
    // Subset search çalışır; mock → C → NOT_REACHED (hiçbir subset feasible değil)
    setupRatingMock(() => 'C')
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating:    'BB',   // currentActualRating >= 'B' ama artık currentIdx için kullanılmıyor
      decisionCurrentRating:  'CCC',  // currentIdx = ratingToIndex('CCC')=3 < targetIdx('B')=4
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2', 2_000_000),
      ],
      requestedTarget: 'B',
    })
    // ADIM 1 davranışı: erken çıkış yok → subset search çalışır → NOT_REACHED
    expect(r.meta.status).toBe('NOT_REACHED')
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.inconsistentSources).toBeFalsy()    // SOURCE_MISMATCH erken çıkışı dead code
    expect(r.selectedActions).toHaveLength(2)          // NOT_REACHED → tam portföy fallback
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

// ─── 14. STATUS ENUM (Faz 7.3.20) ────────────────────────────────────────────
//
// Her return noktasının doğru status ürettiğini doğrular.
// reachedTarget / inconsistentSources alanları geriye uyum için korunur.

describe('selectTargetPackage — status enum (Faz 7.3.20)', () => {

  // T16: Optimal subset bulundu → REACHED
  test('T16 — subset bulundu → status: REACHED, reachedTarget: true', () => {
    setupRatingMock((ids) => (ids.has('A1') ? 'B' : 'C'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [makeAction('A1', 1_000_000), makeAction('A2', 2_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.status).toBe('REACHED')
    expect(r.meta.reachedTarget).toBe(true)    // geriye uyum
    expect(r.meta.fallback).toBe(false)
  })

  // T17: Hiçbir subset hedefi tutamadı → NOT_REACHED
  test('T17 — subset yok → status: NOT_REACHED, reachedTarget: false', () => {
    setupRatingMock(() => 'C')  // hiçbir kombinasyon B'ye ulaşamıyor
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [makeAction('A1', 1_000_000), makeAction('A2', 2_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.status).toBe('NOT_REACHED')
    expect(r.meta.reachedTarget).toBe(false)   // geriye uyum
    expect(r.meta.fallback).toBe(true)
    // Gerçek ulaşılamama: achievedRating hedefin altında
    expect(r.meta.achievedRating).toBeDefined()
  })

  // T18: R3.3 ADIM 1 — decisionCurrentRating<target → SOURCE_MISMATCH artık NOT_REACHED döner
  test('T18 — R3.3 ADIM 1: decisionCurrentRating<target → status: NOT_REACHED (SOURCE_MISMATCH dead code)', () => {
    // ADIM 1: currentIdx uses decisionCurrentRating → erken çıkış tetiklenmez → subset search
    // Mock: hiçbir kombinasyon B'ye ulaşamıyor → NOT_REACHED
    setupRatingMock(() => 'C')
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      currentActualRating:   'BB',   // artık currentIdx için kullanılmıyor
      decisionCurrentRating: 'CCC',  // currentIdx=3 < targetIdx('B')=4 → search çalışır
      portfolio:             [makeAction('A1', 1_000_000)],
      requestedTarget:       'B',
    })
    // ADIM 1 davranışı: SOURCE_MISMATCH erken çıkışı dead code → NOT_REACHED
    expect(r.meta.status).toBe('NOT_REACHED')
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.inconsistentSources).toBeFalsy()   // SOURCE_MISMATCH artık set edilmiyor
    expect(r.meta.fallback).toBe(true)
    expect(r.selectedActions).toHaveLength(1)         // NOT_REACHED → tam portföy fallback
  })

  // T19: N > SUBSET_SEARCH_LIMIT → FALLBACK (arama atlandı)
  test('T19 — N>12 → status: FALLBACK', () => {
    jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValue(fakeValidation('B'))
    const portfolio = Array.from({ length: 13 }, (_, i) =>
      makeAction(`A${i}`, 1_000_000),
    )
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio,
      requestedTarget: 'B',
    })
    expect(r.meta.status).toBe('FALLBACK')
    expect(r.meta.fallback).toBe(true)  // geriye uyum
  })
})
