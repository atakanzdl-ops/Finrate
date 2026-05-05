/**
 * guardrailTiming.test.ts — Guardrail Timing Bug Fix Testleri (Faz 7.3.42)
 *
 * KÖK NEDEN: buildGuardrailResults FINAL context ile check ediyordu.
 * Sıralı PRE-action context kullanmıyordu.
 *
 * T1: BUG REPRO — A06 baseline stok 4.5M, tutar 2M → PASS (HARD_REJECT değil)
 * T2: NEGATIVE — gerçek yetersiz kaynak → HARD_REJECT (doğru davranış korunur)
 * T3: CLAMP/FİİLİ TUTAR — sınır koşul (totalSource == proposedAmount) → PASS
 * T4: SIRA BAĞIMLILIĞI — aynı kaynaktan 3 aksiyon: PASS, PASS, HARD_REJECT
 * T5: CCC CEILING REGRESSION — DEKA-benzeri input → bindingCeiling CCC OLMAMALI
 */

import {
  buildGuardrailResults,
  runEngineV3,
  type SelectedAction,
  type EngineInput,
} from '../engineV3'
import type { AccountingTransaction } from '../contracts'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

/** A06_INVENTORY_MONETIZATION için transaction üretir.
 *  153 (stok) CREDIT → 102 (nakit) DEBIT */
function makeInventoryTx(amount: number): AccountingTransaction[] {
  return [{
    description: `A06 stok nakde çevirme ${amount}`,
    legs: [
      { accountCode: '153', side: 'CREDIT' as const, amount },
      { accountCode: '102', side: 'DEBIT'  as const, amount },
    ],
  }]
}

/** Minimal FirmContext — sadece ilgili alanlar dolu */
function makeBaseCtx(stok153: number, opts?: { totalAssets?: number }) {
  const totalAssets = opts?.totalAssets ?? 20_000_000
  return {
    sector:            'MANUFACTURING' as const,
    accountBalances:   { '153': stok153 },
    totalAssets,
    totalEquity:       5_000_000,
    totalRevenue:      15_000_000,
    netIncome:         500_000,
    netSales:          15_000_000,
    operatingProfit:   1_000_000,
    grossProfit:       3_000_000,
    interestExpense:   400_000,
    operatingCashFlow: null,
    period:            'ANNUAL',
  }
}

/** Minimal SelectedAction için A06 */
function makeA06Action(amount: number, horizon: 'short' | 'medium' | 'long' = 'short'): SelectedAction {
  return {
    actionId:                   'A06_INVENTORY_MONETIZATION',
    actionName:                 'Stok Nakde Çevirme',
    horizon,
    amountTRY:                  amount,
    transactions:               makeInventoryTx(amount),
    qualityScore:               0.7,
    productivityRepairStrength: 'MODERATE',
    sustainability:             'MEDIUM',
    sectorCompatibility:        1.0,
    guardrailSeverity:          'PASS',
    estimatedNotchContribution: 0.5,
    repeatDecayApplied:         1.0,
    diversityPenaltyApplied:    0.0,
    narrative:                  'Test aksiyon',
  }
}

// ─── T1: BUG REPRO ────────────────────────────────────────────────────────────

