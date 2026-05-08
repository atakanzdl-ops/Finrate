/**
 * canonicalOutcome — Faz 7.3.47 indirect testler
 *
 * buildCanonicalOutcome export edilmez.
 * buildDecisionAnswer üzerinden INDIRECT test edilir.
 *
 * T1: engine+validation uyumlu (BB+BB) → consensus, HIGH
 * T2: engine=false (CCC) + validation=BB → engine kazanır, MEDIUM (ENES senaryosu)
 * T3: engine=true (BB) + validation=CCC → engine kazanır, MEDIUM
 * T4: canonicalOutcome.isFeasible = executiveAnswer.targetMatchesRequest (3 sekme tutarlı)
 * T5: achievable='CCC' → oneNotchPlan ve twoNotchPlan isAchievable=false (smart kapı)
 * T6: achievable='BB', requested='BBB' → B planı TRUE (B≤BB), BB planı TRUE (BB≤BB)
 * T7: engine=false + packageReached=true → engine kazanır, isFeasible=false (Faz 7.3.47 Hotfix)
 * T8: ENES/DEKAM 2024 regresyon — engine=CCC + packageReached=true → engine kazanır
 * T9: engine=false + packageReached=false → her iki kaynak uyumlu → consensus, HIGH
 * T10: engine=true + packageReached=false → çelişki → engine, MEDIUM
 */

import { buildDecisionAnswer } from '../decisionLayer'
import type { EngineResult } from '../engineV3'
import type { RatingGrade } from '../ratingReasoning'
import type { ActualRatingValidation } from '../postActionRating'

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function makeER(opts: {
  currentRating?:     RatingGrade
  finalTargetRating?: RatingGrade
  confidence?:        'HIGH' | 'MEDIUM' | 'LOW'
  notchesGained?:     number
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
    horizons: {
      short:  { actions: [], totalImpact: 0 },
      medium: { actions: [], totalImpact: 0 },
      long:   { actions: [], totalImpact: 0 },
    },
    portfolio:  [],
    reasoning: {
      bindingCeiling:      null,
      supportingCeilings:  [],
      drivers:             null,
      missedOpportunities: [],
      oneNotchScenario:    { isAchievable: true, requiredActions: [], blockedBy: null, narrative: '' },
      twoNotchScenario:    { isAchievable: true, requiredActions: [], blockedBy: null, narrative: '' },
      sensitivityAnalysis: null,
      bankerSummary:       '',
      transition:          null,
    },
    layerSummaries: { productivity: null, sustainability: null, sector: null, guardrails: [] },
    decisionTrace: [],
  } as unknown as EngineResult
}

function makeValidation(postActualRating: RatingGrade): ActualRatingValidation {
  return {
    ledgerApplied:         true,
    isEstimateConfirmed:   true,
    warnings:              [],
    currentObjectiveScore: 20,
    postObjectiveScore:    40,
    subjectiveTotal:       10,
    currentCombinedScore:  25,
    postCombinedScore:     45,
    currentActualRating:   'B',
    postActualRating,
    v3EstimatedRating:     postActualRating,
  }
}

/** buildDecisionAnswer wrapper — targetPackageContext olmadan (T1-T4) */
function bda(er: EngineResult, requested: RatingGrade, validation?: ActualRatingValidation | null) {
  return buildDecisionAnswer(er, requested, null, undefined, undefined, validation ?? null)
}

/** buildDecisionAnswer wrapper — targetPackageContext ile (T7-T10) */
function bdaWithContext(
  er:       EngineResult,
  requested: RatingGrade,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx:      any,
) {
  return buildDecisionAnswer(er, requested, null, {}, undefined, null, ctx)
}

// ─── T1: engine + validation uyumlu → consensus, HIGH ────────────────────────

describe('T1 — consensus: engine=true(BB), validation=BB → authority=consensus, confidence=HIGH', () => {
  const er = makeER({ finalTargetRating: 'BB', confidence: 'HIGH' })
  const val = makeValidation('BB')

  test('canonicalOutcome.isFeasible = true', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.isFeasible).toBe(true)
  })

  test('authority = consensus', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.authority).toBe('consensus')
  })

  test('confidence = HIGH', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.confidence).toBe('HIGH')
  })

  test('achievableRating = BB', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.achievableRating).toBe('BB')
  })
})

// ─── T2: ENES 2024 — engine=false(CCC), validation=BB → engine kazanır ───────

