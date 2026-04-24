/**
 * UI rating presentation helpers.
 * Engine 22-notch canonical skala kullanır (ratingReasoning.ts).
 * UI kullanıcıya 10 kategori gösterir.
 *
 * ÖNEMLİ: Bu dosya yalnızca UI katmanı içindir.
 * Backend/engine/API response DEĞİŞMEZ — 22 notch canonical korunur.
 */

export const UI_RATING_CATEGORIES = [
  'D',
  'C',
  'CC',
  'CCC',
  'B',
  'BB',
  'BBB',
  'A',
  'AA',
  'AAA',
] as const

export type UiRatingCategory = (typeof UI_RATING_CATEGORIES)[number]

/**
 * Backend'den gelen herhangi bir rating'i (22-notch dahil)
 * UI kategorisine indirir.
 *
 * Örnekler:
 *   "BBB+" → "BBB"
 *   "BBB"  → "BBB"
 *   "BBB-" → "BBB"
 *   "B-"   → "B"
 *   "CCC+" → "CCC"
 *   "C"    → "C"   (değişmez)
 *   null   → "-"
 */
export function normalizeRatingForUi(rating?: string | null): string {
  if (!rating) return '-'
  const clean = rating.trim().toUpperCase()
  return clean.replace(/[+-]/g, '')
}

/**
 * UI kategorisinden backend'e gönderilecek internal rating'i üretir.
 *
 * Mapping stratejisi:
 * - Üst segmentler (AA, A, BBB, BB, B): alt notch default (AA-, A-, BBB-, BB-, B-)
 *   Sebep: Kullanıcı "hedefim BBB" dediğinde motor en zor noktayı hedeflesin
 * - CCC: kendi mid-notch (CCC, CCC- değil) — distressed boundary korunur
 * - Tek notch'lular (AAA, CC, C, D): olduğu gibi
 */
export function mapUiRatingToInternal(uiRating: string): string {
  const clean = uiRating.trim().toUpperCase()
  switch (clean) {
    case 'AA':  return 'AA-'
    case 'A':   return 'A-'
    case 'BBB': return 'BBB-'
    case 'BB':  return 'BB-'
    case 'B':   return 'B-'
    case 'CCC': return 'CCC'   // CCC- değil — distressed boundary
    case 'AAA': return 'AAA'
    case 'CC':  return 'CC'
    case 'C':   return 'C'
    case 'D':   return 'D'
    default:    return clean
  }
}

/**
 * Rating gösterimi için tooltip metni üretir.
 * Internal (notch'lu) rating varsa gösterir, aksi halde undefined döner.
 *
 * Kullanım: title={ratingTooltip(internalRating)}
 *
 * Örnekler:
 *   "BBB-" → "Internal rating: BBB-"
 *   "BBB"  → undefined  (sadeleştirilmiş ile aynı, tooltip gereksiz)
 *   "C"    → undefined
 */
export function ratingTooltip(internal?: string | null): string | undefined {
  if (!internal) return undefined
  const clean = internal.trim().toUpperCase()
  const simplified = normalizeRatingForUi(clean)
  // Internal ile simplified farklıysa notch modifier vardı → tooltip göster
  if (clean !== simplified) {
    return `Internal rating: ${clean}`
  }
  return undefined
}
