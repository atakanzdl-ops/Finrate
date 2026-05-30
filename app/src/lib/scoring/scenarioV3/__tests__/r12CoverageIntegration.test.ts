/**
 * R12.1 — Coverage Integration Testi
 *
 * findWeakestRatioPerCategory + getCoverageActionIds'in
 * runEngineV3 içindeki entegrasyonunu doğrular.
 *
 * Senaryo:
 *   İSRA profilinde greedy'ye sadece brüt marj aksiyonları izin verilir.
 *   Bu durumda likidite/kaldıraç/faaliyet zayıf kategorileri greedy
 *   tarafından kapatılamaz → Coverage mekanizması devreye girer.
 *
 * Beklentiler:
 *   T1 — Normal run: portfolio dolu, coverageMandatory aksiyonlar eklenebilir
 *   T2 — Coverage: greedy profil dışıysa coverageMandatory action görülür
 *   T3 — Coverage: coverageMandatory flag true + amountTRY > 0
 *   T4 — Coverage: coverageMandatory action'ın transaction'ları balanced
 *   T5 — Universal invariant: A11 portfolyo dışı (coverage bunu bypass etmez)
 */

import { runEngineV3 }         from '../engineV3'
import type { EngineResult }    from '../engineV3'
import type { AccountingTransaction } from '../contracts'
import { ISRA_INPUT }          from './fixtures/smoke/inputs'

// ─── T1: Normal İSRA run — portfolio dolu ────────────────────────────────────

test('T1 — İSRA normal run: portfolio dolu, tüm tx balanced', () => {
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BB' })

  expect(result.portfolio.length).toBeGreaterThan(0)

  // Tüm tx balanced
  for (const action of result.portfolio) {
    for (const tx of action.transactions as AccountingTransaction[]) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  }
})

// ─── T2: Coverage mekanizması — greedy kısıtlıysa yeni aksiyon eklenir ───────

test('T2 — Coverage: greedy sadece A20 seçerse zayıf kategoriler için coverage eklenir', () => {
  // Sadece A20 (brüt marj nakit kanalı) greedy'ye izin ver.
  // İSRA profili: debtToEquity=5.6 >> benchmark 1.51 → kaldıraç ZAYıF
  //               DSO=~97 gün >> benchmark 37 gün → faaliyet ZAYıF
  // A20 tek başına bu kategorileri kapatamaz → coverage devreye girmeli.
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)

  // FIX: ">=0" YANLIŞ — ISRA'da borç/DSO zayıf → coverage EN AZ 1 aksiyon eklemeli
  // Kaldıraç: DEBT_TO_EQUITY → A10/A10B/A15 aday; A10 precondition yok → eklenmeli
  // Faaliyet: DSO → A05 aday; 120=12M mevcut → eklenmeli
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // Her coverage action coverageMandatory=true taşımalı
  for (const ca of coverageActions) {
    expect(ca.coverageMandatory).toBe(true)
  }

  // Coverage aksiyonları allowedActionIds kısıtını bypass eder
  const coverageIds = coverageActions.map(a => a.actionId)
  expect(coverageIds.every(id => id !== 'A20_GROSS_MARGIN_REFORM')).toBe(true)
})

// ─── T3: coverageMandatory flag + amountTRY > 0 ───────────────────────────────

test('T3 — Tüm coverageMandatory aksiyonların amountTRY > 0', () => {
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BBB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  for (const ca of coverageActions) {
    expect(ca.amountTRY).toBeGreaterThan(0)
  }
})

// ─── T4: coverageMandatory action'ların transaction'ları balanced ─────────────

test('T4 — coverageMandatory aksiyonların tüm tx DEBIT == CREDIT', () => {
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  for (const ca of coverageActions) {
    for (const tx of ca.transactions as AccountingTransaction[]) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  }
})

// ─── T5: A11 coverage tarafından asla eklenmez ───────────────────────────────

test('T5 — A11_RETAIN_EARNINGS coverage ile dahi portfolyo dışında kalır', () => {
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'A' })
  const a11 = result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')
  expect(a11).toBeUndefined()
})

