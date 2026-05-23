/**
 * R7A — Semantic Guardrail allowComputedSource Entegrasyon Testleri
 *
 * Kök neden (ORGANIKA A14):
 *   - A14 computeAmount KOBİ fallback ile 1.71M üretiyor
 *   - AMA semanticGuardrails sourceAccountRequirements: ['780'] HARD
 *   - ORGANIKA 780=0 → score=0 → rejectedLog'a yazılmadan sessiz düşüş
 *   - Canlıda A14 görünmüyor
 *
 * R7A Düzeltmesi:
 *   - ActionDependencySpec.allowComputedSource: true (A14, A21, A20)
 *   - checkEconomicImpossibility: flag varsa passResult
 *   - Sessiz hard reject → rejectedLog'a yazılır
 *
 * R7A Tarama:
 *   - Uyumsuz (düzeltildi): A14, A21, A20
 *   - KOBİ fallback yok (raporlandı): A12
 *   - Disable: A13 (dokunulmadı)
 */

import { runEngineV3 } from '../engineV3'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

// Catalog erişimi — named export yoktur, ACTION_CATALOG_V3 kullanılır
const A14 = ACTION_CATALOG_V3['A14_FINANCE_COST_REDUCTION']
const A21 = ACTION_CATALOG_V3['A21_OPERATING_PROFIT_REFORM']
const A20 = ACTION_CATALOG_V3['A20_GROSS_MARGIN_REFORM']

// ─── Codex K7 — toBeDefined / ?.() tuzağı önleme ─────────────────────────────

describe('R7A — Catalog erişim (toBeDefined)', () => {

  test('A14_FINANCE_COST_REDUCTION catalog\'da tanımlı', () => {
    expect(A14).toBeDefined()
    expect(A14.computeAmount).toBeDefined()
    expect(A14.buildTransactions).toBeDefined()
  })

  test('A21_OPERATING_PROFIT_REFORM catalog\'da tanımlı', () => {
    expect(A21).toBeDefined()
    expect(A21.computeAmount).toBeDefined()
  })

  test('A20_GROSS_MARGIN_REFORM catalog\'da tanımlı', () => {
    expect(A20).toBeDefined()
    expect(A20.computeAmount).toBeDefined()
  })

})

// ─── ORGANIKA A14 — R7A KÖK NEDEN TEST ───────────────────────────────────────

describe('R7A — ORGANIKA A14: allowComputedSource ile portfolyo\'ya girer', () => {

  /**
   * R7A öncesi: A14 sessiz HARD_REJECT (780=0 → score=0 → dropped)
   * R7A sonrası: A14 allowComputedSource → PASS → portfolyo'ya girer
   *
   * ORGANIKA hesaplama:
   *   780=0, 300=22.8M → KOBİ finExp = 22.8M × 0.25 = 5.7M
   *   MANUFACTURING benchmark = 4%
   *   currentRatio = 5.7M / 17.7M = 32.2% >> 4%
   *   gap = 28.2%; reduction = 0.282 × 17.7M × 0.5 = 2.496M
   *   cap = 5.7M × 0.30 = 1.71M → min → result = 1.71M
   */
  test('ORGANIKA: 780 yok, 300=22.8M → A14 portfolyo\'ya girer (~1.71M)', () => {
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '300': 22_800_000,   // KV Mali Borç (büyük)
        '120': 10_000_000,   // alacaklar
        // '780' YOK — KOBİ fallback tetikler
      },
      incomeStatement: {
        netSales:        17_700_000,
        costOfGoodsSold: 13_830_000,
        grossProfit:      3_870_000,
        operatingProfit:    191_000,
        netIncome:          100_000,
        interestExpense:  2_000_000,
      },
      options: { allowedActionIds: ['A14_FINANCE_COST_REDUCTION'] },
    })

    // R7A öncesi: undefined (sessiz hard reject)
    // R7A sonrası: tanımlı (allowComputedSource bypass)
    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeDefined()
    expect(a14!.amountTRY).toBeGreaterThan(1_500_000)
    expect(a14!.amountTRY).toBeLessThan(2_000_000)  // ~1.71M
  })

  test('ORGANIKA (netSales=38M): A14 portfolyo\'ya girer (~1.71M)', () => {
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '300': 22_800_000,
      },
      incomeStatement: {
        netSales:        38_000_000,
        costOfGoodsSold: 28_000_000,
        grossProfit:     10_000_000,
        operatingProfit:  5_000_000,
        netIncome:        2_000_000,
        interestExpense:  2_000_000,
      },
      options: { allowedActionIds: ['A14_FINANCE_COST_REDUCTION'] },
    })

    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeDefined()
    expect(a14!.amountTRY).toBeGreaterThan(1_500_000)
    expect(a14!.amountTRY).toBeLessThan(2_000_000)
  })

})

// ─── DEKAM A14 — sektör altı (mevcut davranış korunur) ───────────────────────

