/**
 * EXPECTED SPILLOVERS — Aksiyon × sektör ölçülen dominant kategori (Faz 4b)
 *
 * Faz 2 snapshot verilerinden türetilen üç katmanlı yapı:
 *   primary         — skor sisteminde baskın etkili kategori
 *   secondary       — ikincil etkili kategori (opsiyonel)
 *   possibleNegative— negatif etki olası kategori (opsiyonel)
 *
 * !!!! KRİTİK KULLANIM KISITI !!!!
 * Bu metadata SADECE açıklayıcıdır. Candidate selection veya scoring
 * mantığında ASLA import edilmeyecek. Sadece UI açıklama katmanı kullanır.
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #13, #16)
 *
 * Faz 2 snapshot referansı:
 *   A05 DEKAM: liq+1.70 / act+1.27  → primary=activity, secondary=liquidity
 *   A06 DEKAM: liq+15.77 / act=0    → primary=activity (narrative), secondary=liquidity
 *   A10: liq baskın her iki entity  → primary=leverage (narrative), secondary=liquidity
 *   A12: liq baskın her iki entity  → primary=leverage (narrative), secondary=liquidity
 *   A18: pro baskın, lev ikincil    → primary=profitability, secondary=leverage
 */

import type { ActionId } from '../scoreImpactProfile'
import type { ScoreCategory } from '../scoreImpactProfile'
import type { SectorId } from './sectorIdMap'

export const SPILLOVER_STRATEGY_VERSION = '4b-2026-04-26'

export interface ExpectedSpillover {
  /** Skor sisteminde baskın etki kategorisi */
  primary:          ScoreCategory
  /** İkincil etki kategorisi (opsiyonel) */
  secondary?:       ScoreCategory
  /** Negatif etki olası kategori (opsiyonel) */
  possibleNegative?: ScoreCategory
}

/**
 * Sektör × aksiyon spillover tablosu.
 * Partial: sadece anlamlı spillover olan kombinasyonlar tanımlı.
 * Tanımsız kombinasyon → caller fallback kuralı uygular.
 */
export const SPILLOVERS: Partial<Record<SectorId, Partial<Record<ActionId, ExpectedSpillover>>>> = {
  CONSTRUCTION: {
    A05: { primary: 'activity',      secondary: 'liquidity' },
    A06: { primary: 'activity',      secondary: 'liquidity' },   // not: DEKAM'da act delta=0, Bulgu #6
    A10: { primary: 'leverage',      secondary: 'liquidity' },
    A12: { primary: 'leverage',      secondary: 'liquidity',   possibleNegative: 'profitability' },
    A18: { primary: 'profitability', secondary: 'leverage' },
  },
  TRADE: {
    A05: { primary: 'activity',      secondary: 'liquidity' },
    A06: { primary: 'activity',      secondary: 'liquidity' },
    A10: { primary: 'leverage',      secondary: 'liquidity' },
    A12: { primary: 'leverage',      secondary: 'liquidity',   possibleNegative: 'profitability' },
    A18: { primary: 'profitability', secondary: 'leverage' },
  },
  MANUFACTURING: {
    A05: { primary: 'activity',      secondary: 'liquidity' },
    A06: { primary: 'activity',      secondary: 'liquidity' },
    A10: { primary: 'leverage',      secondary: 'liquidity' },
    A12: { primary: 'leverage',      secondary: 'liquidity',   possibleNegative: 'profitability' },
    A18: { primary: 'profitability', secondary: 'leverage' },
  },
  AUTOMOTIVE: {
    A05: { primary: 'activity',      secondary: 'liquidity' },
    A06: { primary: 'activity',      secondary: 'liquidity' },
    A10: { primary: 'leverage',      secondary: 'liquidity' },
    A12: { primary: 'leverage',      secondary: 'liquidity',   possibleNegative: 'profitability' },
    A18: { primary: 'profitability', secondary: 'leverage' },
  },
}

/**
 * Aksiyon+sektör kombinasyonu için expected spillover döndürür.
 * Tanımsızsa undefined — caller kendi fallback mantığını uygular.
 *
 * KULLANIM: Sadece UI açıklama katmanında. Candidate selection'da import yasak.
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #13)
 */
export function getExpectedSpillover(
  actionId: ActionId,
  sector:   SectorId,
): ExpectedSpillover | undefined {
  return SPILLOVERS[sector]?.[actionId]
}