describe('T2 — ENES senaryosu: engine=CCC (isFeasible=false), validation=BB → engine kazanır', () => {
  // Engine sadece CCC'ye ulaşabiliyor; validation daha iyimser
  const er = makeER({ finalTargetRating: 'CCC', confidence: 'MEDIUM' })
  const val = makeValidation('BB')   // validation BB diyor

  test('canonicalOutcome.isFeasible = false (engine=CCC < BB)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.isFeasible).toBe(false)
  })

  test('achievableRating = CCC (engine finalTargetRating)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.achievableRating).toBe('CCC')
  })

  test('authority = engine (çelişki — engine kazanır)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.authority).toBe('engine')
  })

  test('confidence = MEDIUM (çelişki var)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.confidence).toBe('MEDIUM')
  })
})

// ─── T3: engine=true(BB), validation=CCC → engine kazanır ───────────────────

describe('T3 — engine=BB (isFeasible=true), validation=CCC → engine kazanır, MEDIUM', () => {
  const er = makeER({ finalTargetRating: 'BB' })
  const val = makeValidation('CCC')   // validation CCC diyor (kötümser)

  test('canonicalOutcome.isFeasible = true (engine kazanır)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.isFeasible).toBe(true)
  })

  test('achievableRating = BB', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.achievableRating).toBe('BB')
  })

  test('authority = engine (çelişki)', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.authority).toBe('engine')
  })

  test('confidence = MEDIUM', () => {
    const da = bda(er, 'BB', val)
    expect(da.canonicalOutcome.confidence).toBe('MEDIUM')
  })
})

// ─── T4: 3 sekme tutarlılık — canonicalOutcome == executiveAnswer ─────────────

describe('T4 — 3 sekme tutarlılık: canonicalOutcome.isFeasible = executiveAnswer.targetMatchesRequest', () => {

  test('feasible senaryoda her iki alan da true', () => {
    const er = makeER({ finalTargetRating: 'BB' })
    const da = bda(er, 'BB')
    expect(da.canonicalOutcome.isFeasible).toBe(true)
    expect(da.executiveAnswer.targetMatchesRequest).toBe(true)
    expect(da.canonicalOutcome.isFeasible).toBe(da.executiveAnswer.targetMatchesRequest)
  })

  test('infeasible senaryoda her iki alan da false', () => {
    const er = makeER({ finalTargetRating: 'CCC' })
    const da = bda(er, 'BB')
    expect(da.canonicalOutcome.isFeasible).toBe(false)
    expect(da.executiveAnswer.targetMatchesRequest).toBe(false)
    expect(da.canonicalOutcome.isFeasible).toBe(da.executiveAnswer.targetMatchesRequest)
  })

  test('targetFeasibilityExplanation ile tutarlı: feasible → "ulaşılamıyor" yok', () => {
    const er = makeER({ finalTargetRating: 'BB' })
    const da = bda(er, 'BB')
    expect(da.canonicalOutcome.isFeasible).toBe(true)
    expect(da.targetFeasibilityExplanation).not.toContain('ulaşılamıyor')
  })

  test('targetFeasibilityExplanation ile tutarlı: infeasible → "ulaşılamıyor" var', () => {
    const er = makeER({ finalTargetRating: 'CCC' })
    const da = bda(er, 'BB')
    expect(da.canonicalOutcome.isFeasible).toBe(false)
    expect(da.targetFeasibilityExplanation).toContain('ulaşılamıyor')
  })
})

// ─── T5: smart kapı — achievable=CCC, B- ve B planları false ─────────────────

describe('T5 — smart kapı: achievable=CCC → B- ve B planları isAchievable=false', () => {
  // RATING_ORDER: CCC(0) < B-(1) < B(2) < BB(3) < BBB(4) < A(5) < AA(6) < AAA(7)
  // current=CCC(0), finalTargetRating=CCC(0), requestedTarget=BB(3)
  // oneNotchPlan targetRating: RATING_ORDER[1] = 'B-' → B-(1) > CCC(0) → gate false
  // twoNotchPlan targetRating: RATING_ORDER[2] = 'B'  → B(2)  > CCC(0) → gate false
  const er = makeER({ currentRating: 'CCC', finalTargetRating: 'CCC', notchesGained: 0 })

  test('canonicalOutcome.achievableRating = CCC', () => {
    const da = bda(er, 'BB')
    expect(da.canonicalOutcome.achievableRating).toBe('CCC')
  })

  test('oneNotchPlan.isAchievable = false (B- > CCC)', () => {
    const da = bda(er, 'BB')
    expect(da.oneNotchPlan.isAchievable).toBe(false)
  })

  test('twoNotchPlan.isAchievable = false (B > CCC)', () => {
    const da = bda(er, 'BB')
    expect(da.twoNotchPlan.isAchievable).toBe(false)
  })
})

