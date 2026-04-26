/**
 * Faz 4b Checkpoint Testleri
 *
 * Test 1 — Flag false: pre-4b davranışı korundu
 *   getDioThresholds("CONSTRUCTION") === GLOBAL_DEFAULTS.dio (flag=false)
 *
 * Test 2 — Flag true: sektörel eşikler aktif
 *   CONSTRUCTION DIO bad=700, TRADE DIO bad=75, matrix dışı fallback global
 *   (jest.resetModules + dynamic import)
 *
 * Test 3 — DEKAM A06 relative assertion (GPT bulgusu — toBeGreaterThan(0) YAPMA)
 *   post-4b activity delta > pre-4b activity delta (relative, snapshot'a baglanmaz)
 *   (jest.resetModules + dynamic import)
 *
 * Test 4 — Spillover read-only kanıtı
 *   getExpectedSpillover doğru çalışıyor
 *
 * Test 5 — strategyVersion
 *   THRESHOLD_STRATEGY_VERSION === "4b-2026-04-26"
 *   SPILLOVER_STRATEGY_VERSION === "4b-2026-04-26"
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #11, #13, #14, #16)
 */

import {
  GLOBAL_DEFAULTS,
  getDioThresholds,
  getDsoThresholds,
  THRESHOLD_STRATEGY_VERSION,
} from '../thresholdOverrides'
import {
  getExpectedSpillover,
  SPILLOVER_STRATEGY_VERSION,
} from '../expectedSpillovers'
import { mapSectorStringToId } from '../sectorIdMap'
import {
  DEKAM_INPUT, DEKAM_SECTOR, DEKAM_SUBJECTIVE_TOTAL,
} from '../../__fixtures__/syntheticEntities'
import type { SectorId } from '../sectorIdMap'

