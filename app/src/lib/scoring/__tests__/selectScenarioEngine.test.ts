/**
 * selectScenarioEngine testleri — Faz 6b
 */

import { isMultiScenarioV3Enabled } from '../sectorStrategy/featureFlags'

function createMockScenario(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'scenario-1',
    label: 'Likidite odakli senaryo',
    targetRating: 'A',
    targetReached: true,
    actions: [
      {
        actionId: 'A05',
        narrativeCategory: 'activity',
        attribution: { objectiveDelta: 2.1, combinedDelta: 1.4 },
        eligibility: { decision: 'allow' },
      },
    ],
    beforeState: {
      ratios: {},
      objective: {
        liquidity: 45,
        activity: 40,
        leverage: 38,
        profitability: 42,
        total: 41,
      },
      combined: 54,
    },
    afterState: {
      ratios: {},
      objective: {
        liquidity: 58,
        activity: 52,
        leverage: 45,
        profitability: 50,
        total: 52,
      },
      combined: 63,
    },
    combinedDelta: 9,
    objectiveDelta: 11,
    rating: { before: 'BB', after: 'A' },
    warnings: [],
    strategyVersions: {
      narrative: 'test',
      eligibility: 'test',
      threshold: 'test',
      spillover: 'test',
      validation: 'test',
    },
    ...overrides,
  }
}

// Process.env izolasyonu
let originalFlag: string | undefined
beforeEach(() => {
  originalFlag = process.env.ENABLE_MULTI_SCENARIO_V3
})
afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.ENABLE_MULTI_SCENARIO_V3
  } else {
    process.env.ENABLE_MULTI_SCENARIO_V3 = originalFlag
  }
  jest.resetModules()
})

describe('isMultiScenarioV3Enabled', () => {
  test('undefined → false', () => {
    delete process.env.ENABLE_MULTI_SCENARIO_V3
    expect(isMultiScenarioV3Enabled()).toBe(false)
  })

  test('"false" → false', () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'false'
    expect(isMultiScenarioV3Enabled()).toBe(false)
  })

  test('"true" → true', () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    expect(isMultiScenarioV3Enabled()).toBe(true)
  })
})

describe('targetRatingToScore normalize (Bulgu #20 kalan)', () => {
  const { DEKAM_INPUT, DEKAM_SECTOR } = require('../__fixtures__/syntheticEntities')
  const FULL_DEKAM = { ...DEKAM_INPUT, sector: DEKAM_SECTOR }

  test('"a" ve "A" aynı senaryo sayısı üretir', async () => {
    const { generateScenarios } = await import('../scenarioV3/scenarioGenerator')
    const r1 = generateScenarios(FULL_DEKAM, { targetRating: 'a' })
    const r2 = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    expect(r1.length).toBe(r2.length)
    // action ID'leri eşit (stabil)
    expect(r1.map((s: any) => s.actions.map((a: any) => a.actionId))).toEqual(
      r2.map((s: any) => s.actions.map((a: any) => a.actionId))
    )
  })

  test('" A " (boşluk) ve "A" aynı sonuç', async () => {
    const { generateScenarios } = await import('../scenarioV3/scenarioGenerator')
    const r1 = generateScenarios(FULL_DEKAM, { targetRating: ' A ' })
    const r2 = generateScenarios(FULL_DEKAM, { targetRating: 'A' })
    expect(r1.length).toBe(r2.length)
  })
})

describe('selectScenarioEngine — flag=true (adapter contract)', () => {
  test('v3 success path EngineResult shape d\u00f6ner ve decision layer crash etmez', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    jest.resetModules()

    const loggedEvents: string[] = []
    const mockScenario = createMockScenario()

    jest.mock('../scenarioV3/scenarioGenerator', () => ({
      generateScenarios: jest.fn().mockResolvedValue([mockScenario]),
    }))
    jest.mock('../scenarioV3/engineV3', () => ({
      runEngineV3: jest.fn().mockResolvedValue({ shouldNotBeUsed: true }),
    }))
    jest.mock('../../logger', () => ({
      logEvent: jest.fn((event: string) => { loggedEvents.push(event) }),
      generateCorrelationId: jest.fn(() => 'test-corr'),
    }))

    const { selectScenarioEngine } = await import('../selectScenarioEngine')
    const { buildDecisionAnswer } = await import('../scenarioV3/decisionLayer')

    const result = await selectScenarioEngine({
      sector: 'CONSTRUCTION',
      currentRating: 'BB',
      targetRating: 'A',
      accountBalances: { 100: 1_000_000, 500: 1_000_000 },
      incomeStatement: {
        netSales: 5_000_000,
        costOfGoodsSold: 3_000_000,
        grossProfit: 2_000_000,
        operatingProfit: 1_000_000,
        netIncome: 700_000,
        interestExpense: 200_000,
      },
    })

    expect(result).toHaveProperty('version', 'v3')
    expect(result).toHaveProperty('reasoning')
    expect(result).toHaveProperty('horizons.short.actions')
    expect(() => buildDecisionAnswer(result, 'A', null, { 100: 1_000_000 })).not.toThrow()
    expect(loggedEvents).toEqual(['engine_selected'])
  })
})

