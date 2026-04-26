/**
 * Finrate — Target Gap Hesaplayıcı
 *
 * Hedef rating için kaç puanlık objektif skor iyileştirmesi
 * gerektiğini hesaplar. Multi-senaryo motorunun temel girdisi.
 *
 * Formül:
 *   combinedScore = (objectiveScore × 0.70) + subjectiveTotal
 *   targetCombined = RATING_BANDS[targetRating].min
 *   requiredObjective = (targetCombined − subjectiveTotal) / 0.70
 *   improvement = requiredObjective − currentObjectiveScore
 *
 * NOT: combineScores() ceiling/floor mantığı içerdiğinden invertible değil.
 * Bu fonksiyon gap hesabı için BASİTLEŞTİRİLMİŞ doğrusal formülü kullanır.
 * Bu kasıtlı bir tasarım kararıdır (Faz 1 spec).
 */

import type { CategoryScoreMap, TargetGap } from './scenarioV3/contracts'
import type { ScoreCategory } from './scoreImpactProfile'
import { RATING_BANDS } from './score'

// RATING_BANDS → hızlı arama için map
const THRESHOLD_MAP: Record<string, number> = Object.fromEntries(
  RATING_BANDS.map(b => [b.label, b.min])
)

const OBJECTIVE_WEIGHT = 0.70  // finansal skorun birleşik skordaki payı

// Tie-break için sabit kategori sırası
const SECTOR_TIEBREAK_ORDER: ScoreCategory[] = ['liquidity', 'activity', 'leverage', 'profitability']

function computeWeakestCategoriesInternal(
  scores: CategoryScoreMap | undefined,
  isReachable: boolean,
  requiredObjectiveImprovement: number,
): ScoreCategory[] | undefined {
  if (!scores) return undefined
  if (!isReachable) return undefined
  if (requiredObjectiveImprovement <= 0) return undefined

  const entries = SECTOR_TIEBREAK_ORDER.map(cat => ({
    category: cat,
    score: scores[cat],
  }))
  entries.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    // Tie-break: sabit SECTOR_TIEBREAK_ORDER sırası (zaten korunuyor)
    return SECTOR_TIEBREAK_ORDER.indexOf(a.category) - SECTOR_TIEBREAK_ORDER.indexOf(b.category)
  })
  return entries.slice(0, 2).map(e => e.category)
}

/**
 * Birleşik skordan rating harfine çevir.
 * RATING_BANDS yüksekten düşüğe sıralı olduğu için doğrudan gez.
 */
function ratingFromCombined(combined: number): string {
  for (const band of RATING_BANDS) {
    if (combined >= band.min) return band.label
  }
  return 'D'
}

/**
 * Hedef rating için objektif skor boşluğunu hesaplar.
 *
 * @param input.currentObjectiveScore   calculateScore().finalScore (0–100)
 * @param input.currentSubjectiveTotal  calcSubjectiveScore().total (0–30)
 * @param input.targetRating            Hedef rating harfi ('A', 'BBB', vs.)
 *
 * @returns TargetGap — tüm ara değerler dahil
 */
export function computeTargetGap(input: {
  currentObjectiveScore:   number
  currentSubjectiveTotal:  number
  targetRating:            string
  categoryScores?:         CategoryScoreMap  // opsiyonel — Faz 6a
}): TargetGap {
  const currentCombined =
    input.currentObjectiveScore * OBJECTIVE_WEIGHT + input.currentSubjectiveTotal

  const currentRating = ratingFromCombined(currentCombined)

  // Hedef rating bilinmiyor mu?
  // ASCII-safe normalize (Kural 7 — bilinçli değişiklik, 'a'→'A')
  // Locale-sensitive toLocaleUpperCase YASAK (Türkçe İ/i)
  const normalizedForLookup = input.targetRating.trim().toUpperCase()
  const targetCombined = THRESHOLD_MAP[normalizedForLookup]
  if (targetCombined == null) {
    return {
      currentRating,
      targetRating:                 input.targetRating,
      currentObjectiveScore:        input.currentObjectiveScore,
      currentSubjectiveTotal:       input.currentSubjectiveTotal,
      currentCombinedScore:         currentCombined,
      targetCombinedScore:          0,
      requiredObjectiveScore:       0,
      requiredObjectiveImprovement: 0,
      isReachable:                  false,
      reason:                       `Bilinmeyen rating: ${input.targetRating}`,
    }
  }

  // Gereken objektif skor: (hedef birleşik − subjektif) / 0.70
  const requiredObjective =
    (targetCombined - input.currentSubjectiveTotal) / OBJECTIVE_WEIGHT

  const improvement = requiredObjective - input.currentObjectiveScore

  // Erişilebilirlik kontrolü
  let isReachable = true
  let reason: string | undefined

  if (requiredObjective > 100) {
    isReachable = false
    reason =
      `Hedef için objektif skor ${requiredObjective.toFixed(1)} olmalı, ` +
      `ama maksimum 100. Subjektif skor düşük.`
  } else if (improvement < 0) {
    // Zaten hedef rating üstünde — isReachable: true ama bilgilendirici
    reason = 'Firma zaten hedef rating üstünde'
  }

  const weakestCategories = computeWeakestCategoriesInternal(
    input.categoryScores,
    isReachable,
    improvement,
  )

  return {
    currentRating,
    targetRating:                 input.targetRating,
    currentObjectiveScore:        input.currentObjectiveScore,
    currentSubjectiveTotal:       input.currentSubjectiveTotal,
    currentCombinedScore:         currentCombined,
    targetCombinedScore:          targetCombined,
    requiredObjectiveScore:       requiredObjective,
    requiredObjectiveImprovement: improvement,
    isReachable,
    reason,
    weakestCategories,
  }
}
