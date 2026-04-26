/**
 * NARRATIVE PROFILES — Mali müşavir kategorisi
 *
 * Bu katman aksiyonun MALİ MÜŞAVİR ZİHNİNDEKİ kategorisini ifade eder.
 * Skor sisteminin ölçtüğü dominant kategoriyle aynı OLMAYABİLİR (bkz. Bulgu #9).
 *
 * Örn: A05 mali müşavir için "alacak tahsilatı = faaliyet aksiyonu" demek.
 * Skor sistemi DEKAM'da likidite zirvesini gösterse bile, mali müşavirin
 * dilinde A05 hâlâ faaliyet aksiyonudur.
 *
 * KULLANIM: Faz 5 candidate selection'da motor "mali müşavirin faaliyet
 * açığı var, hangi aksiyon önerilsin?" sorusuna cevap verirken bu alanı
 * okur. Gerçek skor etkisi scoreAttribution ile post-hoc hesaplanır.
 *
 * KULLANMAMA: Bu alan asla skor değeri üretmez. Sadece kategorik etiket.
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #9, #13)
 */

import type { ActionId } from '../scoreImpactProfile'
import type { ScoreCategory } from '../scoreImpactProfile'

export const NARRATIVE_STRATEGY_VERSION = '4a-2026-04-26'

export const NARRATIVE_PROFILES: Record<ActionId, ScoreCategory> = {
  A05: 'activity',       // Alacak tahsilatı = faaliyet
  A06: 'activity',       // Stok devir hızı = faaliyet
  A10: 'leverage',       // Kısa→uzun vadeli borç = kaldıraç yönetimi
  A12: 'leverage',       // Sermaye artırımı = kaldıraç güçlendirme
  A18: 'profitability',  // Brüt marj iyileştirme = kârlılık
}

/**
 * Bir aksiyonun mali müşavir kategorisini döndürür.
 * Faz 5 candidate selection'da kullanılır.
 */
export function getNarrativeCategory(actionId: ActionId): ScoreCategory {
  return NARRATIVE_PROFILES[actionId]
}

/**
 * Belirli bir kategoriye ait tüm aksiyonları döndürür (mali müşavir dilinde).
 * Örn: getActionsForNarrativeCategory("activity") → ["A05", "A06"]
 */
export function getActionsForNarrativeCategory(category: ScoreCategory): ActionId[] {
  return (Object.entries(NARRATIVE_PROFILES) as [ActionId, ScoreCategory][])
    .filter(([, cat]) => cat === category)
    .map(([id]) => id)
}