describe('R7A — DEKAM A14: 780 var, oran sektör altı → null korunur', () => {

  /**
   * DEKAM: 780=5.37M, netSales=328M → ratio=1.64%
   * CONSTRUCTION benchmark = 5% → zaten altında → computeAmount null
   * allowComputedSource bu davranışı değiştirmez (computeAmount=null → candidates=[])
   */
  test('DEKAM: 780=5.37M, %1.64 < %5 benchmark → A14 portfolyo dışı', () => {
    const result = runEngineV3({
      sector:        'CONSTRUCTION',
      currentRating: 'BB',
      targetRating:  'BBB',
      accountBalances: {
        '780': 5_375_060,    // mevcut — ama oran sektör altı
        '300': 30_000_000,
        '120': 50_000_000,
        '252': 20_000_000,
        '340': 15_000_000,
        '400': 40_000_000,
        '500': 10_000_000,
      },
      incomeStatement: {
        netSales:         328_000_000,
        costOfGoodsSold:  350_500_000,
        grossProfit:      -22_500_000,
        operatingProfit:  -30_000_000,
        netIncome:        -40_000_000,
        interestExpense:    5_375_060,
      },
      options: { allowedActionIds: ['A14_FINANCE_COST_REDUCTION'] },
    })

    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeUndefined()  // computeAmount null → kandidat yok

    // Şeffaflık: rejectedCandidates'ta olmalı (R7A sessiz düşüş loglama)
    const a14Rejected = result.debug?.rejectedCandidates?.filter(r =>
      r.actionId === 'A14_FINANCE_COST_REDUCTION'
    )
    expect(a14Rejected).toBeDefined()
    expect(a14Rejected!.length).toBeGreaterThan(0)  // en az 1 log (sektör altı)
  })

})

// ─── A21 ORGANIKA — fallback ile değerlendirilmeli ────────────────────────────

describe('R7A — A21: 632/633/634 yok, fallback değerlendirilmeli', () => {

  test('ORGANIKA A21: 632/633/634 yok, allowComputedSource → sessiz düşmez', () => {
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '300': 22_800_000,
        // 630/631/632/633/634 YOK
      },
      incomeStatement: {
        netSales:        38_000_000,
        costOfGoodsSold: 28_000_000,
        grossProfit:     10_000_000,
        operatingProfit:  5_000_000,   // opex fallback = 10M - 5M = 5M
        netIncome:        2_000_000,
        interestExpense:  2_000_000,
      },
      options: { allowedActionIds: ['A21_OPERATING_PROFIT_REFORM'] },
    })

    // A21 ya portfolyo'da ya rejectedCandidates'ta olmalı
    // SESSİZCE düşmemeli (R7A şeffaflık hedefi)
    const a21InPortfolio = result.portfolio.find(a =>
      a.actionId === 'A21_OPERATING_PROFIT_REFORM'
    )
    const a21Rejected = result.debug?.rejectedCandidates?.find(r =>
      r.actionId === 'A21_OPERATING_PROFIT_REFORM'
    )

    // En az birinde görünmeli (sessiz düşüş yok)
    expect(a21InPortfolio !== undefined || a21Rejected !== undefined).toBe(true)
  })

})

// ─── Sessiz Hard Reject Loglama (R7A şeffaflık) ───────────────────────────────

describe('R7A — Sessiz Hard Reject Loglama', () => {

  test('Engine debug.rejectedCandidates tanımlı ve doldurulmuş', () => {
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '300': 5_000_000,
      },
      incomeStatement: {
        netSales:        10_000_000,
        costOfGoodsSold:  7_000_000,
        grossProfit:      3_000_000,
        operatingProfit:  1_000_000,
        netIncome:          500_000,
        interestExpense:    300_000,
      },
    })

    expect(result.debug).toBeDefined()
    expect(result.debug!.rejectedCandidates).toBeDefined()
    // Minimum birkaç aksiyon reddedilmiş olmalı (küçük firma)
    expect(result.debug!.rejectedCandidates.length).toBeGreaterThan(0)
  })

  test('Guardrail hard reject → rejectedCandidates\'ta reason içerir', () => {
    // A11_RETAIN_EARNINGS: requiresPositiveEarnings → netIncome < 0 → HARD_REJECT
    // Bu sayede guardrail log path test edilir
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '590': 2_000_000,   // Dönem Net Karı var ama netIncome negatif
        '300': 5_000_000,
      },
      incomeStatement: {
        netSales:        20_000_000,
        costOfGoodsSold: 18_000_000,
        grossProfit:      2_000_000,
        operatingProfit:    500_000,
        netIncome:       -1_000_000,  // ZARAR — A11 requiresPositiveEarnings
        interestExpense:  1_500_000,
      },
      options: { allowedActionIds: ['A11_RETAIN_EARNINGS'] },
    })

    // A11 portfolyo'da OLMAMALI (negatif kazanç)
    const a11 = result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')
    expect(a11).toBeUndefined()

    // AMA rejectedCandidates'ta OLMALI (R7A loglama — sessiz düşmez)
    const a11Rejected = result.debug?.rejectedCandidates?.find(r =>
      r.actionId === 'A11_RETAIN_EARNINGS'
    )
    expect(a11Rejected).toBeDefined()
    expect(a11Rejected!.reason).toBeTruthy()
  })

})
