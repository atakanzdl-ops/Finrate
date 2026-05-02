/**
 * RatingValidationCard — Utility function tests (Faz 7.3.8b)
 *
 * testEnvironment: 'node' → jsdom/rendering yok.
 * Sadece dışa aktarılan saf fonksiyonlar test edilir:
 *   getValidationCase, formatScore, formatScoreInt, showSubjectiveNote
 */

import {
  getValidationCase,
  formatScore,
  formatScoreInt,
  showSubjectiveNote,
  type ValidationCase,
} from '../RatingValidationCard'
import type { ActualRatingValidation } from '@/lib/scoring/scenarioV3/postActionRating'

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

function makeValidation(overrides: Partial<ActualRatingValidation> = {}): ActualRatingValidation {
  return {
    ledgerApplied:        true,
    isEstimateConfirmed:  true,
    warnings:             [],
    currentObjectiveScore: 13.63,
    postObjectiveScore:   53.01,
    subjectiveTotal:      0,
    currentCombinedScore: 10,
    postCombinedScore:    37,
    currentActualRating:  'D',
    postActualRating:     'B',
    v3EstimatedRating:    'B',
    ...overrides,
  }
}

// DEKAM senaryosu — V3 tahmini B, Gerçek CC → tutarsız
const DEKAM_VALIDATION = makeValidation({
  ledgerApplied:       true,
  isEstimateConfirmed: false,
  currentActualRating: 'D',
  postActualRating:    'CC',
  v3EstimatedRating:   'B',
  currentObjectiveScore: 13.63,
  postObjectiveScore:  53.01,
  currentCombinedScore: 10,
  postCombinedScore:   37,
  warnings:            ['Hesap 153 bulunamadı'],
})

// ─── getValidationCase ─────────────────────────────────────────────────────────

describe('getValidationCase', () => {
  test('ledgerApplied=false → ledger_failed', () => {
    const result = getValidationCase(makeValidation({ ledgerApplied: false }))
    expect(result).toBe<ValidationCase>('ledger_failed')
  })

  test('ledgerApplied=true, isEstimateConfirmed=true → confirmed', () => {
    const result = getValidationCase(makeValidation({ ledgerApplied: true, isEstimateConfirmed: true }))
    expect(result).toBe<ValidationCase>('confirmed')
  })

  test('ledgerApplied=true, isEstimateConfirmed=false → not_confirmed', () => {
    const result = getValidationCase(makeValidation({ ledgerApplied: true, isEstimateConfirmed: false }))
    expect(result).toBe<ValidationCase>('not_confirmed')
  })

  test('DEKAM senaryosu → not_confirmed', () => {
    expect(getValidationCase(DEKAM_VALIDATION)).toBe<ValidationCase>('not_confirmed')
  })

  test('ledgerApplied=false ikincil field ne olursa olsun → ledger_failed', () => {
    // isEstimateConfirmed=true olsa bile ledger_failed öncelikli
    const result = getValidationCase(makeValidation({ ledgerApplied: false, isEstimateConfirmed: true }))
    expect(result).toBe<ValidationCase>('ledger_failed')
  })
})

// ─── formatScore ──────────────────────────────────────────────────────────────

describe('formatScore', () => {
  test('13.63 → "13.63"', () => {
    expect(formatScore(13.63)).toBe('13.63')
  })

  test('53.01 → "53.01"', () => {
    expect(formatScore(53.01)).toBe('53.01')
  })

  test('tam sayı → 2 ondalık', () => {
    expect(formatScore(50)).toBe('50.00')
  })

  test('0 → "0.00"', () => {
    expect(formatScore(0)).toBe('0.00')
  })

  test('3+ ondalıklı sayıda 2\'ye yuvarlar', () => {
    expect(formatScore(13.636)).toBe('13.64')
  })
})

// ─── formatScoreInt ───────────────────────────────────────────────────────────

describe('formatScoreInt', () => {
  test('10 → "10"', () => {
    expect(formatScoreInt(10)).toBe('10')
  })

  test('37 → "37"', () => {
    expect(formatScoreInt(37)).toBe('37')
  })

  test('ondalıklı → yuvarlanmış tamsayı', () => {
    expect(formatScoreInt(36.7)).toBe('37')
  })

  test('0.4 → "0"', () => {
    expect(formatScoreInt(0.4)).toBe('0')
  })

  test('negatif yuvarlanır', () => {
    expect(formatScoreInt(-0.6)).toBe('-1')
  })
})

// ─── showSubjectiveNote ───────────────────────────────────────────────────────

describe('showSubjectiveNote', () => {
  test('subjectiveTotal=0 → true', () => {
    expect(showSubjectiveNote(0)).toBe(true)
  })

  test('subjectiveTotal=5 → false', () => {
    expect(showSubjectiveNote(5)).toBe(false)
  })

  test('subjectiveTotal=-1 → false', () => {
    expect(showSubjectiveNote(-1)).toBe(false)
  })

  test('subjectiveTotal=10 → false', () => {
    expect(showSubjectiveNote(10)).toBe(false)
  })
})
