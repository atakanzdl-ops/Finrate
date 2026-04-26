/**
 * entityValidation unit testleri — Faz 5.0
 *
 * Test grupları:
 *   1. Geçerli tam entity → valid=true
 *   2. Hard fail: sector eksik
 *   3. Hard fail: revenue 0 veya eksik
 *   4. Hard fail: totalAssets 0 veya eksik
 *   5. Soft warning: bilinmeyen sektör
 *   6. Aksiyon skip kararı
 *   7. validateEntityForAction
 *   8. summarizeFatalErrors
 *
 * Ref: docs/PHASE_1_FINDINGS.md (Bulgu #8)
 */

import {
  validateEntityForScenarioGeneration,
  validateEntityForAction,
  summarizeFatalErrors,
  VALIDATION_STRATEGY_VERSION,
} from '../entityValidation'
import {
  DEKAM_INPUT,
  DEKAM_SECTOR,
} from '../../__fixtures__/syntheticEntities'

// DEKAM_INPUT'u sector ile birleştir (fixture sector içermiyor, ayrı parametre olarak geliyor)
const FULL_DEKAM = { ...DEKAM_INPUT, sector: DEKAM_SECTOR }

// ──────────────────────────────────────────────────────────────────────────────
// TEST 1 — Geçerli tam entity
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 1 — Geçerli tam entity', () => {
  const result = validateEntityForScenarioGeneration(FULL_DEKAM)

  test('valid=true', () => {
    expect(result.valid).toBe(true)
  })

  test('errors boş', () => {
    expect(result.errors).toHaveLength(0)
  })

  test('skipActions boş (tüm gerekli alanlar dolu)', () => {
    // DEKAM_INPUT: tradeReceivables, inventory, shortTermFinancialDebt,
    //              totalEquity, grossProfit — hepsi mevcut
    expect(result.skipActions).toHaveLength(0)
  })

  test('VALIDATION_STRATEGY_VERSION formatı geçerli', () => {
    expect(VALIDATION_STRATEGY_VERSION).toMatch(/^5\.0-\d{4}-\d{2}-\d{2}$/)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 2 — Hard fail: sector eksik
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 2 — Hard fail: sector eksik', () => {
  test('sector=undefined → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: undefined })
    expect(result.valid).toBe(false)
  })

  test('sector=null → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: null })
    expect(result.valid).toBe(false)
  })

  test('sector="" → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: '' })
    expect(result.valid).toBe(false)
  })

  test('sector="   " (boşluk) → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: '   ' })
    expect(result.valid).toBe(false)
  })

  test('errors[0].field === "sector"', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: undefined })
    expect(result.errors[0].field).toBe('sector')
    expect(result.errors[0].severity).toBe('fatal')
  })

  test('null entity → valid=false', () => {
    const result = validateEntityForScenarioGeneration(null)
    expect(result.valid).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 3 — Hard fail: revenue 0 veya eksik
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 3 — Hard fail: revenue', () => {
  test('revenue=0 → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, revenue: 0 })
    expect(result.valid).toBe(false)
  })

  test('revenue=undefined → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, revenue: undefined })
    expect(result.valid).toBe(false)
  })

  test('revenue negatif → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, revenue: -100 })
    expect(result.valid).toBe(false)
  })

  test('errors içinde revenue field var', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, revenue: 0 })
    expect(result.errors.some(e => e.field === 'revenue')).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 4 — Hard fail: totalAssets 0 veya eksik
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 4 — Hard fail: totalAssets', () => {
  test('totalAssets=0 → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, totalAssets: 0 })
    expect(result.valid).toBe(false)
  })

  test('totalAssets=undefined → valid=false', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, totalAssets: undefined })
    expect(result.valid).toBe(false)
  })

  test('errors içinde totalAssets field var', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, totalAssets: undefined })
    expect(result.errors.some(e => e.field === 'totalAssets')).toBe(true)
  })

  test('birden fazla hard fail → errors dizisi birden fazla hata içerir', () => {
    const result = validateEntityForScenarioGeneration({
      ...FULL_DEKAM,
      revenue: 0,
      totalAssets: 0,
    })
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 5 — Soft warning: bilinmeyen sektör
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 5 — Soft warning: bilinmeyen sektör', () => {
  const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: 'Tarım' })

  test('valid=true (fatal değil, sadece uyarı)', () => {
    expect(result.valid).toBe(true)
  })

  test('errors boş', () => {
    expect(result.errors).toHaveLength(0)
  })

  test('warnings içinde "Bilinmeyen sektör" mesajı var', () => {
    expect(result.warnings.some(w => w.message.toLowerCase().includes('bilinmeyen sektör'))).toBe(true)
  })

  test('warnings[0].field === "sector"', () => {
    const sectorWarning = result.warnings.find(w => w.field === 'sector')
    expect(sectorWarning).toBeDefined()
    expect(sectorWarning?.severity).toBe('warning')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 6 — Aksiyon skip kararı
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 6 — Aksiyon skip kararı', () => {
  test('inventory=null → A06 skipActions listesinde', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, inventory: null })
    expect(result.skipActions).toContain('A06')
  })

  test('inventory=null → valid=true (skip uyarı, fatal değil)', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, inventory: null })
    expect(result.valid).toBe(true)
  })

  test('totalEquity=undefined → A12 skipActions listesinde', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, totalEquity: undefined })
    expect(result.skipActions).toContain('A12')
  })

  test('tradeReceivables=null → A05 skipActions listesinde', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, tradeReceivables: null })
    expect(result.skipActions).toContain('A05')
  })

  test('shortTermFinancialDebt=null → A10 skipActions listesinde', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, shortTermFinancialDebt: null })
    expect(result.skipActions).toContain('A10')
  })

  test('grossProfit=null → A18 skipActions listesinde', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, grossProfit: null })
    expect(result.skipActions).toContain('A18')
  })

  test('sadece inventory eksik → diğer aksiyonlar skip listesinde değil', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, inventory: null })
    expect(result.skipActions).not.toContain('A05')
    expect(result.skipActions).not.toContain('A10')
    expect(result.skipActions).not.toContain('A12')
    expect(result.skipActions).not.toContain('A18')
  })

  test('iki alan eksik → iki aksiyon skip, valid=true', () => {
    const result = validateEntityForScenarioGeneration({
      ...FULL_DEKAM,
      inventory:   null,
      totalEquity: undefined,
    })
    expect(result.skipActions).toContain('A06')
    expect(result.skipActions).toContain('A12')
    expect(result.valid).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 7 — validateEntityForAction
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 7 — validateEntityForAction', () => {
  test('tam entity ile A05 → true', () => {
    expect(validateEntityForAction(FULL_DEKAM, 'A05')).toBe(true)
  })

  test('tam entity ile A06 → true', () => {
    expect(validateEntityForAction(FULL_DEKAM, 'A06')).toBe(true)
  })

  test('tam entity ile A18 → true', () => {
    expect(validateEntityForAction(FULL_DEKAM, 'A18')).toBe(true)
  })

  test('tradeReceivables=undefined entity ile A05 → false', () => {
    expect(validateEntityForAction({ ...FULL_DEKAM, tradeReceivables: undefined }, 'A05')).toBe(false)
  })

  test('inventory=null entity ile A06 → false', () => {
    expect(validateEntityForAction({ ...FULL_DEKAM, inventory: null }, 'A06')).toBe(false)
  })

  test('totalEquity=undefined entity ile A12 → false', () => {
    expect(validateEntityForAction({ ...FULL_DEKAM, totalEquity: undefined }, 'A12')).toBe(false)
  })

  test('null entity → false (defensive)', () => {
    expect(validateEntityForAction(null, 'A05')).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// TEST 8 — summarizeFatalErrors
// ──────────────────────────────────────────────────────────────────────────────

describe('Test 8 — summarizeFatalErrors', () => {
  test('geçerli result → boş string', () => {
    const result = validateEntityForScenarioGeneration(FULL_DEKAM)
    expect(summarizeFatalErrors(result)).toBe('')
  })

  test('hatalı result → ❌ formatlı mesaj içerir', () => {
    const result = validateEntityForScenarioGeneration({ ...FULL_DEKAM, sector: undefined })
    const msg = summarizeFatalErrors(result)
    expect(msg).toContain('❌')
    expect(msg).toContain('sector')
  })

  test('iki hata → iki satır', () => {
    const result = validateEntityForScenarioGeneration({
      ...FULL_DEKAM,
      revenue: 0,
      totalAssets: undefined,
    })
    const lines = summarizeFatalErrors(result).split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})
