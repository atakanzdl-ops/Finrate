/**
 * UI rating presentation helpers.
 *
 * V3.1: Engine artık 10 kategori kullanıyor — UI = internal.
 * Normalizasyon ve mapping helper'larına artık gerek yok.
 * Legacy 22-notch veriler için normalizeLegacyRating kullanılır.
 *
 * Tek source of truth: ratingReasoning.RATING_ORDER
 */

import {
  RATING_ORDER,
  type RatingGrade,
  normalizeLegacyRating,
} from './scenarioV3/ratingReasoning'

// Re-export: UI ve engine aynı diziyi kullanır
export { RATING_ORDER as UI_RATING_CATEGORIES }
export type { RatingGrade as UiRatingCategory }

/**
 * Mevcut rating'in üstündeki (iyileşme yönündeki) kategorileri döner.
 * D ve mevcut dahil değil.
 *
 * Örnekler:
 *   "C"    → [CC, CCC, B, BB, BBB, A, AA, AAA]
 *   "B-"   → normalize → "B" → [BB, BBB, A, AA, AAA]
 *   "BBB"  → [A, AA, AAA]
 *   "AAA"  → []   (en üst seviyede)
 *   null   → D hariç hepsi (fallback)
 */
export function getTargetRatingOptions(currentRating?: string | null): RatingGrade[] {
  const currentCategory = normalizeLegacyRating(currentRating)
  const currentIdx = RATING_ORDER.indexOf(currentCategory)

  if (currentIdx < 0) {
    // Bilinmeyen rating → D hariç hepsini döndür
    return RATING_ORDER.filter(r => r !== 'D') as RatingGrade[]
  }

  // Mevcut indexin üstündeki kategoriler (mevcut dahil değil)
  return RATING_ORDER.slice(currentIdx + 1) as RatingGrade[]
}

/**
 * İki rating arasındaki kategori delta'sını hesaplar.
 * Legacy 22-notch verileri normalize eder.
 *
 * Örnekler:
 *   ("C", "B")    → 3   (C→CC→CCC→B)
 *   ("BBB-","A-") → 1   normalize → "BBB"→"A"  → 1
 *   ("B","B+")    → 0   normalize → "B"→"B"    → 0 (aynı kategori)
 */
export function countCategoryTransitions(
  from?: string | null,
  to?: string | null,
): number {
  const fromCat = normalizeLegacyRating(from)
  const toCat   = normalizeLegacyRating(to)

  const fromIdx = RATING_ORDER.indexOf(fromCat)
  const toIdx   = RATING_ORDER.indexOf(toCat)

  if (fromIdx < 0 || toIdx < 0) return 0
  return toIdx - fromIdx
}
