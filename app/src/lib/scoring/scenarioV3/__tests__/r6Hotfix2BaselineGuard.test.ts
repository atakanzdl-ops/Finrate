/**
 * R6 Hotfix 2 — Baseline Guard Entegrasyon Testleri
 *
 * Kök neden: runEngineV3 greedy loop içinde A20_GROSS_MARGIN_REFORM önce seçilir,
 * currentContext'i günceller: grossProfit artar, nakit (102) artar.
 * Sonraki A04 / A19 bu şişirilmiş değerleri görür → yanlış öneri.
 *
 * Düzeltme (R6 Hotfix 2):
 *   - A04 computeAmount → baselineAccountBalances kullanır (102/300 frozen)
 *   - A19 buildTransactions → baselineGrossProfit guard (brüt zarar gerçek mi?)
 *   - runLocalRepair → empty-tx guard
 *
 * ENES profili: 102=222 TL, 300=12M → A04 null (nakit yetersiz)
 * ORGANIKA profili: 102=960K, 300=22.8M → A04 null (%4.2 < %15)
 * DEKAM profili: grossProfit=-22.5M → A19 portfolio'ya girmemeli
 *
 * Codex K6/K7 audit düzeltmeleri:
 *   - A20_STOCK_TO_SALES → A20_GROSS_MARGIN_REFORM (gerçek ID)
 *   - toBeDefined assertions (?.tuzağı önleme)
 *   - A20+A04 ve A20+A19 doğru aksiyon ID ile bug zinciri testleri
 */

import { runEngineV3 } from '../engineV3'
import type { EngineInput } from '../engineV3'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'

// Catalog erişimi — toBeDefined / .! assertion için
const a04Catalog = ACTION_CATALOG_V3['A04_CASH_PAYDOWN_ST']
const a19Catalog = ACTION_CATALOG_V3['A19_ADVANCE_TO_REVENUE']

// ─── ENES profili: 102=222 TL (neredeyse sıfır nakit) ────────────────────────

const ENES_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  targetRating:  'BBB',
  accountBalances: {
    '102': 222,              // 222 TL — neredeyse sıfır nakit
    '120': 5_000_000,        // alacaklar
    '153': 8_000_000,        // stok
    '252': 15_000_000,       // binalar
    '300': 12_000_000,       // KV borç
    '500': 5_000_000,        // sermaye
  },
  incomeStatement: {
    netSales:        25_000_000,
    costOfGoodsSold: 18_000_000,
    grossProfit:      7_000_000,
    operatingProfit:  3_000_000,
    netIncome:        1_000_000,
    interestExpense:    800_000,
  },
}

// ─── ORGANIKA profili: 102=960K, 300=22.8M → %4.2 < %15 ─────────────────────

const ORGANIKA_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  targetRating:  'BBB',
  accountBalances: {
    '102': 960_000,          // 960K TL nakit
    '120': 10_000_000,       // alacaklar
    '153': 15_000_000,       // stok
    '300': 22_800_000,       // KV borç (22.8M)
    '400': 30_000_000,       // UV borç
    '500': 10_000_000,       // sermaye
  },
  incomeStatement: {
    netSales:        38_000_000,
    costOfGoodsSold: 28_000_000,
    grossProfit:     10_000_000,
    operatingProfit:  5_000_000,
    netIncome:        2_000_000,
    interestExpense:  2_000_000,
  },
}

// ─── DEKAM profili: brüt zarar, avans=15M ────────────────────────────────────

const DEKAM_INPUT: EngineInput = {
  sector:        'CONSTRUCTION',
  currentRating: 'BB',
  targetRating:  'BBB',
  accountBalances: {
    '102': 5_000_000,        // nakit
    '120': 50_000_000,       // alacaklar
    '159': 15_000_000,       // verilen avanslar
    '252': 20_000_000,       // binalar
    '300': 30_000_000,       // KV borç
    '320': 15_000_000,       // satıcılar
    '340': 15_000_000,       // alınan sipariş avansları → A19 için kaynak
    '400': 40_000_000,       // UV borç
    '500': 10_000_000,       // sermaye
  },
  incomeStatement: {
    netSales:         328_000_000,
    costOfGoodsSold:  350_500_000,
    grossProfit:      -22_500_000,  // BRÜT ZARAR — A19 kesinlikle çalışmamalı
    operatingProfit:  -30_000_000,
    netIncome:        -40_000_000,
    interestExpense:   10_000_000,
  },
}

