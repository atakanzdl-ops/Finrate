/**
 * Scenario Generator Tests — Faz 5.1
 *
 * 12 test grubu: validation, DEKAM baseline, trade, Kural 5 boundary,
 * objectiveDelta, determinism, combination guard, cache, pair truth,
 * minimal-action rerank, strategyVersions, snapshot.
 */

import * as fs from 'fs'
import * as path from 'path'
import { generateScenarios, ScenarioGenerationError } from '../scenarioGenerator'
import { DEKAM_INPUT, DEKAM_SECTOR, DEKAM_SUBJECTIVE_TOTAL, TRADE_INPUT, TRADE_SECTOR, TRADE_SUBJECTIVE_TOTAL } from '../../__fixtures__/syntheticEntities'

// ─── FİXTURE HAZIRLIK ────────────────────────────────────────────────────────

// DEKAM: sector + subjective ekle
const FULL_DEKAM = {
  ...DEKAM_INPUT,
  sector:     DEKAM_SECTOR,
  subjective: DEKAM_SUBJECTIVE_TOTAL,
}

// TRADE: sector + subjective ekle
const FULL_TRADE = {
  ...TRADE_INPUT,
  sector:     TRADE_SECTOR,
  subjective: TRADE_SUBJECTIVE_TOTAL,
}

// ─── TEST 1 — Validation gating ──────────────────────────────────────────────

describe('Test 1 — Validation gating', () => {
  test('sector eksik → ScenarioGenerationError fırlatır', () => {
    // DEKAM_INPUT'ta sector var ama subjective yok. Sector'suz entity oluştur
    const noSector = { ...DEKAM_INPUT, sector: undefined, subjective: 23 }
    expect(() => generateScenarios(noSector as any)).toThrow(ScenarioGenerationError)
  })

  test('revenue=0 → ScenarioGenerationError fırlatır', () => {
    const noRevenue = { ...FULL_DEKAM, revenue: 0 }
    expect(() => generateScenarios(noRevenue)).toThrow(ScenarioGenerationError)
  })

  test('totalAssets=0 → ScenarioGenerationError fırlatır', () => {
    const noAssets = { ...FULL_DEKAM, totalAssets: 0 }
    expect(() => generateScenarios(noAssets)).toThrow(ScenarioGenerationError)
  })
})

// ─── TEST 2 — DEKAM (inşaat) baseline ────────────────────────────────────────

describe('Test 2 — DEKAM (inşaat) baseline', () => {
  test('DEKAM target=A → en az 1 senaryo, objectiveDelta >= 0', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    expect(scenarios.every(s => s.objectiveDelta >= 0)).toBe(true)
    // combinedDelta assertion YOK (Kural 7 — ceiling/floor nedeniyle negatif olabilir)
  })

  test('maxScenarios=7 → en fazla 7 senaryo döner', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A', maxScenarios: 7 })
    expect(scenarios.length).toBeLessThanOrEqual(7)
  })
})

// ─── TEST 3 — Trade entity ────────────────────────────────────────────────────