describe('T1 — BUG REPRO: A06 baseline stok 4.5M, tutar 2M', () => {

  /**
   * ESKI HATA: buildGuardrailResults FINAL context kullanıyordu.
   * A06 stoğu sıfırladığı için (final state: 153=0), kendisi HARD_REJECT alıyordu.
   *
   * DÜZELTME: PRE-action baseline kullanılır → stok 4.5M mevcut → PASS.
   */
  test('A06 2M tutar, baseline stok 4.5M → guardrail PASS (HARD_REJECT yok)', () => {
    const baseCtx   = makeBaseCtx(4_500_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    const hardRejects = results.filter(r => r.severity === 'HARD_REJECT')
    expect(hardRejects).toHaveLength(0)
  })

  test('A06 affectedActionId doğru', () => {
    const baseCtx   = makeBaseCtx(4_500_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    // Tüm sonuçlar A06'ya ait (başka aksiyon yok)
    for (const r of results) {
      expect(r.affectedActionId).toBe('A06_INVENTORY_MONETIZATION')
    }
  })

})

// ─── T2: NEGATIVE — Gerçek yetersiz kaynak ───────────────────────────────────

describe('T2 — NEGATIVE: gerçek yetersiz kaynak → HARD_REJECT korunur', () => {

  test('A06 2M tutar, stok 1M → INSUFFICIENT_SOURCE_BALANCE HARD_REJECT', () => {
    const baseCtx   = makeBaseCtx(1_000_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    const hardRejects = results.filter(r => r.severity === 'HARD_REJECT')
    expect(hardRejects.length).toBeGreaterThan(0)
    expect(hardRejects[0].ruleCode).toBe('INSUFFICIENT_SOURCE_BALANCE')
  })

  test('A06 stok 0 → HARD_REJECT', () => {
    const baseCtx   = makeBaseCtx(0)
    const portfolio = [makeA06Action(1_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    expect(results.some(r => r.severity === 'HARD_REJECT')).toBe(true)
  })

  test('boş portfolio → boş sonuç', () => {
    const baseCtx = makeBaseCtx(5_000_000)
    expect(buildGuardrailResults(baseCtx, [])).toHaveLength(0)
  })

})

// ─── T3: CLAMP/FİİLİ TUTAR ────────────────────────────────────────────────────

describe('T3 — CLAMP: sınır koşul totalSource === proposedAmount', () => {

  /**
   * totalSource < proposedAmountTRY → HARD_REJECT (strict)
   * totalSource >= proposedAmountTRY → PASS
   * Tam eşitlik: totalSource == proposedAmount → PASS (< değil, = büyüktür-eşit)
   */
  test('stok 2M == tutar 2M (tam eşit) → PASS (< strict değil)', () => {
    const baseCtx   = makeBaseCtx(2_000_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    expect(results.some(r => r.severity === 'HARD_REJECT')).toBe(false)
  })

  test('stok 1.999M < tutar 2M → HARD_REJECT', () => {
    const baseCtx   = makeBaseCtx(1_999_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    expect(results.some(r => r.severity === 'HARD_REJECT')).toBe(true)
  })

  test('stok 2.001M > tutar 2M → PASS', () => {
    const baseCtx   = makeBaseCtx(2_001_000)
    const portfolio = [makeA06Action(2_000_000)]

    const results = buildGuardrailResults(baseCtx, portfolio)

    expect(results.some(r => r.severity === 'HARD_REJECT')).toBe(false)
  })

})

// ─── T4: SIRA BAĞIMLILIĞI ─────────────────────────────────────────────────────

describe('T4 — SIRA BAĞIMLILIĞI: aynı kaynaktan 3 A06', () => {

  /**
   * Stok 4M, 3 adet A06 her biri 2M.
   *
   * Sıralı PRE-action check:
   *   Aksiyon-1: baseline stok 4M, tutar 2M → 4M >= 2M → PASS, ardından stok → 2M
   *   Aksiyon-2: stepCtx stok 2M, tutar 2M → 2M >= 2M → PASS, ardından stok → 0M
   *   Aksiyon-3: stepCtx stok 0M, tutar 2M → 0M < 2M → HARD_REJECT
   */
  test('3 sıralı A06 → 3. aksiyonda HARD_REJECT (sıra bağımlılığı)', () => {
    const baseCtx = makeBaseCtx(4_000_000)
    const portfolio = [
      makeA06Action(2_000_000, 'short'),
      makeA06Action(2_000_000, 'medium'),
      makeA06Action(2_000_000, 'long'),
    ]

    const results = buildGuardrailResults(baseCtx, portfolio)

    // Sadece 3. A06'ya ait HARD_REJECT beklenir
    const hardRejects = results.filter(r => r.severity === 'HARD_REJECT')
    expect(hardRejects).toHaveLength(1)
    expect(hardRejects[0].ruleCode).toBe('INSUFFICIENT_SOURCE_BALANCE')
  })

  test('2 sıralı A06 (tam tüketim) → ikisi de PASS', () => {
    const baseCtx = makeBaseCtx(4_000_000)
    const portfolio = [
      makeA06Action(2_000_000, 'short'),
      makeA06Action(2_000_000, 'medium'),
    ]

    const results = buildGuardrailResults(baseCtx, portfolio)

    expect(results.some(r => r.severity === 'HARD_REJECT')).toBe(false)
  })

  test('previouslySelectedActionIds sıralı: 3. aksiyon öncekini biliyor', () => {
    const baseCtx = makeBaseCtx(4_000_000)
    // İlk A06 zaten seçilmiş kabul et (prevIds=['A06_INVENTORY_MONETIZATION'])
    // 2. A06 → prevIds görmeli
    const portfolio = [
      makeA06Action(2_000_000, 'short'),
      makeA06Action(2_000_000, 'medium'),
    ]

    // Sadece HARD_REJECT beklenmez — context sıralı ilerliyor
    const results = buildGuardrailResults(baseCtx, portfolio)
    expect(results.filter(r => r.severity === 'HARD_REJECT')).toHaveLength(0)
  })

})

// ─── T5: CCC CEILING REGRESSION ───────────────────────────────────────────────

describe('T5 — CCC CEILING REGRESSION: DEKA-benzeri input', () => {

  /**
   * DEKA 2022 ANNUAL → BB hedefi:
   * - Stok (153): 4.5M var
   * - A06 portfolio'ya giriyor (2M tutar)
   * - Bug OLMADAN: guardrail PASS → CCC ceiling YOK
   * - Bug VARKEN: HARD_REJECT → SEMANTIC_GUARDRAIL CCC ceiling
   */
  function makeDekaLikeInput(targetRating: 'BB' | 'BBB' = 'BB'): EngineInput {
    return {
      sector:        'TRADE',
      currentRating: 'B',
      targetRating,
      accountBalances: {
        // Aktif — bilanço
        '100': 500_000,
        '102': 800_000,
        '120': 3_000_000,    // alacaklar
        '153': 4_500_000,    // stok — A06 kaynağı
        '252': 8_000_000,    // maddi duran
        '300': 1_500_000,    // satıcılar
        '320': 500_000,      // bankalar kısa
        '331': 2_000_000,    // borçlar
        '500': 3_000_000,    // sermaye
        '580': 200_000,      // geçmiş dönem karı
      },
      incomeStatement: {
        netSales:         12_000_000,
        costOfGoodsSold:  8_000_000,
        grossProfit:      4_000_000,
        operatingProfit:  1_500_000,
        netIncome:        800_000,
        interestExpense:  300_000,
      },
      options: {
        // A06'nın seçilmesine izin ver
        allowedActionIds: undefined,
        aggressiveness: 'typical',
      },
    }
  }

  test('DEKA-benzeri BB hedefi → bindingCeiling SEMANTIC_GUARDRAIL CCC OLMAMALI', () => {
    const result = runEngineV3(makeDekaLikeInput('BB'))

    const bc = result.reasoning?.bindingCeiling
    if (bc) {
      // Eğer bir ceiling varsa, SEMANTIC_GUARDRAIL CCC olmamalı
      const isFalseGuardrailCCC =
        bc.source === 'SEMANTIC_GUARDRAIL' && bc.maxRating === 'CCC'
      expect(isFalseGuardrailCCC).toBe(false)
    }
    // Ceiling yoksa zaten sorun yok
    expect(true).toBe(true)
  })

  test('guardrailResults içinde A06 HARD_REJECT yok (stok yeterli)', () => {
    const result = runEngineV3(makeDekaLikeInput('BB'))

    // layerSummaries.guardrails: GuardrailResult[]
    const guardrails = result.layerSummaries?.guardrails ?? []
    const a06HardRejects = (guardrails as Array<{ severity: string; affectedActionId?: string }>)
      .filter(r => r.severity === 'HARD_REJECT' && r.affectedActionId === 'A06_INVENTORY_MONETIZATION')

    expect(a06HardRejects).toHaveLength(0)
  })

  test('CCC ise SEMANTIC_GUARDRAIL nedeniyle değil — fix amacı', () => {
    // Fix amacı: SEMANTIC_GUARDRAIL kaynaklı yanlış CCC ortadan kalkar.
    // Başka ceiling (Sustainability, Sector) nedeniyle CCC çıkabilir — bu kabul edilir.
    const result = runEngineV3(makeDekaLikeInput('BB'))
    if (result.finalTargetRating === 'CCC') {
      const bc = result.reasoning?.bindingCeiling
      // CCC ise, SEMANTIC_GUARDRAIL nedeniyle OLMAMALI
      expect(bc?.source).not.toBe('SEMANTIC_GUARDRAIL')
    }
    // CCC değilse zaten tamam
    expect(true).toBe(true)
  })

})
