/**
 * R6 — A13_OPEX_OPTIMIZATION Devre Dışı Testleri
 *
 * R6 değişikliği:
 *   - preconditions.customCheck: () => ({ pass: false, reason: '...' })
 *   - Aksiyon katalogda kalıyor (DB backward compat — roadmapSnapshot JSON)
 *   - buildTransactions: () => [] (R5'ten bu yana projeksiyon aksiyon idi)
 *
 * Atakan Karar: A13 işlevselliği A21_OPERATING_PROFIT_REFORM'a taşındı.
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import { runEngineV3 } from '../engineV3'
import type { FirmContext, ActionBuildContext } from '../contracts'
import type { EngineInput } from '../engineV3'

const a13 = ACTION_CATALOG_V3['A13_OPEX_OPTIMIZATION']

// ─── Katalog düzey testleri ───────────────────────────────────────────────────

describe('R6 — A13_OPEX_OPTIMIZATION devre dışı', () => {

  // T1: customCheck her zaman false döner
  test('T1 — customCheck her zaman false döner (hangi context olursa olsun)', () => {
    // customCheck analysis: unknown alır — içeriği önemli değil
    const result = (a13.preconditions.customCheck as (a: unknown) => { pass: boolean; reason?: string })({
      accounts: [
        { accountCode: '630', amount: 10_000_000 },
        { accountCode: '632', amount: 8_000_000 },
      ],
      sector: 'TRADE',
    })
    expect(result.pass).toBe(false)
  })

  // T2: Reason string kullanıcı dostu (R5/A13/A21 teknik ID içermemeli)
  test('T2 — Reason string kullanıcı diline uygun (teknik ID içermez)', () => {
    const result = (a13.preconditions.customCheck as (a: unknown) => { pass: boolean; reason?: string })({})
    expect(result.reason).toBeDefined()
    // Kullanıcı dili: teknik aksiyon ID içermemeli
    expect(result.reason).not.toMatch(/A13/)
    expect(result.reason).not.toMatch(/A21/)
    expect(result.reason).not.toMatch(/R5/)
    expect(result.reason).not.toMatch(/R6/)
    // Türkçe mesaj içermeli
    expect(result.reason!.length).toBeGreaterThan(10)
  })

  // T3: buildTransactions hâlâ [] (projeksiyon aksiyon — değişmedi)
  test('T3 — buildTransactions [] döner (projeksiyon aksiyon)', () => {
    const buildCtx: ActionBuildContext = {
      amount:          5_000_000,
      sector:          'TRADE',
      horizon:         'medium',
      analysis:        {},
      previousActions: [],
    }
    expect(a13.buildTransactions(buildCtx)).toHaveLength(0)
  })

  // T4: Katalogda var (ID korundu — DB backward compat)
  test('T4 — Katalogda mevcut (roadmapSnapshot backward compat)', () => {
    expect(ACTION_CATALOG_V3['A13_OPEX_OPTIMIZATION']).toBeDefined()
    expect(a13.id).toBe('A13_OPEX_OPTIMIZATION')
  })

})

// ─── Engine entegrasyon testi ─────────────────────────────────────────────────

describe('R6 — A13 engine entegrasyonu', () => {

  const HIGH_OPEX_INPUT: EngineInput = {
    sector:        'TRADE',
    currentRating: 'BB',
    targetRating:  'BBB',
    accountBalances: {
      '102': 10_000_000,
      '120': 20_000_000,
      '153': 15_000_000,
      '300': 20_000_000,
      '320': 10_000_000,
      '500': 30_000_000,
      '570': 20_000_000,
      '630': 20_000_000,  // yüksek faaliyet gideri → A13 tetiklenirdi
      '632': 15_000_000,
    },
    incomeStatement: {
      netSales:          100_000_000,
      costOfGoodsSold:    60_000_000,
      grossProfit:        40_000_000,
      operatingProfit:    10_000_000,
      netIncome:           6_000_000,
      interestExpense:     2_000_000,
      operatingCashFlow:   5_000_000,
    },
  }

  // T5: A13 yüksek opex ortamında bile seçilmemeli (customCheck false)
  test('T5 — Yüksek opex firmada A13 portfolio dışı (devre dışı)', () => {
    const result = runEngineV3(HIGH_OPEX_INPUT)

    const allActionIds = result.portfolio.map(a => a.actionId)
    expect(allActionIds).not.toContain('A13_OPEX_OPTIMIZATION')
  })

})
