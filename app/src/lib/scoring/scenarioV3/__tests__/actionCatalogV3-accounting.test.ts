/**
 * Faz 7.3.6A1/A2 — Muhasebe bacağı doğrulama testleri.
 *
 * Projeksiyon aksiyonları (A12/A13/A14/A16/A17/A18/A19/A20) yevmiye üretmez.
 * A20 expectedEconomicImpact.createsRealCash → false (hasılata alma; tahsilat ayrı).
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { ActionBuildContext } from '../contracts'

function makeContext(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount: 5_000_000,
    sector: 'CONSTRUCTION',
    horizon: 'medium',
    analysis: {},
    previousActions: [],
    ...overrides,
  }
}

// ─── Projeksiyon aksiyonları boş array döner ─────────────────────────────────

describe('Faz 7.3.6A1/A2 — Projeksiyon aksiyonları boş array döner', () => {
  const projectionActionIds = [
    'A12_GROSS_MARGIN_IMPROVEMENT',
    'A13_OPEX_OPTIMIZATION',
    'A14_FINANCE_COST_REDUCTION',
    'A16_CASH_BUFFER_BUILD',
    'A17_KKEG_CLEANUP',
    'A18_NET_SALES_GROWTH',
    'A19_ADVANCE_TO_REVENUE',
    'A20_YYI_MONETIZATION',
  ]

  test.each(projectionActionIds)('%s buildTransactions boş array döner', (actionId) => {
    const action = ACTION_CATALOG_V3[actionId]
    expect(action).toBeDefined()
    const txs = action!.buildTransactions(makeContext())
    expect(Array.isArray(txs)).toBe(true)
    expect(txs.length).toBe(0)
  })
})

// ─── A20 expectedEconomicImpact düzeltmesi ───────────────────────────────────

describe('Faz 7.3.6A2 — A20 expectedEconomicImpact düzeltmesi', () => {
  const a20 = ACTION_CATALOG_V3['A20_YYI_MONETIZATION']

  test('A20 tanımlı', () => {
    expect(a20).toBeDefined()
  })

  test('A20 createsRealCash false (hasılata alma, nakit yaratmaz)', () => {
    expect(a20.expectedEconomicImpact.createsRealCash).toBe(false)
  })

  test('A20 strengthensOperations hâlâ true (operasyonel etki var)', () => {
    expect(a20.expectedEconomicImpact.strengthensOperations).toBe(true)
  })
})
