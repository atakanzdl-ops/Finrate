/**
 * scenarioInstrumentation.test.ts — Engine Enstrümantasyon Testleri (Faz 7.3.38)
 *
 * testEnvironment: 'node' — saf fonksiyonlar, React/jsdom yok.
 *
 * T1: DiagnosticsPayload schema doğrulama
 * T2: serializeDiagnostics deterministik
 * T3: compareWithSonnet doğru diff üretiyor
 * T4: Fixture klasörü mevcut + en az 1 sonnet referansı var
 */

import * as path from 'path'
import * as fs   from 'fs'

import {
  buildDiagnostics,
  serializeDiagnostics,
  compareWithSonnet,
  type DiagnosticsPayload,
  type SonnetReference,
} from '../instrumentation'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURES_ROOT = path.join(__dirname, 'fixtures')
const INSTRUMENTATION_DIR = path.join(FIXTURES_ROOT, 'instrumentation')
const SONNET_REF_DIR      = path.join(FIXTURES_ROOT, 'sonnet-reference')

function makeMinimalEngineResult(opts: {
  currentRating?:     string
  finalTargetRating?: string
  notchesGained?:     number
  portfolio?:         Array<{
    actionId: string
    amountTRY: number
    estimatedNotchContribution: number
  }>
  bindingCeiling?: { source: string; maxRating: string } | null
  guardrails?: unknown[]
}) {
  return {
    currentRating:       opts.currentRating      ?? 'B',
    finalTargetRating:   opts.finalTargetRating  ?? 'B',
    rawTargetRating:     opts.finalTargetRating  ?? 'B',
    notchesGained:       opts.notchesGained      ?? 0,
    confidence:          'MEDIUM',
    confidenceModifier:  1,
    portfolio:           opts.portfolio          ?? [],
    horizons: {
      short:  { actions: [], totalImpact: 0 },
      medium: { actions: [], totalImpact: 0 },
      long:   { actions: [], totalImpact: 0 },
    },
    reasoning: {
      bindingCeiling:     opts.bindingCeiling ?? null,
      supportingCeilings: [],
      drivers:            null,
      missedOpportunities: [],
      oneNotchScenario:   null,
      twoNotchScenario:   null,
      sensitivityAnalysis: null,
      bankerSummary:      '',
      transition:         null,
    },
    layerSummaries: {
      productivity:  null,
      sustainability: null,
      sector:        null,
      guardrails:    opts.guardrails ?? [],
    },
    decisionTrace: [],
  }
}

// ─── T1: DiagnosticsPayload schema doğrulama ──────────────────────────────────