describe('selectScenarioEngine — flag=false (v2 path)', () => {
  test('flag=false → runEngineV3 çağrılır', async () => {
    delete process.env.ENABLE_MULTI_SCENARIO_V3
    jest.resetModules()

    const mockV2Result = { scenarios: [], engine: 'v2' }
    jest.mock('../scenarioV3/engineV3', () => ({
      runEngineV3: jest.fn().mockResolvedValue(mockV2Result),
    }))
    jest.mock('../scenarioV3/scenarioGenerator', () => ({
      generateScenarios: jest.fn().mockRejectedValue(new Error('Should not be called')),
    }))

    const { selectScenarioEngine } = await import('../selectScenarioEngine')
    const result = await selectScenarioEngine({})
    expect(result).toEqual(mockV2Result)
  })
})

describe('selectScenarioEngine — PRIMARY fallback (v3 fail → v2)', () => {
  test('v3 throw → v2 success + 3 log event', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    jest.resetModules()

    const v3Error = new Error('v3 simulated failure')
    const mockV2Result = { scenarios: [], engine: 'v2-fallback' }
    const loggedEvents: string[] = []

    jest.mock('../scenarioV3/scenarioGenerator', () => ({
      generateScenarios: jest.fn().mockRejectedValue(v3Error),
    }))
    jest.mock('../scenarioV3/engineV3', () => ({
      runEngineV3: jest.fn().mockResolvedValue(mockV2Result),
    }))
    jest.mock('../../logger', () => ({
      logEvent: jest.fn((event: string) => { loggedEvents.push(event) }),
      generateCorrelationId: jest.fn(() => 'test-corr'),
    }))

    const { selectScenarioEngine } = await import('../selectScenarioEngine')
    const result = await selectScenarioEngine({})

    expect(result).toEqual(mockV2Result)
    expect(loggedEvents).toContain('engine_error')
    expect(loggedEvents).toContain('fallback')
    expect(loggedEvents).toContain('engine_selected')
    expect(loggedEvents).toHaveLength(3)
  })
})

describe('selectScenarioEngine — DOUBLE FAIL (v3 + v2 throw)', () => {
  test('v3 + v2 throw → original v3 error + 4 log events', async () => {
    process.env.ENABLE_MULTI_SCENARIO_V3 = 'true'
    jest.resetModules()

    const v3Error = new Error('v3 simulated failure')
    const v2Error = new Error('v2 simulated failure')
    const loggedEvents: string[] = []

    jest.mock('../scenarioV3/scenarioGenerator', () => ({
      generateScenarios: jest.fn().mockRejectedValue(v3Error),
    }))
    jest.mock('../scenarioV3/engineV3', () => ({
      runEngineV3: jest.fn().mockRejectedValue(v2Error),
    }))
    jest.mock('../../logger', () => ({
      logEvent: jest.fn((event: string) => { loggedEvents.push(event) }),
      generateCorrelationId: jest.fn(() => 'test-corr'),
    }))

    const { selectScenarioEngine } = await import('../selectScenarioEngine')

    // ORIGINAL v3 error throw edilmeli
    await expect(selectScenarioEngine({})).rejects.toThrow('v3 simulated failure')

    // 4 log event: engine_error(v3) + fallback + engine_error(v2) + engine_double_fail
    expect(loggedEvents).toHaveLength(4)
    expect(loggedEvents.filter((e: string) => e === 'engine_error')).toHaveLength(2)
    expect(loggedEvents).toContain('fallback')
    expect(loggedEvents).toContain('engine_double_fail')
  })
})