describe('Test 3 — Trade entity', () => {
  test('Trade entity → senaryo üretir ve leverage/profitability aksiyonları mevcut', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    // Trade'de leverage (A10, A12) veya profitability (A18) aksiyonları mevcut olmalı
    const allActionIds = scenarios.flatMap(s => s.actions.map(a => a.actionId))
    const hasLeverageOrProfitability = allActionIds.some(id => ['A10', 'A12', 'A18'].includes(id))
    expect(hasLeverageOrProfitability).toBe(true)
  })

  test('Trade entity A18 → tüm aksiyonlar geçerli ActionId', () => {
    // A18 target=B ile aranırsa profitability devreye girer
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'B' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    const allActionIds = scenarios.flatMap(s => s.actions.map(a => a.actionId))
    // Tüm action ID'leri desteklenen listeden olmalı
    expect(allActionIds.every(id => ['A05', 'A06', 'A10', 'A12', 'A18'].includes(id))).toBe(true)
  })

  test('Trade entity → en az 1 senaryo üretir', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── TEST 4 — Kural 5 boundary (expectedSpillover isolation) ─────────────────
// Kural 5: expectedSpillover IMPORT yasak — yorum satırları geçerli

describe('Test 4 — Kural 5: expectedSpillover isolation', () => {
  const SCORING_DIR = path.join(__dirname, '..')

  // import ifadesi içeren satırlar regex ile kontrol edilir (yorum satırları hariç)
  function hasExpectedSpilloverImport(filePath: string): boolean {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    return lines.some(line => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false
      return /import.*expectedSpillovers/.test(line) || /import.*ExpectedSpillover/.test(line)
    })
  }

  test('candidateSelection.ts expectedSpillovers import içermiyor', () => {
    expect(hasExpectedSpilloverImport(path.join(SCORING_DIR, 'candidateSelection.ts'))).toBe(false)
  })

  test('scenarioCombination.ts expectedSpillovers import içermiyor', () => {
    expect(hasExpectedSpilloverImport(path.join(SCORING_DIR, 'scenarioCombination.ts'))).toBe(false)
  })

  test('attributionCache.ts expectedSpillovers import içermiyor', () => {
    expect(hasExpectedSpilloverImport(path.join(SCORING_DIR, 'attributionCache.ts'))).toBe(false)
  })
})

// ─── TEST 5 — objectiveDelta positive ────────────────────────────────────────

describe('Test 5 — objectiveDelta positive', () => {
  test('en iyi senaryoda objectiveDelta >= 0', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    expect(scenarios[0].objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('TRADE en iyi senaryoda objectiveDelta >= 0', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
    expect(scenarios[0].objectiveDelta).toBeGreaterThanOrEqual(0)
  })
})

// ─── TEST 6 — Deterministic ──────────────────────────────────────────────────

describe('Test 6 — Deterministic', () => {
  test('aynı entity 2x → aynı senaryo sırası (aksiyon ID dizisi)', () => {
    const s1 = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    const s2 = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    expect(s1.map(s => s.actions.map(a => a.actionId).join(','))).toEqual(
      s2.map(s => s.actions.map(a => a.actionId).join(','))
    )
  })

  test('TRADE deterministic', () => {
    const s1 = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    const s2 = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    expect(s1.map(s => s.actions.map(a => a.actionId).join(','))).toEqual(
      s2.map(s => s.actions.map(a => a.actionId).join(','))
    )
  })
})

// ─── TEST 7 — Combination guard ──────────────────────────────────────────────

describe('Test 7 — Combination guard', () => {
  test('pairResults ≤ 10', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    const pairScenarios = scenarios.filter(s => s.actions.length === 2)
    expect(pairScenarios.length).toBeLessThanOrEqual(10)
  })

  test('TRADE pairResults ≤ 10', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'A' })
    const pairScenarios = scenarios.filter(s => s.actions.length === 2)
    expect(pairScenarios.length).toBeLessThanOrEqual(10)
  })
})

// ─── TEST 8 — Cache stableStringify ──────────────────────────────────────────

describe('Test 8 — Cache stableStringify', () => {
  // stableStringify import edilir (named export)
  let stableStringify: (obj: unknown) => string

  beforeAll(async () => {
    const mod = await import('../attributionCache')
    stableStringify = mod.stableStringify
  })

  test('key order independence', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { c: 3, a: 1, b: 2 }
    expect(stableStringify(obj1)).toBe(stableStringify(obj2))
  })

  test('farklı ratios → farklı key', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 99 }
    expect(stableStringify(obj1)).not.toBe(stableStringify(obj2))
  })

  test('nested object key order independence', () => {
    const obj1 = { x: { b: 2, a: 1 }, y: 3 }
    const obj2 = { y: 3, x: { a: 1, b: 2 } }
    expect(stableStringify(obj1)).toBe(stableStringify(obj2))
  })

  test('array order matters', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [3, 2, 1]
    expect(stableStringify(arr1)).not.toBe(stableStringify(arr2))
  })
})

