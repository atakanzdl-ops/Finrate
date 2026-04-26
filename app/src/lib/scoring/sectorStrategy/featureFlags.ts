/**
 * FEATURE FLAGS — Sector Strategy Layer
 *
 * ENABLE_SECTOR_THRESHOLD_OVERRIDES:
 *   false (default) → DIO/DSO için global eşikler (pre-4b davranış, birebir aynı)
 *   true            → Sektörel eşik override'ları aktif (Bulgu #11 düzeltmesi)
 *
 * Üretimde flag KAPALI bırakılır. Shadow run tamamlanana kadar açılmaz.
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #14)
 *
 * Pattern referansı: ENABLE_RATIO_BASED_AMOUNTS (engineV3.ts:535)
 */

export const ENABLE_SECTOR_THRESHOLD_OVERRIDES =
  process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES === 'true'

export function isMultiScenarioV3Enabled(): boolean {
  return process.env.ENABLE_MULTI_SCENARIO_V3 === 'true'
}
