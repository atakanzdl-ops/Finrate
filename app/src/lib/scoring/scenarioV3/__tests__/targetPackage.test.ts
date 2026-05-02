/**
 * Faz 7.3.8d — selectTargetPackage tests
 *
 * Edge case'ler ve algoritma doğrulamaları için
 * postActionRating helper'ı mock'lanır (deterministic kontrol).
 * DEKAM-benzeri progresif rating senaryoları da kapsanır.
 */

import { selectTargetPackage } from '../targetPackage'
import type { SelectedAction } from '../engineV3'
import * as postActionRatingModule from '../postActionRating'
import type { ActualRatingValidation } from '../postActionRating'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** Minimal SelectedAction fabrikası — testlerde sadece actionId/amount/transactions önemli. */
function makeAction(id: string, amount: number): SelectedAction {
  return {
    actionId:                   id,
    actionName:                 id,
    horizon:                    'short',
    amountTRY:                  amount,
    transactions:               [],
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

/** Mock validation üreten yardımcı — yalnız postActualRating kritik. */
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

const BASE_PARAMS = {
  initialBalances:       { '100': 1_000_000 },
  sector:                'inşaat',
  subjectiveTotal:       0,
  currentObjectiveScore: 33,
  currentCombinedScore:  33,
  currentActualRating:   'C',
  v3EstimatedRating:     'BB',
}

// ─── 1. Boş portföy ──────────────────────────────────────────────────────────

describe('selectTargetPackage — edge: boş portföy', () => {
  test('boş portfolio + hedef üstte → boş selectedActions, reachedTarget false', () => {
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

// ─── 2. Hedef = mevcut (eşit veya altında) ───────────────────────────────────

describe('selectTargetPackage — edge: hedef mevcut rating ile aynı/altında', () => {
  test('hedef = mevcut rating → boş paket, reachedTarget true', () => {
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

// ─── 3. İlk aksiyon hedefi tutuyor ───────────────────────────────────────────

describe('selectTargetPackage — ilk aksiyon hedefi tutuyor', () => {
  let spy: jest.SpyInstance

  afterEach(() => spy?.mockRestore())

  test('1. aksiyon BB üretiyor, hedef B → 1 aksiyon yeterli', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('BB'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 10_000_000),
        makeAction('A2', 5_000_000),
        makeAction('A3', 2_000_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A1')
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.fallback).toBe(false)
    expect(r.meta.achievedRating).toBe('BB')
    expect(r.meta.totalAmountTRY).toBe(10_000_000)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// ─── 4. Hedef ulaşılmıyor → tüm liste fallback ───────────────────────────────

describe('selectTargetPackage — hedef ulaşılmıyor', () => {
  let spy: jest.SpyInstance

  afterEach(() => spy?.mockRestore())

  test('tüm denemelerde rating hedefin altında → fallback = tüm liste', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValue(fakeValidation('CCC'))   // hep CCC, hedef B
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2', 500_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.achievedRating).toBe('CCC')
    expect(r.meta.warnings.length).toBeGreaterThan(0)
  })
})

// ─── 5. Geçersiz hedef ────────────────────────────────────────────────────────

describe('selectTargetPackage — geçersiz hedef', () => {
  test('geçersiz target → tüm liste fallback + warning', () => {
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       [makeAction('A1', 1_000_000)],
      requestedTarget: 'INVALID',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.meta.fallback).toBe(true)
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.warnings.length).toBeGreaterThan(0)
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

// ─── 6. Rating sıra kontrolü: achievedIdx >= targetIdx ────────────────────────

describe('selectTargetPackage — achievedIdx >= targetIdx kontrolü', () => {
  let spy: jest.SpyInstance

  afterEach(() => spy?.mockRestore())

  test('eşit rating de hedefi tutar (achievedIdx == targetIdx)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('B'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 1_000_000),
        makeAction('A2', 500_000),
      ],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.meta.reachedTarget).toBe(true)
  })

  test('üstü rating hedefi tutar (achievedIdx > targetIdx)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('BBB'))   // hedef B'nin çok üstü
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 1_000_000)],
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.meta.reachedTarget).toBe(true)
    expect(r.meta.achievedRating).toBe('BBB')
  })

  test('altı rating geçemez (achievedIdx < targetIdx)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValue(fakeValidation('CCC'))   // hedef B'nin altı
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 1_000_000)],
      requestedTarget: 'B',
    })
    expect(r.meta.reachedTarget).toBe(false)
    expect(r.meta.fallback).toBe(true)
  })
})

// ─── 7. DEKAM benzeri integration (progresif rating) ─────────────────────────

describe('selectTargetPackage — DEKAM-benzeri progresif paket', () => {
  /**
   * Senaryo: Mevcut C, 3 aday aksiyon var.
   * Mock olarak post-rating sırası: A1 → CCC, A1+A2 → B, A1+A2+A3 → BB
   *
   * Bekleniyor:
   *   hedef CCC → 1 aksiyon (minimal)
   *   hedef B   → 2 aksiyon
   *   hedef BB  → 3 aksiyon
   *
   * Çözüm öncesi sorun: 3'ü de tüm listeyi (3 aksiyon) gösteriyordu.
   */
  let spy: jest.SpyInstance

  afterEach(() => spy?.mockRestore())

  function dekamPortfolio(): SelectedAction[] {
    return [
      makeAction('A10', 38_500_000),
      makeAction('A19', 30_000_000),
      makeAction('A21', 24_000_000),
    ]
  }

  test('hedef CCC → 1 aksiyon (minimal subset)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('CCC'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'CCC',
    })
    expect(r.selectedActions).toHaveLength(1)
    expect(r.selectedActions[0].actionId).toBe('A10')
    expect(r.meta.achievedRating).toBe('CCC')
    expect(r.meta.totalAmountTRY).toBe(38_500_000)
  })

  test('hedef B → 2 aksiyon (orta paket)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('CCC'))
      .mockReturnValueOnce(fakeValidation('B'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'B',
    })
    expect(r.selectedActions).toHaveLength(2)
    expect(r.selectedActions.map(a => a.actionId)).toEqual(['A10', 'A19'])
    expect(r.meta.achievedRating).toBe('B')
    expect(r.meta.totalAmountTRY).toBe(38_500_000 + 30_000_000)
  })

  test('hedef BB → 3 aksiyon (tam paket)', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('CCC'))
      .mockReturnValueOnce(fakeValidation('B'))
      .mockReturnValueOnce(fakeValidation('BB'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio:       dekamPortfolio(),
      requestedTarget: 'BB',
    })
    expect(r.selectedActions).toHaveLength(3)
    expect(r.meta.achievedRating).toBe('BB')
    expect(r.meta.totalAmountTRY).toBe(92_500_000)
    expect(r.meta.fallback).toBe(false)
  })

  test('üç farklı hedef → üç farklı paket boyutu (regression guard)', () => {
    // Bu testi tek mock zinciriyle ardarda çağırarak doğrularız.
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      // hedef CCC denemesi: 1 çağrı
      .mockReturnValueOnce(fakeValidation('CCC'))
      // hedef B denemesi: 2 çağrı
      .mockReturnValueOnce(fakeValidation('CCC'))
      .mockReturnValueOnce(fakeValidation('B'))
      // hedef BB denemesi: 3 çağrı
      .mockReturnValueOnce(fakeValidation('CCC'))
      .mockReturnValueOnce(fakeValidation('B'))
      .mockReturnValueOnce(fakeValidation('BB'))

    const rCCC = selectTargetPackage({ ...BASE_PARAMS, portfolio: dekamPortfolio(), requestedTarget: 'CCC' })
    const rB   = selectTargetPackage({ ...BASE_PARAMS, portfolio: dekamPortfolio(), requestedTarget: 'B' })
    const rBB  = selectTargetPackage({ ...BASE_PARAMS, portfolio: dekamPortfolio(), requestedTarget: 'BB' })

    expect(rCCC.selectedActions.length).toBe(1)
    expect(rB.selectedActions.length).toBe(2)
    expect(rBB.selectedActions.length).toBe(3)
    // En önemli iddia: paketler farklı boyutta
    const sizes = new Set([rCCC.selectedActions.length, rB.selectedActions.length, rBB.selectedActions.length])
    expect(sizes.size).toBe(3)
  })
})