// ─── TEST 9 — Single attribution source of truth (Kural 11) ─────────────────

describe('Test 9 — Pair objectiveDelta gerçek hesaplama ile', () => {
  test('pair objectiveDelta sayı tipinde', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    const pairs = scenarios.filter(s => s.actions.length === 2)
    pairs.forEach(p => {
      expect(typeof p.objectiveDelta).toBe('number')
      expect(isNaN(p.objectiveDelta)).toBe(false)
    })
  })

  test('her senaryoda beforeState.objective.total sayı tipinde', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    scenarios.forEach(s => {
      expect(typeof s.beforeState.objective.total).toBe('number')
      expect(typeof s.afterState.objective.total).toBe('number')
    })
  })
})

// ─── TEST 10 — Minimal-action preference (Kural 13) ─────────────────────────

describe('Test 10 — Minimal-action preference rerank', () => {
  test('rerank: 1-aksiyonlu senaryolar targetReached eşit durumda önde', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    // Eğer hem 1-aksiyonlu hem 2-aksiyonlu varsa, targetReached eşit olduğunda
    // 1-aksiyonlu önce gelmeli
    if (scenarios.some(s => s.actions.length === 1) && scenarios.some(s => s.actions.length === 2)) {
      const firstPairIdx = scenarios.findIndex(s => s.actions.length === 2)
      const allBefore = scenarios.slice(0, firstPairIdx)
      // targetReached=true olanlar hariç, 1-aksiyonlular önde olmalı
      expect(allBefore.every(s => s.actions.length === 1 || s.targetReached)).toBe(true)
    }
    // En az test koşulu: ilk senaryo var
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
  })

  test('targetReached=true senaryolar listenin başında', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'B' })  // ulaşması daha kolay rating
    if (scenarios.some(s => s.targetReached) && scenarios.some(s => !s.targetReached)) {
      const firstFalseIdx = scenarios.findIndex(s => !s.targetReached)
      const allBefore = scenarios.slice(0, firstFalseIdx)
      expect(allBefore.every(s => s.targetReached)).toBe(true)
    }
  })
})

// ─── TEST 11 — strategyVersions ──────────────────────────────────────────────

describe('Test 11 — strategyVersions', () => {
  test('tüm senaryolarda strategyVersions 5 alan dolu', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    scenarios.forEach(s => {
      expect(s.strategyVersions.narrative).toBeTruthy()
      expect(s.strategyVersions.eligibility).toBeTruthy()
      expect(s.strategyVersions.threshold).toBeTruthy()
      expect(s.strategyVersions.spillover).toBeTruthy()
      expect(s.strategyVersions.validation).toBeTruthy()
      expect(typeof s.targetReached).toBe('boolean')
    })
  })

  test('rating before/after stringleri dolu', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    scenarios.forEach(s => {
      expect(typeof s.rating.before).toBe('string')
      expect(s.rating.before.length).toBeGreaterThan(0)
      expect(typeof s.rating.after).toBe('string')
      expect(s.rating.after.length).toBeGreaterThan(0)
    })
  })
})

// ─── TEST 12 — Snapshot ──────────────────────────────────────────────────────

describe('Test 12 — Snapshot', () => {
  test('DEKAM target=A snapshot', () => {
    const scenarios = generateScenarios(FULL_DEKAM, { targetRating: 'A', maxScenarios: 7 })
    expect(scenarios.map(s => ({
      label:        s.label,
      actions:      s.actions.map(a => a.actionId),
      targetReached: s.targetReached,
      actionCount:  s.actions.length,
    }))).toMatchSnapshot()
  })

  test('TRADE target=A snapshot', () => {
    const scenarios = generateScenarios(FULL_TRADE, { targetRating: 'A', maxScenarios: 7 })
    expect(scenarios.map(s => ({
      label:        s.label,
      actions:      s.actions.map(a => a.actionId),
      targetReached: s.targetReached,
      actionCount:  s.actions.length,
    }))).toMatchSnapshot()
  })
})
