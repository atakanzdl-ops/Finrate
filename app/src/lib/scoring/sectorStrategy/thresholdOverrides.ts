/**
 * THRESHOLD OVERRIDES — Sektörel DIO/DSO eşikleri (Faz 4b)
 *
 * ENABLE_SECTOR_THRESHOLD_OVERRIDES=false (default) → GLOBAL_DEFAULTS döner (pre-4b aynı)
 * ENABLE_SECTOR_THRESHOLD_OVERRIDES=true            → Sektörel override aktif
 *
 * Değerler KONSERVATİF seçildi (GPT audit — fixture-fitting önlemi):
 * - CONSTRUCTION DIO bad=700, good=300 (inşaat WIP gerçekliği)
 * - TRADE        DIO bad=75,  good=30  (GLOBAL ile yakın, ticaret normalize)
 * - MANUFACTURING DIO bad=180, good=90 (global ile aynı bad, good biraz yüksek)
 * - AUTOMOTIVE   DIO bad=90,  good=40  (otomotiv stok döngüsü kısaltılmış)
 *
 * GLOBAL_DEFAULTS: score.ts:420 ve :426'daki GERÇEK değerlerle birebir.
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #11, #14)
 */

import { ENABLE_SECTOR_THRESHOLD_OVERRIDES } from './featureFlags'
import type { SectorId } from './sectorIdMap'

export const THRESHOLD_STRATEGY_VERSION = '4b-2026-04-26'

export interface MetricThresholds {
  bad:            number
  good:           number
  lowerIsBetter?: boolean
  sf?:            number
}

// score.ts:420-427 değerleriyle BİREBİR (ground truth)
export const GLOBAL_DEFAULTS = {
  dio: { bad: 180, good: 60,  lowerIsBetter: true, sf: 0.15 } as MetricThresholds,
  dso: { bad: 120, good: 30,  lowerIsBetter: true, sf: 0.15 } as MetricThresholds,
}

// Sektörel override'lar — flag=true iken aktif
const SECTOR_THRESHOLD_OVERRIDES: Record<SectorId, { dio?: MetricThresholds; dso?: MetricThresholds }> = {
  CONSTRUCTION: {
    dio: { bad: 700, good: 300, lowerIsBetter: true, sf: 0.15 },  // WIP mantığı
    dso: { bad: 240, good: 90,  lowerIsBetter: true, sf: 0.15 },  // uzun tahsilat döngüsü
  },
  TRADE: {
    dio: { bad: 75,  good: 30,  lowerIsBetter: true, sf: 0.15 },  // hızlı stok devri
    dso: { bad: 50,  good: 20,  lowerIsBetter: true, sf: 0.15 },  // kısa alacak döngüsü
  },
  MANUFACTURING: {
    dio: { bad: 180, good: 90,  lowerIsBetter: true, sf: 0.15 },  // global ile aynı bad
    dso: { bad: 120, good: 45,  lowerIsBetter: true, sf: 0.15 },  // dso good biraz sıkılaştı
  },
  AUTOMOTIVE: {
    dio: { bad: 90,  good: 40,  lowerIsBetter: true, sf: 0.15 },  // kısa stok döngüsü
    dso: { bad: 150, good: 60,  lowerIsBetter: true, sf: 0.15 },  // orta tahsilat
  },
}

/**
 * DIO (stok devir süresi) eşiklerini döndürür.
 * Flag false → GLOBAL_DEFAULTS (pre-4b davranış birebir)
 * Flag true  → sektör override varsa override, yoksa GLOBAL_DEFAULTS
 */
export function getDioThresholds(sector: SectorId | undefined): MetricThresholds {
  if (!ENABLE_SECTOR_THRESHOLD_OVERRIDES) return GLOBAL_DEFAULTS.dio
  if (!sector) return GLOBAL_DEFAULTS.dio
  return SECTOR_THRESHOLD_OVERRIDES[sector]?.dio ?? GLOBAL_DEFAULTS.dio
}

/**
 * DSO (alacak tahsil süresi) eşiklerini döndürür.
 * Flag false → GLOBAL_DEFAULTS (pre-4b davranış birebir)
 * Flag true  → sektör override varsa override, yoksa GLOBAL_DEFAULTS
 */
export function getDsoThresholds(sector: SectorId | undefined): MetricThresholds {
  if (!ENABLE_SECTOR_THRESHOLD_OVERRIDES) return GLOBAL_DEFAULTS.dso
  if (!sector) return GLOBAL_DEFAULTS.dso
  return SECTOR_THRESHOLD_OVERRIDES[sector]?.dso ?? GLOBAL_DEFAULTS.dso
}
