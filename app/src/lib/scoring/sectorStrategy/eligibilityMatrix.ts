/**
 * ELIGIBILITY MATRIX — Sektör × aksiyon uygunluk
 *
 * Bazı aksiyonlar belirli sektörlerde anlamsız ya da yan etkili.
 * Örn: İnşaat sektöründe A06 (stok devir hızı) → DEKAM gibi WIP-heavy
 * firmalarda stok = devam eden inşaat, devir kavramı uygulanmaz.
 *
 * 3 seviye:
 *   "allow"     — aksiyon önerilebilir
 *   "discourage"— önerilebilir ama UI uyarı göstermeli
 *   "block"     — önerilmemeli (motor bu aksiyonu candidate listesine almaz)
 *
 * KULLANIM: Faz 5 candidate selection'da pre-filter olarak.
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #6)
 *
 * NOT: Faz 4a fallback varsayılanı "allow". Sektör+aksiyon kombinasyonu
 * matrix'te yoksa allow kabul edilir. Faz 4b'de eşik override'larıyla
 * birlikte daha agresif filtreleme yapılabilir.
 *
 * Faz 4a'da 4 sektör pilotu. 18 sektörün tamamı Faz 4b/5'te eklenecek.
 */

import type { ActionId } from '../scoreImpactProfile'
// SectorId canonical kaynağı sectorIdMap.ts — score.ts'in döngüsel bağımlılıktan korunması için
import type { SectorId } from './sectorIdMap'

export type { SectorId }  // backward compat re-export

export const ELIGIBILITY_STRATEGY_VERSION = '4a-2026-04-26'

export type EligibilityDecision = 'allow' | 'discourage' | 'block'

export interface EligibilityRule {
  decision: EligibilityDecision
  reason?:  string
}

export const ELIGIBILITY_MATRIX: Record<SectorId, Partial<Record<ActionId, EligibilityRule>>> = {
  CONSTRUCTION: {
    A06: {
      decision: 'discourage',
      reason:   'İnşaat stok = WIP, devir hızı kavramı sınırlı uygulanır',
    },
    // Diğer aksiyonlar default "allow"
  },
  TRADE: {
    // Tümü allow (default)
  },
  MANUFACTURING: {
    // Tümü allow (default)
  },
  AUTOMOTIVE: {
    // Tümü allow (default)
  },
}

/**
 * Sektör+aksiyon kombinasyonu için uygunluk kararı döndürür.
 * Matrix'te yoksa default "allow".
 */
export function getEligibility(actionId: ActionId, sector: SectorId): EligibilityRule {
  return ELIGIBILITY_MATRIX[sector]?.[actionId] ?? { decision: 'allow' }
}

/**
 * Aksiyon bu sektörde önerilebilir mi? (block hariç hepsi true)
 * Faz 5 candidate selection'da kullanılacak.
 */
export function isActionEligibleForSector(actionId: ActionId, sector: SectorId): boolean {
  return getEligibility(actionId, sector).decision !== 'block'
}

/**
 * Belirli bir sektörde önerilebilir tüm aksiyonları döndürür.
 */
export function getEligibleActionsForSector(
  sector:     SectorId,
  allActions: ActionId[],
): ActionId[] {
  return allActions.filter(a => isActionEligibleForSector(a, sector))
}