// ─── T6: smart kapı — achievable=BB, requested=BBB → B ve BB planları true ───

describe('T6 — smart kapı: achievable=BB, requested=BBB → B ve BB planları TRUE', () => {
  // RATING_ORDER: D(0) C(1) CC(2) CCC(3) B(4) BB(5) BBB(6) A(7) AA(8) AAA(9)
  // 'B-' normalize → 'B'(4); B+2=BBB(6) > achievable BB(5) → gate yanlış açılır.
  // Doğru current: CCC(3) → +1=B(4) ≤ BB(5) ✓; +2=BB(5) ≤ BB(5) ✓
  // current=CCC(3), finalTargetRating=BB(5), requestedTarget=BBB(6)
  // engineFeasible: BB(5) >= BBB(6) → false
  // canonicalOutcome.achievableRating = BB
  // oneNotchPlan targetRating: RATING_ORDER[4] = 'B' → B(4) <= BB(5) → gate TRUE ✓
  // twoNotchPlan targetRating: RATING_ORDER[5] = 'BB' → BB(5) <= BB(5) → gate TRUE ✓
  const er = makeER({ currentRating: 'CCC', finalTargetRating: 'BB', notchesGained: 1 })

  test('canonicalOutcome.achievableRating = BB', () => {
    const da = bda(er, 'BBB')
    expect(da.canonicalOutcome.achievableRating).toBe('BB')
  })

  test('canonicalOutcome.isFeasible = false (BB < BBB)', () => {
    const da = bda(er, 'BBB')
    expect(da.canonicalOutcome.isFeasible).toBe(false)
  })

  test('oneNotchPlan.isAchievable = true (B ≤ BB)', () => {
    const da = bda(er, 'BBB')
    expect(da.oneNotchPlan.isAchievable).toBe(true)
  })

  test('twoNotchPlan.isAchievable = true (BB ≤ BB)', () => {
    const da = bda(er, 'BBB')
    expect(da.twoNotchPlan.isAchievable).toBe(true)
  })
})

// ─── T7: engine authority — packageReached diagnostic, engine kazanır ──────

describe('T7 — engine authority: engine=B (B<BB), packageReached=true → engine kazanır, isFeasible=false', () => {
  // Faz 7.3.47 Hotfix: isFeasible = engineFeasible (sadece).
  // engine: finalTargetRating=B < requestedTarget=BB → engineFeasible=false
  // targetPackageContext: currentActualRating='BB' >= requestedTarget='BB'
  //   → selectTargetPackage'de currentIdx(BB=5) >= targetIdx(BB=5) → reachedTarget=true
  // → packageReached=true (secondary, çelişki) → authority='engine', MEDIUM
  // → isFeasible = engineFeasible = false (semantic guardrail korunur)
  const er = makeER({ currentRating: 'B-', finalTargetRating: 'B', notchesGained: 1 })
  const ctx = {
    sector:                'İMALAT',
    subjectiveTotal:       0,
    currentObjectiveScore: 50,
    currentCombinedScore:  55,
    currentActualRating:   'BB',
    decisionCurrentRating: 'BB',
  }

  test('targetPackageMeta.reachedTarget = true (score.ts: zaten BB seviyesinde — diagnostic korunur)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.targetPackageMeta?.reachedTarget).toBe(true)
  })

  test('canonicalOutcome.isFeasible = false (engine kazanır, semantic guardrail)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.isFeasible).toBe(false)
  })

  test('canonicalOutcome.authority = engine (çelişki: engine=false, package=true)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.authority).toBe('engine')
  })

  test('canonicalOutcome.confidence = MEDIUM (çelişki)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.confidence).toBe('MEDIUM')
  })

  test('executiveAnswer.targetMatchesRequest = false (canonicalOutcome ile senkron)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.executiveAnswer.targetMatchesRequest).toBe(false)
  })

  test('targetFeasibilityExplanation "ulaşılamıyor" içerir (engine kararı)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.targetFeasibilityExplanation).toContain('ulaşılamıyor')
  })
})