// ─── Codex K7 — toBeDefined / ?.() tuzağı önleme ─────────────────────────────

describe('Codex K7 — A04/A19 catalog erişim guard', () => {

  test('A04_CASH_PAYDOWN_ST.computeAmount tanımlı (?. tuzağı önleme)', () => {
    expect(a04Catalog).toBeDefined()
    expect(a04Catalog.computeAmount).toBeDefined()
  })

  test('A19_ADVANCE_TO_REVENUE.buildTransactions tanımlı', () => {
    expect(a19Catalog).toBeDefined()
    expect(a19Catalog.buildTransactions).toBeDefined()
  })

})

// ─── A04 Baseline Guard ───────────────────────────────────────────────────────

describe('R6 Hotfix 2 — A04 Baseline Guard', () => {

  // T1: ENES — 222 TL nakit → A04 kesinlikle null
  test('T1 — ENES: 102=222 TL → A04 portfolio dışı (nakit yetersiz)', () => {
    const result = runEngineV3(ENES_INPUT)
    const allActionIds = result.portfolio.map(a => a.actionId)
    expect(allActionIds).not.toContain('A04_CASH_PAYDOWN_ST')
  })

  // T2: ORGANIKA — 960K/22.8M = %4.2 < %15 → A04 null
  test('T2 — ORGANIKA: 102=960K, 300=22.8M → %4.2 < %15 → A04 portfolio dışı', () => {
    const result = runEngineV3(ORGANIKA_INPUT)
    const allActionIds = result.portfolio.map(a => a.actionId)
    expect(allActionIds).not.toContain('A04_CASH_PAYDOWN_ST')
  })

  // T3: ORGANIKA forced — allowedActionIds=['A04_CASH_PAYDOWN_ST'] → hâlâ dışarıda
  test('T3 — ORGANIKA forced A04: baseline guard → seçilmedi', () => {
    const result = runEngineV3({
      ...ORGANIKA_INPUT,
      options: { allowedActionIds: ['A04_CASH_PAYDOWN_ST'] },
    })
    const a04 = result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')
    expect(a04).toBeUndefined()
  })

  // T4: Yeterli nakit + KV borç → A04 seçilebilir (false positive kontrolü)
  test('T4 — Yeterli nakit+borç: 102=6M, 300=20M → A04 seçilebilir', () => {
    const result = runEngineV3({
      ...ENES_INPUT,
      accountBalances: {
        ...ENES_INPUT.accountBalances,
        '102': 6_000_000,    // yeterli nakit
        '300': 20_000_000,   // KV borç
      },
      options: { allowedActionIds: ['A04_CASH_PAYDOWN_ST'] },
    })
    const a04 = result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')
    expect(a04).toBeDefined()
  })

})

// ─── A19 Baseline Brüt Zarar Guard ───────────────────────────────────────────

