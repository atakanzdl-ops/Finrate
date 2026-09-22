/**
 * R10.1 — sectorIntelligence: isActionSemanticallyImpossibleForSector Regression Testleri
 *
 * R10.1 öncesi: A19_ADVANCE_TO_REVENUE sadece CONSTRUCTION ve SERVICES sektörlerinde
 * çalışıyordu. İmalat / Ticaret / Perakende sektörlerinde impossible: true dönüyordu.
 *
 * R10.1 sonrası: Guard kaldırıldı. A19 tüm sektörlerde impossible: false döner.
 * Tetikleyici: ADVANCES_PRESSURE rasyo kuralı (340/KV > %40) — sektör bağımsız.
 *
 * Test sabitler:
 *   T_R101_1 — A19 MANUFACTURING → impossible: false (R10.1 fix)
 *   T_R101_2 — A19 CONSTRUCTION  → impossible: false (regression — eskiden de çalışıyordu)
 *   T_R101_3 — A19 SERVICES      → impossible: false (regression — eskiden de çalışıyordu)
 *   T_R101_4 — A19 TRADE         → impossible: false (R10.1 fix)
 *   T_R101_5 — A19 RETAIL        → impossible: false (R10.1 fix)
 */

import { isActionSemanticallyImpossibleForSector } from '../sectorIntelligence'
import type { SectorCode } from '../contracts'

describe('R10.1 — A19 sektör guard kaldırıldı: tüm sektörlerde impossible: false', () => {

  // T_R101_1: R10.1 FIX — imalat sektörü önceden reddediliyordu
  test('T_R101_1 — A19 MANUFACTURING → impossible: false (R10.1 fix)', () => {
    const r = isActionSemanticallyImpossibleForSector(
      'A19_ADVANCE_TO_REVENUE',
      'MANUFACTURING' as SectorCode,
    )
    expect(r.impossible).toBe(false)
  })

  // T_R101_2: REGRESSION — inşaat sektörü eskiden de çalışıyordu
  test('T_R101_2 — A19 CONSTRUCTION → impossible: false (regression)', () => {
    const r = isActionSemanticallyImpossibleForSector(
      'A19_ADVANCE_TO_REVENUE',
      'CONSTRUCTION' as SectorCode,
    )
    expect(r.impossible).toBe(false)
  })

  // T_R101_3: REGRESSION — hizmet sektörü eskiden de çalışıyordu
  test('T_R101_3 — A19 SERVICES → impossible: false (regression)', () => {
    const r = isActionSemanticallyImpossibleForSector(
      'A19_ADVANCE_TO_REVENUE',
      'SERVICES' as SectorCode,
    )
    expect(r.impossible).toBe(false)
  })

  // T_R101_4: R10.1 FIX — ticaret sektörü önceden reddediliyordu
  test('T_R101_4 — A19 TRADE → impossible: false (R10.1 fix)', () => {
    const r = isActionSemanticallyImpossibleForSector(
      'A19_ADVANCE_TO_REVENUE',
      'TRADE' as SectorCode,
    )
    expect(r.impossible).toBe(false)
  })

  // T_R101_5: R10.1 FIX — perakende sektörü önceden reddediliyordu
  test('T_R101_5 — A19 RETAIL → impossible: false (R10.1 fix)', () => {
    const r = isActionSemanticallyImpossibleForSector(
      'A19_ADVANCE_TO_REVENUE',
      'RETAIL' as SectorCode,
    )
    expect(r.impossible).toBe(false)
  })

})