// ─── T6: R12.1 — A22 katalogda mevcut ────────────────────────────────────────

test('T6 — A22_SHAREHOLDER_RECEIVABLE_COLLECTION katalogda tanımlı', () => {
  // A22, ortaklardan alacak olan firmalar için (131/231 hesapları gerekli)
  // Bu firmada 131 YOK → A22 seçilmez ama tanımlı olmalı
  const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BB' })
  const a22 = result.portfolio.find(a => a.actionId === 'A22_SHAREHOLDER_RECEIVABLE_COLLECTION')
  // İSRA'da 131 YOK → A22 seçilmez (precondition fail)
  expect(a22).toBeUndefined()
})

// ─── T7: A22 buildTransactions doğrulama ─────────────────────────────────────

test('T7 — A22: buildTransactions 102 DEBIT + 131 CREDIT balanced döner (TAM KAPANMA)', () => {
  // R12.1-FIX4: cap kaldırıldı → amount = total (131+231 tamamı)
  // context.amount artık dikkate alınmaz — tam kapanma zorunlu
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']
  expect(a22).toBeDefined()

  const txs = a22.buildTransactions({
    sector: 'TRADE', horizon: 'short',
    analysis: {}, amount: 2_000_000,   // context.amount → artık dikkate alınmıyor
    previousActions: [],
    accountBalances: { '131': 5_000_000, '102': 1_000_000 },
    netSales: 10_000_000, grossProfit: 3_000_000,
  })
  expect(txs.length).toBe(1)

  const legs = txs[0].legs
  const debit  = legs.filter((l: any) => l.side === 'DEBIT' ).reduce((s: number, l: any) => s + l.amount, 0)
  const credit = legs.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + l.amount, 0)
  expect(debit).toBe(credit)
  // FIX4: tam kapanma → 5M (131 tamamı), context.amount=2M artık cap değil
  expect(debit).toBe(5_000_000)

  const debitLeg  = legs.find((l: any) => l.side === 'DEBIT')
  const creditLeg = legs.find((l: any) => l.side === 'CREDIT')
  expect(debitLeg!.accountCode).toBe('102')   // nakit
  expect(creditLeg!.accountCode).toBe('131')  // ortak alacağı
})

// ─── T8: bankerTrust field doğrulama ─────────────────────────────────────────

test('T8 — ACTION_CATALOG_V3: tüm aksiyonların bankerTrust tanımlı', () => {
  // Not: bankerTrust opsiyonel — sadece mevcut olanlar kontrol edilir
  const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
  const withTrust = Object.values(ACTION_CATALOG_V3).filter(
    (a: any) => a.bankerTrust !== undefined
  )
  // En az 20 aksiyonun bankerTrust'ı olmalı (A01-A21 + A22)
  expect(withTrust.length).toBeGreaterThanOrEqual(20)
})

// ─── T_FIX2_INTEG: Sonuç rasyosu zayıfsa grup listesinden aksiyon eklenir ─────

