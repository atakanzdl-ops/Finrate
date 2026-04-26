/**
 * computeTargetGap unit testleri
 *
 * 5 senaryo:
 *   1. DEKAM matematiği (kritik doğrulama)
 *   2. Hedef zaten ulaşıldı
 *   3. Hedef ulaşılamaz (subjektif çok düşük)
 *   4. Bilinmeyen rating
 *   5. Sınır rating eşikleri (C / A / AAA)
 */

import { computeTargetGap } from '../targetGap'

const DELTA = 0.15  // kabul edilebilir yuvarlama toleransı

// ─── TEST 1: DEKAM matematiği ─────────────────────────────────────────────────

describe('computeTargetGap — DEKAM matematiği', () => {
  const result = computeTargetGap({
    currentObjectiveScore:  17,
    currentSubjectiveTotal: 23,
    targetRating:           'A',
  })

  test('currentCombinedScore = 34.9 ±0.15', () => {
    expect(result.currentCombinedScore).toBeCloseTo(34.9, 0)
    expect(Math.abs(result.currentCombinedScore - 34.9)).toBeLessThan(DELTA)
  })

  test('currentRating = C', () => {
    expect(result.currentRating).toBe('C')
  })

  test('targetCombinedScore = 76 (A eşiği)', () => {
    expect(result.targetCombinedScore).toBe(76)
  })

  test('requiredObjectiveScore ≈ 75.7 ±0.15', () => {
    // (76 - 23) / 0.70 = 53 / 0.70 = 75.714...
    expect(result.requiredObjectiveScore).toBeCloseTo(75.714, 1)
    expect(Math.abs(result.requiredObjectiveScore - 75.714)).toBeLessThan(DELTA)
  })

  test('requiredObjectiveImprovement ≈ 58.7 ±0.15', () => {
    // 75.714 - 17 = 58.714...
    expect(result.requiredObjectiveImprovement).toBeCloseTo(58.714, 1)
    expect(Math.abs(result.requiredObjectiveImprovement - 58.714)).toBeLessThan(DELTA)
  })

  test('isReachable = true', () => {
    expect(result.isReachable).toBe(true)
  })

  test('targetRating geçirildi', () => {
    expect(result.targetRating).toBe('A')
  })
})

// ─── TEST 2: Hedef zaten ulaşıldı ────────────────────────────────────────────

describe('computeTargetGap — hedef zaten ulaşıldı', () => {
  const result = computeTargetGap({
    currentObjectiveScore:  90,
    currentSubjectiveTotal: 25,
    targetRating:           'B',
  })

  test('requiredObjectiveImprovement negatif (firma hedef üstünde)', () => {
    // currentCombined = 90×0.70 + 25 = 63 + 25 = 88 → AA
    // targetCombined for B = 52
    // requiredObjective = (52 - 25) / 0.70 = 38.57
    // improvement = 38.57 - 90 = -51.43 (negatif)
    expect(result.requiredObjectiveImprovement).toBeLessThan(0)
  })

  test('isReachable = true (hedef üstünde olmak erişilebilir)', () => {
    expect(result.isReachable).toBe(true)
  })

  test('reason içinde "zaten hedef" ifadesi var', () => {
    expect(result.reason).toContain('zaten hedef')
  })
})

// ─── TEST 3: Hedef ulaşılamaz (subjektif çok düşük) ──────────────────────────

describe('computeTargetGap — hedef ulaşılamaz', () => {
  const result = computeTargetGap({
    currentObjectiveScore:  50,
    currentSubjectiveTotal: 5,
    targetRating:           'AAA',
  })

  test('requiredObjectiveScore > 100', () => {
    // targetCombined = 93, subjective = 5
    // required = (93 - 5) / 0.70 = 88 / 0.70 = 125.7
    expect(result.requiredObjectiveScore).toBeGreaterThan(100)
  })

  test('isReachable = false', () => {
    expect(result.isReachable).toBe(false)
  })

  test('reason subjektif skor düşük ifadesi içeriyor', () => {
    // targetGap.ts: "Subjektif skor düşük." (büyük S)
    expect(result.reason?.toLowerCase()).toContain('subjektif skor')
  })
})

// ─── TEST 4: Bilinmeyen rating ────────────────────────────────────────────────

describe('computeTargetGap — bilinmeyen rating', () => {
  const result = computeTargetGap({
    currentObjectiveScore:  50,
    currentSubjectiveTotal: 20,
    targetRating:           'XYZ',
  })

  test('isReachable = false', () => {
    expect(result.isReachable).toBe(false)
  })

  test('reason bilinmeyen rating içeriyor', () => {
    expect(result.reason).toContain('Bilinmeyen rating')
    expect(result.reason).toContain('XYZ')
  })

  test('targetCombinedScore = 0', () => {
    expect(result.targetCombinedScore).toBe(0)
  })
})

// ─── TEST 5: Sınır rating eşikleri ───────────────────────────────────────────

describe('computeTargetGap — sınır rating eşikleri', () => {

  test('C eşiği (30) için requiredObjective doğru', () => {
    // subjective = 10
    // required = (30 - 10) / 0.70 = 20 / 0.70 = 28.57
    const result = computeTargetGap({
      currentObjectiveScore:  10,
      currentSubjectiveTotal: 10,
      targetRating:           'C',
    })
    expect(result.targetCombinedScore).toBe(30)
    expect(result.requiredObjectiveScore).toBeCloseTo(28.57, 1)
  })

  test('A eşiği (76) için requiredObjective doğru', () => {
    // subjective = 15
    // required = (76 - 15) / 0.70 = 61 / 0.70 = 87.14
    const result = computeTargetGap({
      currentObjectiveScore:  40,
      currentSubjectiveTotal: 15,
      targetRating:           'A',
    })
    expect(result.targetCombinedScore).toBe(76)
    expect(result.requiredObjectiveScore).toBeCloseTo(87.14, 1)
  })

  test('AAA eşiği (93) için requiredObjective doğru', () => {
    // subjective = 20
    // required = (93 - 20) / 0.70 = 73 / 0.70 = 104.28 → ulaşılamaz
    const result = computeTargetGap({
      currentObjectiveScore:  50,
      currentSubjectiveTotal: 20,
      targetRating:           'AAA',
    })
    expect(result.targetCombinedScore).toBe(93)
    expect(result.requiredObjectiveScore).toBeCloseTo(104.29, 1)
    expect(result.isReachable).toBe(false)
  })

  test('D rating (eşik 0) — her firma ulaşmış sayılır', () => {
    const result = computeTargetGap({
      currentObjectiveScore:  1,
      currentSubjectiveTotal: 0,
      targetRating:           'D',
    })
    expect(result.targetCombinedScore).toBe(0)
    expect(result.requiredObjectiveImprovement).toBeLessThan(0)
    expect(result.isReachable).toBe(true)
  })
})
