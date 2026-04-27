import { formatScenariosForResponse } from '../responseMapper'
import { getActionTemplateV3 } from '../actionCatalogV3'
import type { ScenarioV3 } from '../contracts'

const REAL_ACTION_ID = 'A01_ST_FIN_DEBT_TO_LT'

function makeScenario(overrides: Partial<ScenarioV3> = {}): ScenarioV3 {
  return {
    id:            'sc-1',
    label:         'Test Scenario',
    targetReached: true,
    actions:       [],
    beforeState:   {} as ScenarioV3['beforeState'],
    afterState:    {} as ScenarioV3['afterState'],
    combinedDelta:  5,
    objectiveDelta: 3,
    rating: { before: 'C', after: 'B' },
    warnings:      [],
    strategyVersions: {
      narrative:   'v1',
      eligibility: 'v1',
      threshold:   'v1',
      spillover:   'v1',
      validation:  'v1',
    },
    ...overrides,
  }
}

function makeAction(actionId: string): ScenarioV3['actions'][number] {
  return {
    actionId:          actionId as ScenarioV3['actions'][number]['actionId'],
    narrativeCategory: 'liquidity',
    attribution:       {} as ScenarioV3['actions'][number]['attribution'],
    eligibility:       {} as ScenarioV3['actions'][number]['eligibility'],
  }
}

describe('formatScenariosForResponse', () => {
  test('empty array returns empty array', () => {
    expect(formatScenariosForResponse([])).toEqual([])
  })

  test('single scenario maps all DTO fields correctly', () => {
    const scenario = makeScenario({
      id:             'sc-test-1',
      label:          'Liquidity Improvement',
      combinedDelta:  12,
      objectiveDelta: 8,
      rating: { before: 'CCC', after: 'B' },
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.id).toBe('sc-test-1')
    expect(dto.label).toBe('Liquidity Improvement')
    expect(dto.targetReached).toBe(true)
    expect(dto.combinedDelta).toBe(12)
    expect(dto.objectiveDelta).toBe(8)
    expect(dto.rating.before).toBe('CCC')
    expect(dto.rating.after).toBe('B')
    expect(dto.actionCount).toBe(0)
    expect(dto.actionsPreview).toEqual([])
    expect(dto.warnings).toEqual([])
  })

  test('three actions produce preview of length 2', () => {
    const scenario = makeScenario({
      actions: [makeAction('A01_a'), makeAction('A02_b'), makeAction('A03_c')],
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.actionsPreview).toHaveLength(2)
    expect(dto.actionCount).toBe(3)
  })

  test('one action produces preview of length 1', () => {
    const scenario = makeScenario({
      actions: [makeAction('A01_x')],
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.actionsPreview).toHaveLength(1)
    expect(dto.actionCount).toBe(1)
  })

  test('actionId not in catalog falls back to actionId as label', () => {
    const scenario = makeScenario({
      actions: [makeAction('NONEXISTENT_SENTINEL_ID')],
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.actionsPreview[0].label).toBe('NONEXISTENT_SENTINEL_ID')
    expect(dto.actionsPreview[0].actionId).toBe('NONEXISTENT_SENTINEL_ID')
  })

  test('real catalog actionId resolves to template name', () => {
    const expectedName = getActionTemplateV3(REAL_ACTION_ID)?.name
    expect(expectedName).toBeDefined()

    const scenario = makeScenario({
      actions: [makeAction(REAL_ACTION_ID)],
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.actionsPreview[0].label).toBe(expectedName)
    expect(dto.actionsPreview[0].label).not.toBe(REAL_ACTION_ID)
  })

  test('warnings array passes through unchanged', () => {
    const scenario = makeScenario({
      warnings: ['low-liquidity', 'missing-data'],
    })
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.warnings).toEqual(['low-liquidity', 'missing-data'])
  })

  test('warnings undefined coerces to empty array', () => {
    const scenario = makeScenario()
    delete (scenario as { warnings?: string[] }).warnings
    const [dto] = formatScenariosForResponse([scenario])

    expect(dto.warnings).toEqual([])
  })
})