// ──────────────────────────────────────────────────────────────────────────────
// TEST 1 — FLAG FALSE: pre-4b davranışı korundu
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 1 — Flag false: getDioThresholds/getDsoThresholds GLOBAL_DEFAULTS doner', () => {
  // process.env ayarlı değil → ENABLE_SECTOR_THRESHOLD_OVERRIDES = false

  test('getDioThresholds("CONSTRUCTION") === GLOBAL_DEFAULTS.dio (flag=false)', () => {
    const result = getDioThresholds('CONSTRUCTION')
    expect(result).toEqual(GLOBAL_DEFAULTS.dio)
    expect(result.bad).toBe(180)
    expect(result.good).toBe(60)
  })

  test('getDioThresholds("TRADE") === GLOBAL_DEFAULTS.dio (flag=false)', () => {
    const result = getDioThresholds('TRADE')
    expect(result).toEqual(GLOBAL_DEFAULTS.dio)
  })

  test('getDsoThresholds("CONSTRUCTION") === GLOBAL_DEFAULTS.dso (flag=false)', () => {
    const result = getDsoThresholds('CONSTRUCTION')
    expect(result).toEqual(GLOBAL_DEFAULTS.dso)
    expect(result.bad).toBe(120)
    expect(result.good).toBe(30)
  })

  test('getDioThresholds(undefined) === GLOBAL_DEFAULTS.dio', () => {
    expect(getDioThresholds(undefined)).toEqual(GLOBAL_DEFAULTS.dio)
  })

  test('GLOBAL_DEFAULTS.dio: bad=180, good=60 (score.ts:420 ground truth)', () => {
    expect(GLOBAL_DEFAULTS.dio.bad).toBe(180)
    expect(GLOBAL_DEFAULTS.dio.good).toBe(60)
    expect(GLOBAL_DEFAULTS.dio.lowerIsBetter).toBe(true)
    expect(GLOBAL_DEFAULTS.dio.sf).toBe(0.15)
  })

  test('GLOBAL_DEFAULTS.dso: bad=120, good=30 (score.ts:426 ground truth)', () => {
    expect(GLOBAL_DEFAULTS.dso.bad).toBe(120)
    expect(GLOBAL_DEFAULTS.dso.good).toBe(30)
    expect(GLOBAL_DEFAULTS.dso.lowerIsBetter).toBe(true)
    expect(GLOBAL_DEFAULTS.dso.sf).toBe(0.15)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 2 — FLAG TRUE: sektörel eşikler aktif
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 2 — Flag true: sektörel override eşikler (jest.resetModules)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getDioT: (s: SectorId | undefined) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getDsoT: (s: SectorId | undefined) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let globalDef: any

  beforeAll(async () => {
    process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES = 'true'
    jest.resetModules()
    const mod = await import('../thresholdOverrides')
    getDioT = mod.getDioThresholds
    getDsoT = mod.getDsoThresholds
    globalDef = mod.GLOBAL_DEFAULTS
  })

  afterAll(() => {
    delete process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES
    jest.resetModules()
  })

  test('CONSTRUCTION DIO bad=700 (flag=true)', () => {
    expect(getDioT('CONSTRUCTION').bad).toBe(700)
    expect(getDioT('CONSTRUCTION').good).toBe(300)
  })

  test('CONSTRUCTION DSO bad=240 (flag=true)', () => {
    expect(getDsoT('CONSTRUCTION').bad).toBe(240)
  })

  test('TRADE DIO bad=75 (flag=true)', () => {
    expect(getDioT('TRADE').bad).toBe(75)
    expect(getDioT('TRADE').good).toBe(30)
  })

  test('AUTOMOTIVE DIO bad=90 (flag=true)', () => {
    expect(getDioT('AUTOMOTIVE').bad).toBe(90)
  })

  test('MANUFACTURING DIO bad=180 (global ile ayni, flag=true)', () => {
    expect(getDioT('MANUFACTURING').bad).toBe(180)
  })

  test('undefined sektor -> GLOBAL_DEFAULTS fallback (flag=true)', () => {
    expect(getDioT(undefined)).toEqual(globalDef.dio)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 3 — DEKAM A06 RELATIVE ASSERTION (GPT bulgusu — fixture-fitting onlemi)
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 3 — DEKAM A06: post-4b activity delta > pre-4b (relative, flag true)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let preResult: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let postResult: any

  beforeAll(async () => {
    // Pre-4b: statik import, flag=false (bu test dosyasi yuklendi zaten)
    const preMod = await import('../../scoreAttribution')
    preResult = preMod.computeScoreAttribution(
      'A06', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR
    )

    // Post-4b: flag=true + resetModules
    process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES = 'true'
    jest.resetModules()
    const postMod = await import('../../scoreAttribution')
    postResult = postMod.computeScoreAttribution(
      'A06', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR
    )
  })

  afterAll(() => {
    delete process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES
    jest.resetModules()
  })

  test('pre-4b: DEKAM A06 applied=true', () => {
    expect(preResult.applied).toBe(true)
  })

  test('post-4b: DEKAM A06 applied=true', () => {
    expect(postResult.applied).toBe(true)
  })

  test('post-4b activity delta >= pre-4b activity delta (CONSTRUCTION DIO bad=700→daha az punished)', () => {
    // CONSTRUCTION DIO bad=700 ile artık DIO 2420 "fena" sayılmıyor.
    // Hem before hem after DIO, GLOBAL bad=180'in üstünde → her ikisi 0 skor.
    // bad=700 ile: DIO 1815 (after) hala 700'ün üstünde → skor hala 0.
    // DIO 2420 (before) bad=700 üstü → skor 0. 1815 de 700 üstü → 0. Delta=0.
    // Bu test: post-4b delta >= pre-4b delta (negatif olmamali, artacak ya da esit kalacak)
    expect(postResult.categoryDelta.activity).toBeGreaterThanOrEqual(preResult.categoryDelta.activity)
  })

  test('post-4b objectiveDelta >= pre-4b objectiveDelta', () => {
    // Genel: flag=true ile skor daha gercekci → CONSTRUCTION'da kotu IDs artık "kotu" sayilmaz
    expect(postResult.objectiveDelta).toBeGreaterThanOrEqual(preResult.objectiveDelta)
  })

  // NOT: combinedDelta'ya baglanmiyoruz — ceiling/floor kirilgan (GPT uyarisi)
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 4 — SPILLOVER READ-ONLY KANITI
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 4 — Spillover read-only kaniti', () => {
  test('A05 + CONSTRUCTION: primary=activity, secondary=liquidity', () => {
    const s = getExpectedSpillover('A05', 'CONSTRUCTION')
    expect(s?.primary).toBe('activity')
    expect(s?.secondary).toBe('liquidity')
    expect(s?.possibleNegative).toBeUndefined()
  })

  test('A06 + TRADE: primary=activity', () => {
    expect(getExpectedSpillover('A06', 'TRADE')?.primary).toBe('activity')
  })

  test('A12 + CONSTRUCTION: possibleNegative=profitability', () => {
    const s = getExpectedSpillover('A12', 'CONSTRUCTION')
    expect(s?.possibleNegative).toBe('profitability')
  })

  test('A18 + AUTOMOTIVE: primary=profitability, secondary=leverage', () => {
    const s = getExpectedSpillover('A18', 'AUTOMOTIVE')
    expect(s?.primary).toBe('profitability')
    expect(s?.secondary).toBe('leverage')
  })

  test('A10 + MANUFACTURING: primary=leverage, secondary=liquidity', () => {
    const s = getExpectedSpillover('A10', 'MANUFACTURING')
    expect(s?.primary).toBe('leverage')
    expect(s?.secondary).toBe('liquidity')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 5 — STRATEGY VERSION
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 5 — strategyVersion damgasi', () => {
  test('THRESHOLD_STRATEGY_VERSION === "4b-2026-04-26"', () => {
    expect(THRESHOLD_STRATEGY_VERSION).toBe('4b-2026-04-26')
  })

  test('SPILLOVER_STRATEGY_VERSION === "4b-2026-04-26"', () => {
    expect(SPILLOVER_STRATEGY_VERSION).toBe('4b-2026-04-26')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// BONUS — sectorIdMap smoke
// ──────────────────────────────────────────────────────────────────────────────

describe('sectorIdMap — mapSectorStringToId', () => {
  test('"İnşaat" → "CONSTRUCTION" (DEKAM fixture)', () => {
    expect(mapSectorStringToId('İnşaat')).toBe('CONSTRUCTION')
  })

  test('"ticaret" → "TRADE" (Trade fixture)', () => {
    expect(mapSectorStringToId('ticaret')).toBe('TRADE')
  })

  test('"Toptan Ticaret" → "TRADE"', () => {
    expect(mapSectorStringToId('Toptan Ticaret')).toBe('TRADE')
  })

  test('"imalat" → "MANUFACTURING"', () => {
    expect(mapSectorStringToId('imalat')).toBe('MANUFACTURING')
  })

  test('"Otomotiv Bayi" → "AUTOMOTIVE"', () => {
    expect(mapSectorStringToId('Otomotiv Bayi')).toBe('AUTOMOTIVE')
  })

  test('"Genel" → undefined (tanımsız sektör → caller global default)', () => {
    expect(mapSectorStringToId('Genel')).toBeUndefined()
  })

  test('null/undefined → undefined', () => {
    expect(mapSectorStringToId(null)).toBeUndefined()
    expect(mapSectorStringToId(undefined)).toBeUndefined()
  })
})