describe('T1 — buildDiagnostics: DiagnosticsPayload schema', () => {

  test('zorunlu alan structure mevcut', () => {
    const engine = makeMinimalEngineResult({ currentRating: 'B', notchesGained: 0 })
    const payload = buildDiagnostics(engine, 'BB', 44, null, null, { company: 'DEKA', period: '2022-ANNUAL' })

    expect(payload).toHaveProperty('scenarioId')
    expect(payload).toHaveProperty('requestedTarget')
    expect(payload).toHaveProperty('current')
    expect(payload).toHaveProperty('actions')
    expect(payload).toHaveProperty('post')
    expect(payload).toHaveProperty('constraints')
    expect(payload).toHaveProperty('decision')
  })

  test('scenarioId deterministik format: COMPANY-PERIOD-target-RATING', () => {
    const engine  = makeMinimalEngineResult({})
    const payload = buildDiagnostics(engine, 'BB', null, null, null, { company: 'DEKA', period: '2022-ANNUAL' })
    expect(payload.scenarioId).toBe('DEKA-2022-ANNUAL-target-BB')
  })

  test('current.rating engine currentRating', () => {
    const engine  = makeMinimalEngineResult({ currentRating: 'CCC' })
    const payload = buildDiagnostics(engine, 'B', 30, null, null)
    expect(payload.current.rating).toBe('CCC')
    expect(payload.current.combinedScore).toBe(30)
  })

  test('actions: actionId/amountTRY/estimatedNotchContribution map edilir', () => {
    const engine = makeMinimalEngineResult({
      portfolio: [
        { actionId: 'A10_CASH_EQUITY_INJECTION', amountTRY: 1_500_000, estimatedNotchContribution: 1.2 },
        { actionId: 'A05_RECEIVABLES_FACTORING', amountTRY: 500_000,   estimatedNotchContribution: 0.5 },
      ],
    })
    const payload = buildDiagnostics(engine, 'BB', null, null, null)
    expect(payload.actions).toHaveLength(2)
    expect(payload.actions[0]).toEqual({
      code:                       'A10_CASH_EQUITY_INJECTION',
      estimatedNotchContribution: 1.2,
      cost:                       1_500_000,
    })
  })

  test('bindingCeiling: SOURCE:maxRating formatında', () => {
    const engine = makeMinimalEngineResult({
      bindingCeiling: { source: 'SEMANTIC_GUARDRAIL', maxRating: 'CCC' },
    })
    const payload = buildDiagnostics(engine, 'BB', null, null, null)
    expect(payload.constraints.bindingCeiling).toBe('SEMANTIC_GUARDRAIL:CCC')
  })

  test('bindingCeiling null → null', () => {
    const engine  = makeMinimalEngineResult({ bindingCeiling: null })
    const payload = buildDiagnostics(engine, 'BB', null, null, null)
    expect(payload.constraints.bindingCeiling).toBeNull()
  })

  test('decision.reachedTarget: notchesGained > 0 → true', () => {
    const engine  = makeMinimalEngineResult({ notchesGained: 2 })
    const payload = buildDiagnostics(engine, 'BB', null, null, null)
    expect(payload.decision.notchesGained).toBe(2)
    expect(payload.decision.reachedTarget).toBe(true)
  })

  test('decision.reachedTarget: notchesGained = 0 → false', () => {
    const engine  = makeMinimalEngineResult({ notchesGained: 0 })
    const payload = buildDiagnostics(engine, 'BB', null, null, null)
    expect(payload.decision.reachedTarget).toBe(false)
  })

  test('post.combinedScore + postActualRating geçirilir', () => {
    const engine  = makeMinimalEngineResult({ finalTargetRating: 'BB' })
    const payload = buildDiagnostics(engine, 'BB', 44, 58, 'BB')
    expect(payload.post.combinedScore).toBe(58)
    expect(payload.post.actualRating).toBe('BB')
    expect(payload.post.engineAchievableTarget).toBe('BB')
  })

  test('null engineResult → güvenli fallback (crash yok)', () => {
    expect(() => buildDiagnostics(null, 'BB', null, null, null)).not.toThrow()
    const payload = buildDiagnostics(null, 'BB', null, null, null)
    expect(payload.current.rating).toBe('')
    expect(payload.actions).toHaveLength(0)
  })

})

// ─── T2: serializeDiagnostics deterministik ───────────────────────────────────

describe('T2 — serializeDiagnostics: deterministik JSON string', () => {

  function makePayload(overrides?: Partial<DiagnosticsPayload>): DiagnosticsPayload {
    return {
      scenarioId:     'DEKA-2022-ANNUAL-target-BB',
      company:        'DEKA',
      period:         '2022-ANNUAL',
      requestedTarget: 'BB',
      current:        { combinedScore: 44, rating: 'B' },
      actions:        [{ code: 'A10_CASH_EQUITY_INJECTION', estimatedNotchContribution: 1.2, cost: 1_500_000 }],
      post:           { combinedScore: null, actualRating: null, engineAchievableTarget: 'B' },
      constraints:    { bindingCeiling: null, guardrails: [] },
      decision:       { notchesGained: 0, reachedTarget: false, sourceMismatch: false },
      ...overrides,
    }
  }

  test('aynı payload → aynı string (deterministik)', () => {
    const p = makePayload()
    expect(serializeDiagnostics(p)).toBe(serializeDiagnostics(p))
  })

  test('serialize → JSON.parse → orijinal ile eşdeğer', () => {
    const p       = makePayload()
    const json    = serializeDiagnostics(p)
    const parsed  = JSON.parse(json) as DiagnosticsPayload
    expect(parsed.scenarioId).toBe(p.scenarioId)
    expect(parsed.current.rating).toBe(p.current.rating)
    expect(parsed.actions[0].code).toBe(p.actions[0].code)
    expect(parsed.decision.notchesGained).toBe(p.decision.notchesGained)
  })

  test('top-level key sırası alfabetik', () => {
    const p    = makePayload()
    const json = serializeDiagnostics(p)
    const keys = Object.keys(JSON.parse(json))
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
  })

  test('valid JSON — parse hatası yok', () => {
    const p = makePayload()
    expect(() => JSON.parse(serializeDiagnostics(p))).not.toThrow()
  })

})

// ─── T3: compareWithSonnet diff ───────────────────────────────────────────────

