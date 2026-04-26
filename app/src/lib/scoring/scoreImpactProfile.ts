/**
 * Finrate — Skor Etki Profili (Faz 3)
 *
 * Aksiyonların yönsel etki profilini statik olarak tanımlar.
 * Multi-senaryo motorunun candidate selector katmanı.
 *
 * UYARI: Bu değerler GERÇEK SKOR DELTA'SI DEĞİLDİR.
 * Sadece "hangi aksiyonu deneyelim?" sorusu için hızlı pre-filter.
 * Nihai skor her zaman scoreAttribution.computeScoreAttribution() ile hesaplanır.
 *
 * Profil değerleri: 0–5 yönsel güç skalası
 *   0 = bu kategoriye etkisi yok veya negatif olabilir
 *   1 = zayıf/dolaylı etki
 *   3 = orta düzey etki
 *   5 = bu kategori için birincil aksiyon
 *
 * Faz 2 snapshot doğrulaması sonucunda profiller empirik verilerle hizalandı.
 * Orijinal spec profilleri (spec) ile revize profiller (uygulanan) arasındaki
 * farklar aşağıda belgelenmiştir.
 *
 * Faz 1 Bulgu #6 (Faz 5'e kalacak):
 *   Sektör filtresi burada YOKTUR. Örn: A06 inşaat sektöründe "liquidity:5"
 *   yazsa da DEKAM'da activity delta=0 çıkabilir (DIO 2420 gün badHigh=180 üstü).
 *   Sektör-aksiyon uyumluluk filtresi Faz 5 sorumluluğu.
 */

import type { SupportedActionId } from './scoreAttribution'

export type { SupportedActionId as ActionId }

export type ImpactStrength = 0 | 1 | 2 | 3 | 4 | 5

export type ScoreCategory = 'liquidity' | 'profitability' | 'leverage' | 'activity'

export interface CategoryImpactProfile {
  liquidity:     ImpactStrength
  profitability: ImpactStrength
  leverage:      ImpactStrength
  activity:      ImpactStrength
}

/**
 * Yönsel etki profili — 5 pilot aksiyon.
 *
 * Revizyon notları (Faz 2 snapshot doğrulamasından):
 *
 * A05: Spec activity:5 diyordu.
 *   DEKAM: liquidity(+1.70) > activity(+1.27) — her iki entity'de liquidity > activity.
 *   Mekanizma: AR→nakit (liquidity), DSO↓ (activity). Her ikisi co-primary.
 *   → Revize: activity:4, liquidity:4 (eşit birincil)
 *
 * A06: Spec activity:5, liquidity:1 diyordu.
 *   DEKAM: liquidity(+15.77) >> activity(0) — BÜYÜK MISMATCH.
 *   Trade: liquidity(+7.33) > activity(+2.58).
 *   Mekanizma: inventory→nakit dönüşümü cari oran ve nakit oranını dramatik iyileştiriyor.
 *   → Revize: liquidity:5, activity:3 (liquidity baskın)
 *
 * A10: Spec liquidity:4, leverage:3 — yön doğru, oran güçlendirildi.
 *   DEKAM: liquidity(+5.56) > leverage(+2.48). Trade: liquidity(+10.98) > leverage(+1.97).
 *   → Revize: liquidity:5 (daha güçlü, tutarlı dominant)
 *
 * A12: Spec leverage:5, liquidity:4 diyordu.
 *   DEKAM: liquidity(+6.33) > leverage(+4.73). Trade: liquidity(+9.99) > leverage(+5.57).
 *   Her iki entity'de liquidity > leverage → spec'in sıralaması ters.
 *   → Revize: liquidity:5, leverage:4 (sıralama düzeltildi)
 *
 * A18: Spec profitability:5, leverage:1 diyordu.
 *   DEKAM: profitability(+7.26) >> leverage(+1.17). Trade: profitability(+10.06), leverage(+5.58).
 *   Leverage Trade'de güçlü — spec'te 1 düşük kalıyor.
 *   Liquidity her iki entity'de negatif veya sıfır → 0.
 *   → Revize: profitability:5, leverage:3 (leverage ağırlığı artırıldı)
 */