describe('R6 Hotfix 2 — A19 Baseline Brüt Zarar Guard', () => {

  // T5: DEKAM — grossProfit=-22.5M → A19 kesinlikle portfolio dışı
  test('T5 — DEKAM: brüt zarar -22.5M → A19 portfolio dışı', () => {
    const result = runEngineV3(DEKAM_INPUT)
    const allActionIds = result.portfolio.map(a => a.actionId)
    expect(allActionIds).not.toContain('A19_ADVANCE_TO_REVENUE')
  })

  // T6: DEKAM forced A19 — brüt zarar guard → hâlâ dışarıda
  test('T6 — DEKAM forced A19: baseline brüt zarar → seçilmedi', () => {
    const result = runEngineV3({
      ...DEKAM_INPUT,
      options: { allowedActionIds: ['A19_ADVANCE_TO_REVENUE'] },
    })
    const a19 = result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')
    expect(a19).toBeUndefined()
  })

  // T7: DEKAM + A20_GROSS_MARGIN_REFORM önce → A19 hâlâ dışarıda
  // A20 102 DEBIT yaparak nakit üretir ve 621 CREDIT ile grossProfit'i artırır.
  // Baseline guard: baselineGrossProfit=-22.5M → A19 seçilmez.
  test('T7 — DEKAM A20_GROSS_MARGIN_REFORM→A19 chain: A20 grossProfit şişirse bile A19 null', () => {
    const result = runEngineV3({
      ...DEKAM_INPUT,
      options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM', 'A19_ADVANCE_TO_REVENUE'] },
    })
    const a19 = result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')
    expect(a19).toBeUndefined()
  })

  // T8: Pozitif grossProfit + avans → A19 seçilebilir (false positive yok)
  test('T8 — Pozitif grossProfit + avans: A19 seçilebilir', () => {
    const result = runEngineV3({
      ...DEKAM_INPUT,
      incomeStatement: {
        ...DEKAM_INPUT.incomeStatement,
        costOfGoodsSold: 200_000_000,
        grossProfit:      128_000_000,   // pozitif
        operatingProfit:   80_000_000,
        netIncome:         50_000_000,
      },
      options: { allowedActionIds: ['A19_ADVANCE_TO_REVENUE'] },
    })
    const a19 = result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')
    expect(a19).toBeDefined()
  })

})

// ─── Codex K6 — Gerçek A20+A04 Bug Zinciri ───────────────────────────────────

describe('Codex K6 — A20_GROSS_MARGIN_REFORM + A04 Bug Zinciri', () => {

  /**
   * R6 Öncesi Bug:
   *   Greedy loop: A20_GROSS_MARGIN_REFORM seçilir → 102 DEBIT (nakit şişer)
   *   → currentContext.accountBalances['102'] artar
   *   → A04 şişirilmiş nakiti görür → yanlış %15 eşiği geçer → sahte öneri
   *
   * R6 Hotfix 2:
   *   A04 baselineAccountBalances['102'] = 222 TL (frozen) → null
   */
  test('T9 — ENES A20→A04 bug zinciri: A20 nakit üretse bile A04 baseline NULL', () => {
    // A20_GROSS_MARGIN_REFORM: COGS↓ (621 CREDIT) + 102 DEBIT → nakit artar
    // A20 seçilse dahi A04 baseline['102']=222 TL görür → nakitCap=177 < 500K → null
    const result = runEngineV3({
      ...ENES_INPUT,
      options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM', 'A04_CASH_PAYDOWN_ST'] },
    })

    const a04 = result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')
    expect(a04).toBeUndefined()  // baseline guard: 222 TL → null
  })

  test('T10 — ORGANIKA A20→A04 bug zinciri: A20 nakit üretse bile A04 baseline NULL', () => {
    // A20 seçilse dahi A04 baseline['102']=960K → nakitCap=768K / kvBorç=22.8M
    // 768K/22.8M = 3.4% < 15% → null
    const result = runEngineV3({
      ...ORGANIKA_INPUT,
      options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM', 'A04_CASH_PAYDOWN_ST'] },
    })

    const a04 = result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')
    expect(a04).toBeUndefined()  // baseline guard: 960K → %3.4 < %15 → null
  })

  test('T11 — Yeterli baseline nakit: A20+A04 zincirinde A04 seçilebilir', () => {
    // False positive kontrolü: baseline nakit yeterliyse A04 seçilmeli
    const result = runEngineV3({
      ...ORGANIKA_INPUT,
      accountBalances: {
        ...ORGANIKA_INPUT.accountBalances,
        '102': 5_000_000,   // yeterli baseline nakit
        '300': 10_000_000,  // KV borç
      },
      options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM', 'A04_CASH_PAYDOWN_ST'] },
    })

    // baseline['102']=5M, nakitCap=4M, borçHedef=3M → oneri=3M, 3M/10M=30%>15% ✓
    const a04 = result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')
    expect(a04).toBeDefined()
  })

})