describe('T3 — compareWithSonnet: engine vs Sonnet diff', () => {

  const sonnetRef: SonnetReference = {
    company:             'DEKA',
    period:              '2022-ANNUAL',
    requestedTarget:     'BB',
    sonnetNotchesGained: 2,
    sonnetActions: [
      { code: 'A10_CASH_EQUITY_INJECTION', estimatedNotchContribution: 0.8 },
      { code: 'A05_RECEIVABLES_FACTORING', estimatedNotchContribution: 0.5 },
      { code: 'A12_COGS_REDUCTION',        estimatedNotchContribution: 0.4 },
      { code: 'A07_INVENTORY_TURNOVER',    estimatedNotchContribution: 0.3 },
    ],
  }

  function makeActual(notchesGained: number, actionCodes: string[]): DiagnosticsPayload {
    return {
      scenarioId:     'DEKA-2022-ANNUAL-target-BB',
      company:        'DEKA',
      period:         '2022-ANNUAL',
      requestedTarget: 'BB',
      current:        { combinedScore: 44, rating: 'B' },
      actions:        actionCodes.map(c => ({ code: c, estimatedNotchContribution: 0, cost: 0 })),
      post:           { combinedScore: null, actualRating: null, engineAchievableTarget: 'B' },
      constraints:    { bindingCeiling: null, guardrails: [] },
      decision:       { notchesGained, reachedTarget: notchesGained > 0, sourceMismatch: false },
    }
  }

  test('engine 0 notch, sonnet 2 notch → notchGap = 2', () => {
    const actual = makeActual(0, [])
    const diff   = compareWithSonnet(actual, sonnetRef)
    expect(diff.notchGap).toBe(2)
    expect(diff.engineNotchesGained).toBe(0)
    expect(diff.sonnetNotchesGained).toBe(2)
  })

  test('engine portföyü boş → tüm sonnet aksiyonları missingActions', () => {
    const actual = makeActual(0, [])
    const diff   = compareWithSonnet(actual, sonnetRef)
    expect(diff.missingActions).toContain('A10_CASH_EQUITY_INJECTION')
    expect(diff.missingActions).toContain('A05_RECEIVABLES_FACTORING')
    expect(diff.missingActions).toHaveLength(4)
    expect(diff.extraActions).toHaveLength(0)
  })

  test('engine portföyünde fazla aksiyon → extraActions', () => {
    const actual = makeActual(1, ['A10_CASH_EQUITY_INJECTION', 'A99_UNKNOWN_ACTION'])
    const diff   = compareWithSonnet(actual, sonnetRef)
    expect(diff.extraActions).toContain('A99_UNKNOWN_ACTION')
    expect(diff.missingActions).not.toContain('A10_CASH_EQUITY_INJECTION')
  })

  test('engine sonnet ile tam aynı → gap 0, missing/extra boş', () => {
    const actual = makeActual(2, [
      'A10_CASH_EQUITY_INJECTION',
      'A05_RECEIVABLES_FACTORING',
      'A12_COGS_REDUCTION',
      'A07_INVENTORY_TURNOVER',
    ])
    const diff = compareWithSonnet(actual, sonnetRef)
    expect(diff.notchGap).toBe(0)
    expect(diff.missingActions).toHaveLength(0)
    expect(diff.extraActions).toHaveLength(0)
    expect(diff.reachedTargetEngine).toBe(true)
  })

})

// ─── T4: Fixture klasörü mevcut + sonnet referansı ────────────────────────────

describe('T4 — Fixture klasörleri: mevcut + en az 1 referans', () => {

  test('fixtures/instrumentation/ klasörü mevcut', () => {
    expect(fs.existsSync(INSTRUMENTATION_DIR)).toBe(true)
    const stat = fs.statSync(INSTRUMENTATION_DIR)
    expect(stat.isDirectory()).toBe(true)
  })

  test('fixtures/sonnet-reference/ klasörü mevcut', () => {
    expect(fs.existsSync(SONNET_REF_DIR)).toBe(true)
    const stat = fs.statSync(SONNET_REF_DIR)
    expect(stat.isDirectory()).toBe(true)
  })

  test('DEKA-2022.json mevcut ve geçerli JSON', () => {
    const filePath = path.join(SONNET_REF_DIR, 'DEKA-2022.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(() => JSON.parse(content)).not.toThrow()
    const ref = JSON.parse(content) as SonnetReference
    expect(ref.company).toBe('DEKA')
    expect(ref.sonnetNotchesGained).toBeGreaterThan(0)
    expect(ref.sonnetActions.length).toBeGreaterThan(0)
  })

  test('DEKA-2022.json sonnet aksiyon kodları dolu', () => {
    const filePath = path.join(SONNET_REF_DIR, 'DEKA-2022.json')
    const ref      = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SonnetReference
    for (const action of ref.sonnetActions) {
      expect(typeof action.code).toBe('string')
      expect(action.code.length).toBeGreaterThan(0)
    }
  })

  test('example-template.json mevcut ve geçerli JSON', () => {
    const filePath = path.join(INSTRUMENTATION_DIR, 'example-template.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(() => JSON.parse(content)).not.toThrow()
  })

})