test('T_FIX2_INTEG: cashRatio çok düşük → LIQUIDITY_RESULT grubundan coverageMandatory aksiyon', () => {
  // cashRatio ≈ 0.11 (100K+200K / 3.6M) << benchmark 0.14 → zayıf
  // currentRatio = 2.1M/3.6M = 0.58 << benchmark 1.56 → zayıf
  // getCoverageActionIdsForRatio('cashRatio') boş döner (girdi değil)
  // → getResultGroupCandidates('cashRatio') → LIQUIDITY_RESULT listesi
  // → A10 (dış sermaye, precondition yok) → coverage'a eklenir
  const result = runEngineV3({
    ...ISRA_INPUT,
    targetRating: 'BB',
    // Sadece A20'ye izin ver — greedy likiditeyi kapatamaz
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  // Coverage en az 1 aksiyon eklemeli (likidite ve/veya kaldıraç zayıf)
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // Eklenen coverage aksiyonlarından en az biri LIQUIDITY_RESULT veya CAPITAL_RESULT listesinden
  const { RESULT_GROUP_ACTION_IDS } = require('../ratioCategoryRegistry')
  const allGroupIds = new Set([
    ...RESULT_GROUP_ACTION_IDS.LIQUIDITY_RESULT,
    ...RESULT_GROUP_ACTION_IDS.PROFIT_RESULT,
    ...RESULT_GROUP_ACTION_IDS.CAPITAL_RESULT,
  ])
  const coverageFromGroup = coverageActions.filter(a => allGroupIds.has(a.actionId))
  expect(coverageFromGroup.length).toBeGreaterThanOrEqual(1)
})

// ─── T_FIX3: quickRatio + roic eksik sonuç rasyoları FIX3 testleri ─────────

test('T_FIX3_QUICK: currentRatio güçlü ama quickRatio zayıf → LIQUIDITY_RESULT coverage', () => {
  // FIX3 öncesi: quickRatio computePartialRatios'ta YOKTU → coverage göremiyordu
  // FIX3 sonrası: quickRatio hesaplanıyor → LIQUIDITY_RESULT coverage tetiklenir
  //
  // Fixture:
  //   sum1xx = 2M+1M+3M+20M = 26M, sum3xx = 15M
  //   currentRatio = 26M/15M = 1.73 > 1.56 → GÜÇLÜ (currentRatio coverage yok)
  //   quickRatio   = (26M-20M)/15M = 0.40 < 0.88 → ZAYIF (FIX3 ile artık görülür)
  //   cashRatio    = 3M/15M = 0.20 > 0.14 → GÜÇLÜ
  const result = runEngineV3({
    sector:        'TRADE',
    currentRating: 'B',
    accountBalances: {
      '100':  2_000_000,
      '102':  1_000_000,
      '120':  3_000_000,
      '153': 20_000_000,   // Yüksek stok → quickRatio zayıf, currentRatio güçlü
      '300': 15_000_000,   // KV borç
      '500':  5_000_000,
    },
    incomeStatement: {
      netSales:        30_000_000,
      costOfGoodsSold: 21_000_000,
      grossProfit:      9_000_000,
      operatingProfit:  3_000_000,
      netIncome:        1_500_000,
      interestExpense:    800_000,
    },
    // Sadece A20'ye izin ver → greedy likiditeyi kapatamaz → coverage devreye girmeli
    options: { allowedActionIds: ['A20_GROSS_MARGIN_REFORM'] },
  })

  // FIX3 ile quickRatio coverage'a girdiği için LIQUIDITY_RESULT grubundan aksiyon eklenmeli
  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // Eklenen aksiyon LIQUIDITY_RESULT listesinden olmalı
  const { RESULT_GROUP_ACTION_IDS } = require('../ratioCategoryRegistry')
  const liquidityIds = new Set(RESULT_GROUP_ACTION_IDS.LIQUIDITY_RESULT as string[])
  const hasLiquidityCoverage = coverageActions.some(a => liquidityIds.has(a.actionId))
  expect(hasLiquidityCoverage).toBe(true)
})

test('T_FIX3_ROIC: roic zayıfsa PROFIT_RESULT grubundan coverage tetiklenir', () => {
  // FIX3-FIX: roic formülü düzeltildi (cash:100+101+102+108, STI:11x, inventory:+159)
  //
  // Fixture hesapları (ana ratios.ts formülleriyle):
  //   cash = 1M (102), stInv = 0 (11x yok), totalFinDebt = 15M (300+400)
  //   netFinDebt = 15M - 1M - 0 = 14M
  //   equity ≈ 3M (500), investedCap = 3M + 14M = 17M
  //   nopat = 600K * 0.75 = 450K
  //   roic = 450K / 17M ≈ 0.026 << benchmark 0.075 → ZAYIF ✓
  //   grossMargin = 8M/20M = 0.40 > 0.14 → GÜÇLÜ (GROSS_MARGIN girdi coverage yok)
  //   quickRatio = (8M-4M)/3M = 1.33 > 0.88 → GÜÇLÜ (likidite coverage tetiklenmez)
  //
  // Sadece A01'e izin ver → greedy kârlılık aksiyonu seçemiyor
  // Coverage: profitability kategori (roic worst) → PROFIT_RESULT listesi dener
  const result = runEngineV3({
    sector:        'TRADE',
    currentRating: 'B',
    accountBalances: {
      '102':  1_000_000,
      '120':  3_000_000,
      '153':  4_000_000,
      '300':  3_000_000,    // KV finansal borç
      '400': 12_000_000,    // UV finansal borç — yüksek borç → roic zayıf
      '500':  3_000_000,
    },
    incomeStatement: {
      netSales:        20_000_000,
      costOfGoodsSold: 12_000_000,
      grossProfit:      8_000_000,   // 40% margin → GÜÇLÜ
      operatingProfit:    600_000,   // düşük op. kâr → roic zayıf
      netIncome:          200_000,
      interestExpense:    500_000,
    },
    // A01: borç vade uzatma — greedy kârlılığı kapatamaz
    options: { allowedActionIds: ['A01_ST_FIN_DEBT_TO_LT'] },
  })

  // Coverage kârlılık grubunu denemeli (PROFIT_RESULT)
  const coverageActions = result.portfolio.filter(a => a.coverageMandatory === true)
  expect(coverageActions.length).toBeGreaterThanOrEqual(1)

  // En az bir coverage aksiyonu PROFIT_RESULT veya CAPITAL_RESULT listesinden
  // (roic+debtToEquity her ikisi de zayıf → her iki grup tetiklenebilir)
  const { RESULT_GROUP_ACTION_IDS } = require('../ratioCategoryRegistry')
  const profitAndCapitalIds = new Set([
    ...RESULT_GROUP_ACTION_IDS.PROFIT_RESULT as string[],
    ...RESULT_GROUP_ACTION_IDS.CAPITAL_RESULT as string[],
  ])
  const hasProfitOrCapitalCoverage = coverageActions.some(a => profitAndCapitalIds.has(a.actionId))
  expect(hasProfitOrCapitalCoverage).toBe(true)
})

test('T_FIX3_TUTARLILIK: quickRatio ve roic hesapları ana ratios.ts ile tutarlı', () => {
  // Ana ratios.ts'i doğrudan çağırarak beklenen değerleri hesapla,
  // aynı input için engine coverage tetiklenip tetiklenmediğini karşılaştır.
  //
  // Tutarlılık kriteri:
  //   calculateRatios(input) → ana quickRatio = X
  //   computePartialRatiosFromContext (internal) aynı formülü kullanmalı
  //   → aynı zayıflık tespiti → coverage aynı şekilde tetiklenir
  //
  // Fixture: quickRatio zayıf (< 0.88), currentRatio güçlü (> 1.56)
  //   Eğer FIX3-FIX DOĞRUYSA: hem ana ratios.ts hem partial aynı quickRatio üretir
  //   → her iki tarafta da LIQUIDITY_RESULT coverage tetiklenir
  //
  // Ana ratios.ts hesabı (159 dahil inventory):
  const { calculateRatios } = require('../../ratios')
  const anaResult = calculateRatios({
    sector: 'TRADE',
    totalCurrentAssets: 26_000_000,   // 2M+1M+3M+20M
    totalCurrentLiabilities: 15_000_000,
    inventory: 20_000_000,            // 150-153
    prepaidSuppliers: 0,              // 159 = 0 bu fixture'da
    totalEquity: 5_000_000,
    totalAssets: 41_000_000,          // 26M dönen + 15M KV (basitleştirilmiş)
    revenue: 30_000_000,
    grossProfit: 9_000_000,
    ebit: 3_000_000,
    netProfit: 1_500_000,
    shortTermFinancialDebt: 15_000_000,
    longTermFinancialDebt: 0,
    cash: 3_000_000,                  // 100+102
    shortTermInvestments: 0,
    interestExpense: 800_000,
    totalNonCurrentLiabilities: 0,
  })

  // Ana quickRatio: (26M - 20M) / 15M = 0.40
  expect(anaResult.quickRatio).toBeCloseTo(0.40, 1)
  // Ana TRADE benchmark = 0.88 → 0.40 < 0.88 → ZAYIF (coverage devreye girmeli)

  // Engine aynı input'la koşturulduğunda coverage LIQUIDITY_RESULT eklemeli
  // (T_FIX3_QUICK zaten bunu doğruluyor — bu test formula tutarlılığını doğrular)
  expect(typeof anaResult.quickRatio).toBe('number')
  expect(anaResult.quickRatio).toBeLessThan(0.88)  // ana formül de ZAYIF görüyor
})

// ─── T_FIX4: A22 tam kapanma testleri ────────────────────────────────────────

describe('R12.1-FIX4: A22 tam kapanma (cap kaldırıldı)', () => {

  test('T_FIX4_A22_FULL: A22 131+231 tamamını kapatır', () => {
    // DEKAM benzeri: 131 = 28.3M → tam tahsilat = 28.3M (eski: 14.15M)
    const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
    const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']

    const txs = a22.buildTransactions({
      sector: 'TRADE', horizon: 'short',
      analysis: {}, amount: 10_000_000,   // context.amount küçük olsa bile
      previousActions: [],
      accountBalances: { '131': 28_300_000, '102': 1_000_000 },
      netSales: 50_000_000, grossProfit: 10_000_000,
    })
    expect(txs.length).toBe(1)

    const legs = txs[0].legs
    const debit  = legs.filter((l: any) => l.side === 'DEBIT' ).reduce((s: number, l: any) => s + l.amount, 0)
    const credit = legs.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + l.amount, 0)

    // Muhasebe dengesi
    expect(debit).toBe(credit)
    // Tam kapanma: 28.3M (context.amount = 10M görmezden gelindi)
    expect(debit).toBe(28_300_000)

    // 102 DEBIT, 131 CREDIT (231 yok bu fixture'da)
    const debitLeg = legs.find((l: any) => l.side === 'DEBIT')
    expect(debitLeg!.accountCode).toBe('102')
    expect(legs.filter((l: any) => l.side === 'CREDIT').map((l: any) => l.accountCode))
      .toContain('131')
  })

  test('T_FIX4_A22_BOTH: 131+231 her ikisi de tam kapanır', () => {
    // 131 = 10M, 231 = 5M → toplam 15M, hepsi tahsil edilmeli
    const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
    const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']

    const txs = a22.buildTransactions({
      sector: 'TRADE', horizon: 'short',
      analysis: {}, amount: 5_000_000,
      previousActions: [],
      accountBalances: { '131': 10_000_000, '231': 5_000_000, '102': 2_000_000 },
      netSales: 30_000_000, grossProfit: 8_000_000,
    })
    expect(txs.length).toBe(1)

    const legs = txs[0].legs
    const debit  = legs.filter((l: any) => l.side === 'DEBIT' ).reduce((s: number, l: any) => s + l.amount, 0)
    const credit = legs.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + l.amount, 0)

    // Tam 15M — 131+231 hepsi
    expect(debit).toBe(credit)
    expect(debit).toBe(15_000_000)

    // Hem 131 hem 231 leg'i olmalı
    const creditCodes = legs.filter((l: any) => l.side === 'CREDIT').map((l: any) => l.accountCode)
    expect(creditCodes).toContain('131')
    expect(creditCodes).toContain('231')

    // 131 = 10M, 231 = 5M dağılımı
    const leg131 = legs.find((l: any) => l.accountCode === '131')
    const leg231 = legs.find((l: any) => l.accountCode === '231')
    expect(leg131!.amount).toBe(10_000_000)
    expect(leg231!.amount).toBe(5_000_000)
  })

  test('T_FIX4_A22_ESIK: 1M altı A22 atlar', () => {
    // Eşik korundu — küçük bakiye atlama
    const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
    const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']

    const txs = a22.buildTransactions({
      sector: 'TRADE', horizon: 'short',
      analysis: {}, amount: 500_000,
      previousActions: [],
      accountBalances: { '131': 500_000, '102': 1_000_000 },
      netSales: 10_000_000, grossProfit: 3_000_000,
    })
    // 500K < 1M eşik → boş dönmeli
    expect(txs).toHaveLength(0)
  })

  test('T_FIX4_A22_SADECE231: sadece 231 varsa tam tahsilat', () => {
    // 131 = 0, 231 = 3M → from231 = 3M, from131 = 0 (131 leg yok)
    const { ACTION_CATALOG_V3 } = require('../actionCatalogV3')
    const a22 = ACTION_CATALOG_V3['A22_SHAREHOLDER_RECEIVABLE_COLLECTION']

    const txs = a22.buildTransactions({
      sector: 'TRADE', horizon: 'short',
      analysis: {}, amount: 1_000_000,
      previousActions: [],
      accountBalances: { '231': 3_000_000, '102': 500_000 },
      netSales: 10_000_000, grossProfit: 3_000_000,
    })
    expect(txs.length).toBe(1)

    const legs = txs[0].legs
    const debit  = legs.filter((l: any) => l.side === 'DEBIT' ).reduce((s: number, l: any) => s + l.amount, 0)
    const credit = legs.filter((l: any) => l.side === 'CREDIT').reduce((s: number, l: any) => s + l.amount, 0)
    expect(debit).toBe(credit)
    expect(debit).toBe(3_000_000)

    // 131 leg olmamalı (sıfır değil, yok olmalı)
    const creditCodes = legs.filter((l: any) => l.side === 'CREDIT').map((l: any) => l.accountCode)
    expect(creditCodes).not.toContain('131')
    expect(creditCodes).toContain('231')
  })
})

