/**
 * Faz 7.3.8d-FIX — selectTargetPackage tests (minimum-cardinality alt küme araması)
 *
 * Bu suite şu kontratı doğrular:
 *   - Edge case'ler: boş, eşit/altında, geçersiz, ulaşılmaz
 *   - Optimal seçim: en az aksiyon → en düşük tutar → en yakın hedef
 *   - fullPortfolio sırası alt küme içinde korunur
 *   - DEKAM senaryosu (Codex audit): A10 tek başına CCC, A19+A10 → B, tam paket → BB
 *   - N > 12 koruma: subset search atlanır
 *
 * Test stratejisi: postActionRating helper'ı `mockImplementation` ile
 * actionId'lere göre rating üretiyor — her alt küme için doğru rating dönüyor.
 * Bu, alt küme arama mantığının deterministic doğrulamasını sağlar.
 */

import { selectTargetPackage } from '../targetPackage'
import type { SelectedAction } from '../engineV3'
import * as postActionRatingModule from '../postActionRating'
import type { ActualRatingValidation } from '../postActionRating'

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
