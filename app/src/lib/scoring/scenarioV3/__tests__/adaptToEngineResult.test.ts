import { buildDecisionAnswer } from '../decisionLayer'
import type { ScenarioV3 } from '../contracts'
import type { EngineInput } from '../engineV3'
import { runEngineV3 } from '../engineV3'
import {
  adaptScenariosV3ToEngineResult,
  isEngineResultLike,
} from '../adaptToEngineResult'

function createAdapterInput(): EngineInput {
  return {
    sector: 'CONSTRUCTION',
    currentRating: 'BB',
    targetRating: 'A',
    accountBalances: {
      100: 1_000_000,
      120: 2_200_000,
      153: 1_500_000,
      250: 3_000_000,
      300: 2_000_000,
      320: 1_500_000,
      500: 4_000_000,
      590: 1_200_000,
    },
    incomeStatement: {
      netSales: 12_000_000,
      costOfGoodsSold: 8_000_000,
      grossProfit: 4_000_000,
      operatingProfit: 2_100_000,
      netIncome: 1_250_000,
      interestExpense: 500_000,
      operatingCashFlow: 900_000,
    },
  }
}

function createScenario(): ScenarioV3 {
  return {
    id: 's-1',
    label: 'Likidite odakli kombinasyon',
    targetRating: 'A',
    targetReached: true,
    actions: [
      {
        actionId: 'A05' as any,
        narrativeCategory: 'activity',
        attribution: { objectiveDelta: 2.4, combinedDelta: 1.1 } as any,
        eligibility: { decision: 'allow' },
      },
      {
        actionId: 'A10' as any,
        narrativeCategory: 'leverage',
        attribution: { objectiveDelta: 1.7, combinedDelta: 0.9 } as any,
        eligibility: { decision: 'allow' },
      },
    ],
    beforeState: {
      ratios: {},
      objective: {
        liquidity: 42,
        activity: 37,
        leverage: 41,
        profitability: 40,
        total: 40,
      },
      combined: 53,
    },
    afterState: {
      ratios: {},
      objective: {
        liquidity: 56,
        activity: 48,
        leverage: 51,
        profitability: 49,
        total: 51,
      },
      combined: 64,
    },
    combinedDelta: 11,
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
  }
}

describe('adaptScenariosV3ToEngineResult', () => {
  test('EngineResult contract shape üretir ve decision layer ile uyumludur', () => {
    const input = createAdapterInput()
    const adapted = adaptScenariosV3ToEngineResult([createScenario()], input)

    expect(isEngineResultLike(adapted)).toBe(true)
    expect(adapted).toHaveProperty('version', 'v3')
    expect(adapted).toHaveProperty('reasoning.transition')
    expect(adapted).toHaveProperty('horizons.short.actions')
    expect(() => buildDecisionAnswer(adapted, 'A', null, input.accountBalances)).not.toThrow()
  })

  test('boş scenario listesinde de EngineResult contract korunur', () => {
    const input = createAdapterInput()
    const adapted = adaptScenariosV3ToEngineResult([], input)

    expect(isEngineResultLike(adapted)).toBe(true)
    expect(adapted.notchesGained).toBe(0)
    expect(adapted.portfolio).toEqual([])
  })

  test('v2 output ile top-level ve kritik nested key set parity korunur', () => {
    const input = createAdapterInput()
    const v2Result = runEngineV3(input)
    const v3Adapted = adaptScenariosV3ToEngineResult([createScenario()], input)

    expect(Object.keys(v3Adapted).sort()).toEqual(Object.keys(v2Result).sort())
    expect(Object.keys(v3Adapted.reasoning).sort()).toEqual(Object.keys(v2Result.reasoning).sort())
    expect(Object.keys(v3Adapted.layerSummaries).sort()).toEqual(Object.keys(v2Result.layerSummaries).sort())
  })
})