// ─── T8: ENES/DEKAM 2024 regresyon — engine=CCC + packageReached=true → engine kazanır

describe('T8 — ENES/DEKAM 2024 regresyon: engine=CCC + packageReached=true → engine kazanır', () => {
  // engine.finalTargetRating=CCC < requested=BB → engineFeasible=false
  // ctx.currentActualRating='BB' >= 'BB' → selectTargetPackage: reachedTarget=true
  // Semantic guardrail (ör. PRODUCTIVITY tavanı) CCC'de kilitliyor — engine kazanır
  const er = makeER({ currentRating: 'CCC', finalTargetRating: 'CCC', notchesGained: 0 })
  const ctx = {
    sector:                'İMALAT',
    subjectiveTotal:       0,
    currentObjectiveScore: 50,
    currentCombinedScore:  55,
    currentActualRating:   'BB',
    decisionCurrentRating: 'BB',
  }

  test('canonicalOutcome.isFeasible = false (engine kazanır)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.isFeasible).toBe(false)
  })

  test('canonicalOutcome.achievableRating = CCC (engine)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.achievableRating).toBe('CCC')
  })

  test('canonicalOutcome.authority = engine (semantic guardrail ezdirmiyor)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.authority).toBe('engine')
  })

  test('canonicalOutcome.confidence = MEDIUM (çelişki)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.canonicalOutcome.confidence).toBe('MEDIUM')
  })

  test('targetPackageMeta.reachedTarget = true (diagnostic — korunur)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.targetPackageMeta?.reachedTarget).toBe(true)
  })

  test('executiveAnswer.targetMatchesRequest = false (canonical ile senkron)', () => {
    const da = bdaWithContext(er, 'BB', ctx)
    expect(da.executiveAnswer.targetMatchesRequest).toBe(false)
  })
})

// ─── T9: engine=false + packageReached=false → her ikisi de hayır → consensus, HIGH

describe('T9 — iki kaynak da ulaşılamaz: engine=CCC + packageReached=false → consensus, HIGH', () => {
  // ctx.currentActualRating='B' < requestedTarget='BB' → selectTargetPackage çalışır
  // engine.portfolio=[] (boş) → NOT_REACHED → reachedTarget=false
  // engineFeasible=false, secondaryFeasible=false → uyumlu → consensus, HIGH
  const er = makeER({ currentRating: 'CCC', finalTargetRating: 'CCC', notchesGained: 0 })
  const ctxNearMiss = {
    sector:                'İMALAT',
    subjectiveTotal:       0,
    currentObjectiveScore: 20,
    currentCombinedScore:  25,
    currentActualRating:   'B',
    decisionCurrentRating: 'B',
  }

  test('canonicalOutcome.isFeasible = false', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.isFeasible).toBe(false)
  })

  test('authority = consensus (her iki kaynak da ulaşılamıyor diyor)', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.authority).toBe('consensus')
  })

  test('confidence = HIGH', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.confidence).toBe('HIGH')
  })
})

// ─── T10: engine=true + packageReached=false → çelişki → engine, MEDIUM ────

describe('T10 — engine ulaşılabilir, package hayır: engine=BB + packageReached=false → engine, MEDIUM', () => {
  // engine.finalTargetRating=BB >= requestedTarget=BB → engineFeasible=true
  // ctx.currentActualRating='B' < 'BB', engine.portfolio=[] → reachedTarget=false
  // engineFeasible=true, secondaryFeasible=false → çelişki → engine, MEDIUM
  const er = makeER({ currentRating: 'CCC', finalTargetRating: 'BB', notchesGained: 1 })
  const ctxNearMiss = {
    sector:                'İMALAT',
    subjectiveTotal:       0,
    currentObjectiveScore: 20,
    currentCombinedScore:  25,
    currentActualRating:   'B',
    decisionCurrentRating: 'B',
  }

  test('canonicalOutcome.isFeasible = true (engine kazanır)', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.isFeasible).toBe(true)
  })

  test('authority = engine (çelişki: engine=true, package=false)', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.authority).toBe('engine')
  })

  test('confidence = MEDIUM', () => {
    const da = bdaWithContext(er, 'BB', ctxNearMiss)
    expect(da.canonicalOutcome.confidence).toBe('MEDIUM')
  })
})