export const SCORE_IMPACT_PROFILES: Record<SupportedActionId, CategoryImpactProfile> = {
  /**
   * A05 — Alacak Tahsilat Hızlandırma (DSO düşür)
   * Mekanizma: AR→nakit (liquidity), DSO↓ (activity)
   * Snapshot: DEKAM liquidity+1.70/activity+1.27, Trade liquidity+2.30/activity+1.95
   */
  A05: { activity: 4, liquidity: 4, profitability: 0, leverage: 1 },

  /**
   * A06 — Stok Devir Hızı (DIO düşür)
   * Mekanizma: inventory→nakit (likidite dramatik iyileşir), DIO↓ (activity)
   * Snapshot: DEKAM liquidity+15.77/activity=0, Trade liquidity+7.33/activity+2.58
   * NOT: İnşaat'ta DIO aşırı yüksek → activity skor floor'da → delta=0 (Bulgu #6)
   */
  A06: { liquidity: 5, activity: 3, profitability: 0, leverage: 0 },

  /**
   * A10 — KV→UV Borç Dönüşümü (%30)
   * Mekanizma: totalCurrentLiabilities↓ (cari oran↑ = liquidity), kısa vadeli borç oranı↓ (leverage)
   * Snapshot: DEKAM liquidity+5.56/leverage+2.48, Trade liquidity+10.98/leverage+1.97
   */
  A10: { liquidity: 5, leverage: 3, activity: 0, profitability: 0 },

  /**
   * A12 — Sermaye Artırımı (+%20)
   * Mekanizma: özkaynak artışı → nakit girişi (liquidity↑), D/E↓ (leverage↑)
   * Snapshot: DEKAM liquidity+6.33/leverage+4.73, Trade liquidity+9.99/leverage+5.57
   * NOT: Activity ikisi'nde de hafif negatif (assetTurnover seyreltme etkisi)
   */
  A12: { liquidity: 5, leverage: 4, profitability: 0, activity: 0 },

  /**
   * A18 — Brüt Marj İyileştirme (+5pp cap)
   * Mekanizma: brüt kâr↑ → net kâr↑ (profitability), özkaynak↑ via retained earnings (leverage↑)
   * Snapshot: DEKAM profitability+7.26/leverage+1.17, Trade profitability+10.06/leverage+5.58
   * NOT: Liquidity ikisinde de negatif veya sıfır → profil 0
   */
  A18: { profitability: 5, leverage: 3, liquidity: 0, activity: 0 },
}

// ─── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────

/**
 * Bir aksiyonun "öncelikli etkilediği" kategorileri döndür.
 * Eşik ve üzeri etki gücüne sahip kategoriler "öncelikli" sayılır.
 *
 * @param actionId   Aksiyon kimliği
 * @param threshold  Minimum etki gücü (varsayılan: 3)
 * @returns          Eşiği geçen kategoriler, etki gücüne göre azalan sırada
 *
 * @example
 *   impactedCategories('A05')       // ['activity', 'liquidity'] (her ikisi 4)
 *   impactedCategories('A12', 5)    // ['liquidity']             (sadece 5'ler)
 *   impactedCategories('A05', 1)    // ['activity', 'liquidity', 'leverage']
 */
export function impactedCategories(
  actionId:  SupportedActionId,
  threshold: ImpactStrength = 3,
): ScoreCategory[] {
  const profile = SCORE_IMPACT_PROFILES[actionId]
  const categories: ScoreCategory[] = ['liquidity', 'profitability', 'leverage', 'activity']

  return categories
    .filter(cat => profile[cat] >= threshold)
    .sort((a, b) => profile[b] - profile[a])  // büyükten küçüğe
}

/**
 * Belirli bir kategoride açık varken hangi aksiyonları deneyelim?
 * Aksiyonları o kategorideki etki gücüne göre azalan sırada sıralar.
 * Etki gücü 0 olan aksiyonlar listeye DAHIL EDİLMEZ.
 *
 * @param category    Açık olan skor kategorisi
 * @param options.minStrength  Minimum etki gücü filtresi (varsayılan: 1 → sıfır hariç hepsi)
 * @returns           Sıralı aksiyon ID listesi
 *
 * @example
 *   rankActionsForCategoryGap('activity')        // ['A05', 'A06'] (her ikisi 4,3)
 *   rankActionsForCategoryGap('profitability')   // ['A18']        (sadece 5)
 *   rankActionsForCategoryGap('leverage', { minStrength: 3 })  // ['A12', 'A10'] (4,3)
 */
export function rankActionsForCategoryGap(
  category: ScoreCategory,
  options?: { minStrength?: ImpactStrength },
): SupportedActionId[] {
  const minStrength: ImpactStrength = options?.minStrength ?? 1

  const entries = Object.entries(SCORE_IMPACT_PROFILES) as [SupportedActionId, CategoryImpactProfile][]

  return entries
    .filter(([, profile]) => profile[category] >= minStrength)
    .sort(([, a], [, b]) => b[category] - a[category])
    .map(([actionId]) => actionId)
}