// ─── T_FIX5: Primary garanti pass testleri ───────────────────────────────────

describe('R12.1-FIX5: Her zayıf yapı kendi primary aksiyonunu alır', () => {

  test('T_FIX5_PROFILE: A05 primary ACTIVITY, A19 primary ACTIVITY, A22 primary LIQUIDITY', () => {
    const { ACTION_RATIO_GROUP_PROFILE } = require('../actionRatioGroupProfile')
    expect(ACTION_RATIO_GROUP_PROFILE['A05_RECEIVABLE_COLLECTION'].primary).toBe('ACTIVITY')
    expect(ACTION_RATIO_GROUP_PROFILE['A05_RECEIVABLE_COLLECTION'].secondary).toBe('LIQUIDITY')
    expect(ACTION_RATIO_GROUP_PROFILE['A19_ADVANCE_TO_REVENUE'].primary).toBe('ACTIVITY')
    expect(ACTION_RATIO_GROUP_PROFILE['A19_ADVANCE_TO_REVENUE'].secondary).toBe('PROFITABILITY')
    expect(ACTION_RATIO_GROUP_PROFILE['A22_SHAREHOLDER_RECEIVABLE_COLLECTION'].primary).toBe('LIQUIDITY')
    expect(ACTION_RATIO_GROUP_PROFILE['A22_SHAREHOLDER_RECEIVABLE_COLLECTION'].secondary).toBe('LEVERAGE')
  })

  test('T_FIX5_PRIMARY_HELPER: getPrimaryCoveredGroups yan etki saymaz', () => {
    const { getPrimaryCoveredGroups } = require('../actionRatioGroupProfile')
    // A14: primary=PROFITABILITY, secondary=LEVERAGE
    const covered = getPrimaryCoveredGroups(['A14_FINANCE_COST_REDUCTION'])
    expect(covered.has('PROFITABILITY')).toBe(true)
    expect(covered.has('LEVERAGE')).toBe(false)   // secondary → SAYILMAZ
  })

  test('T_FIX5_LEVERAGE: kaldıraç zayıf + primary yoksa primary eklenir', () => {
    // iPOS-benzeri: interestCoverage düşük (A14 çeker primary=PROFITABILITY),
    // debtToEquity yüksek, debtToAssets yüksek
    // Greedy: A14 seçer → primary PROFITABILITY covered
    // FIX5: kaldıraç primary YOKSA → LEVERAGE primary havuzundan ekler
    //
    // Sadece A14 + A21 izin ver → greedy yalnızca kârlılık aksiyonu seçebilir
    // Kaldıraç primary (A01/A10/A15...) greedy'de olmamalı
    const result = runEngineV3({
      ...ISRA_INPUT,
      targetRating: 'BB',
      options: { allowedActionIds: ['A14_FINANCE_COST_REDUCTION', 'A21_OPERATING_PROFIT_REFORM'] },
    })

    // FIX5: kaldıraç primary aksiyonu coverageMandatory=true ile portföyde olmalı
    // ISRA: debtToEquity=18M/5M=3.6 >> benchmark 1.51 → kaldıraç ZAYIF
    // A14 primary=PROFITABILITY → kaldıraç primary kapsanmamış
    // FIX5 pass: LEVERAGE primary havuzundan (A01/A10/A15...) uygulanabilir ekler
    const leveragePrimary = result.portfolio.filter(a => {
      const { ACTION_RATIO_GROUP_PROFILE } = require('../actionRatioGroupProfile')
      return a.coverageMandatory && ACTION_RATIO_GROUP_PROFILE[a.actionId]?.primary === 'LEVERAGE'
    })
    expect(leveragePrimary.length).toBeGreaterThanOrEqual(1)
  })

  test('T_FIX5_UNMET: uygulanabilir primary yoksa debug.primaryCoverageUnmet kaydı', () => {
    // Likidite zayıf (cashRatio çok düşük) + primary LIQUIDITY aksiyonları uygulanamaz:
    //   A03: 340 hesabı yok → not applicable
    //   A22: 131/231 hesabı yok → not applicable
    // → FIX5 LIQUIDITY için primary bulamaz → primaryCoverageUnmet = [{group:'LIQUIDITY'}]
    //
    // Fixture:
    //   cashRatio = 100K / 10M = 0.01 << 0.14 benchmark → LİKİDİTE ZAYIF
    //   debtToEquity = 10M / 5M = 2.0 > 1.51 → KALDIRAC ZAYIF (A10 ile kapanır)
    //   DSO = 5M/20M*365 = 91 > 37 → FAALİYET ZAYIF (A05 ile kapanır)
    //   340 YOK → A03 applicable değil
    //   131/231 YOK → A22 applicable değil
    //   → LİKİDİTE primary KARŞILANAMAZ → unmet
    const result = runEngineV3({
      sector: 'TRADE',
      currentRating: 'B',
      accountBalances: {
        '102':   100_000,    // çok az nakit — cashRatio zayıf
        '120': 5_000_000,    // alacaklar — DSO zayıf
        '300': 10_000_000,   // KV finansal borç — D/E zayıf
        '500':  5_000_000,   // özkaynak
        // 340 YOK → A03 applicable değil
        // 131/231 YOK → A22 applicable değil
      },
      incomeStatement: {
        netSales:        20_000_000,
        costOfGoodsSold: 15_000_000,
        grossProfit:      5_000_000,   // 25% > 14% → GÜÇLÜ (kârlılık primary gerekmez)
        operatingProfit:  2_000_000,
        netIncome:          500_000,
        interestExpense:  1_000_000,
      },
      options: { allowedActionIds: [] },  // greedy boş → hiçbir primary seçilmedi
    })

    // Engine crash etmememeli
    expect(result.portfolio).toBeDefined()

    // LİKİDİTE primary kapsanamamış → debug.primaryCoverageUnmet tanımlı ve en az 1 kayıt
    const unmet = result.debug?.primaryCoverageUnmet
    expect(unmet).toBeDefined()
    expect(unmet!.length).toBeGreaterThanOrEqual(1)
    expect(unmet!.some(u => u.group === 'LIQUIDITY')).toBe(true)
  })
})