// ─── 8. Meta alanları konsistans ─────────────────────────────────────────────

describe('selectTargetPackage — meta alan tutarlılığı', () => {
  let spy: jest.SpyInstance

  afterEach(() => spy?.mockRestore())

  test('selectedActionCount = selectedActions.length, fullPortfolio sabit', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('CCC'))
      .mockReturnValueOnce(fakeValidation('B'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [
        makeAction('A1', 1),
        makeAction('A2', 2),
        makeAction('A3', 3),
      ],
      requestedTarget: 'B',
    })
    expect(r.meta.selectedActionCount).toBe(r.selectedActions.length)
    expect(r.meta.fullPortfolioActionCount).toBe(3)
  })

  test('totalAmountTRY = selectedActions amountTRY toplamı', () => {
    spy = jest
      .spyOn(postActionRatingModule, 'calculateActualPostActionRating')
      .mockReturnValueOnce(fakeValidation('B'))
    const r = selectTargetPackage({
      ...BASE_PARAMS,
      portfolio: [makeAction('A1', 7_000_000), makeAction('A2', 3_000_000)],
      requestedTarget: 'B',
    })
    const sum = r.selectedActions.reduce((s, a) => s + a.amountTRY, 0)
    expect(r.meta.totalAmountTRY).toBe(sum)
  })
})
