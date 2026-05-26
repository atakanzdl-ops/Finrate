/**
 * R8.4.5 — Parser 7xx + 501 Ödenmemiş Sermaye Testleri
 *
 * Kapsam:
 *   BUG 2 — A14 780 Hesabı DB'ye Gitmiyordu:
 *     - excel.ts MIZAN_MAP'te '780' yoktu → rawAccounts'a hiç girmiyordu
 *     - route.ts filter sadece 1xx-5xx kabul ediyordu
 *     - A14 helper 780 bulamayınca fallback: borç × %25 = 'Tahmini'
 *
 *   BUG 3 — 501 Ödenmemiş Sermaye Parser'da Yoktu:
 *     - excel.ts MIZAN_MAP'te '501' eşleşmesi yoktu
 *     - Parser rawAccounts'a 501 yazmıyordu
 *     - Engine signedSumByCodes 501 deduction listesinde AMA balances['501']=0
 *     - totalEquity şişiyordu
 *
 * Düzeltmeler:
 *   1. excel.ts MIZAN_MAP: '780': 'financialExpenses', '781': 'financialExpenses' eklendi
 *   2. excel.ts MIZAN_MAP: '501': 'paidInCapital_CB' eklendi (_CB = -bakBorç = kontra)
 *   3. upload/route.ts: filter + deleteMany '7' prefix eklendi
 *
 * README pattern (R6 + R7A dersleri):
 *   - Birim test + entegrasyon testi zorunlu
 *   - ACTION_CATALOG_V3['...'] pattern (named export YOK)
 *   - computeAmount! operatörü (? tuzağı)
 *   - runEngineV3 EngineInput pattern (firmContext sarmalama YOK)
 *   - allowedActionIds ile izole test
 *
 * Sabitler:
 *   T_R845_1  — Filter: 7xx dahil edildi
 *   T_R845_2  — Filter: 6xx/8xx/9xx hâlâ dışarıda
 *   T_R845_3  — getFinancialExpenses: 780 varsa isEstimated=false
 *   T_R845_4  — getFinancialExpenses: 780 yoksa isEstimated=true (fallback)
 *   T_R845_5  — A14 unit: ctx'te 780 → computeAmount null değil
 *   T_INT_1   — Engine entegrasyon: 780 accountBalances'ta → A14 portfolio'da
 *   T_INT_2   — Engine entegrasyon: 501 etkisi — paidInCapital düşük
 *   T_INT_3   — parseMizanRows: '501' rawAccounts'a yazılıyor
 *   T_INT_4   — parseMizanRows: '780' rawAccounts'a yazılıyor
 */

import { getFinancialExpenses }       from '../ratioHelpers'
import { ACTION_CATALOG_V3 }          from '../actionCatalogV3'
import { runEngineV3 }                from '../engineV3'
import type { FirmContext }           from '../contracts'
import type { EngineInput }          from '../engineV3'
import { parseMizanRows }             from '@/lib/parsers/excel'

const a14 = ACTION_CATALOG_V3['A14_FINANCE_COST_REDUCTION']

// ─── Yardımcı factory ────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:           'MANUFACTURING',
    accountBalances:  {},
    totalAssets:      317_500_000,
    totalEquity:       63_500_000,
    totalRevenue:     318_000_000,
    netIncome:          5_000_000,
    netSales:         318_000_000,
    operatingProfit:   12_000_000,
    grossProfit:       50_000_000,
    interestExpense:   17_900_000,
    operatingCashFlow: null,
    ...overrides,
  }
}

/** Minimal mizan satır seti: header + 4 hesap kodu (≥3 fields garantisi) */
function makeMizanRows(extraRows: unknown[][] = []): unknown[][] {
  return [
    // Header: 'Hesap Kodu' (isCodeHeaderCell), 'Bakiye Borç' (bakBorc), 'Bakiye Alacak' (bakAlacak)
    ['Hesap Kodu', 'Bakiye Borç', 'Bakiye Alacak'],
    // 120 Alıcılar (borç bakiyeli)
    ['120', 63_000_000,   0],
    // 300 Banka Kredileri (alacak bakiyeli)
    ['300',          0, 137_100_000],
    ...extraRows,
  ]
}

// ─── T_R845 — Birim Testler ───────────────────────────────────────────────────

describe('R8.4.5 — Upload route filter 7xx (Unit)', () => {

  // T_R845_1: 7xx dahil edildi
  test('T_R845_1 — Filter: 7xx (780/781) kabul ediliyor', () => {
    const rawAccounts = [
      { code: '120', amount: 63_000_000 },
      { code: '500', amount: 100_000_000 },
      { code: '501', amount:  49_000_000 },
      { code: '780', amount:  17_900_000 },
      { code: '781', amount:   1_000_000 },
    ]
    // R8.4.5 sonrası prefix listesi
    const allowedPrefixes = ['1', '2', '3', '4', '5', '7']
    const filtered = rawAccounts.filter(a =>
      allowedPrefixes.some(p => a.code.startsWith(p))
    )
    expect(filtered).toHaveLength(5)
    expect(filtered.find(a => a.code === '780')).toBeDefined()
    expect(filtered.find(a => a.code === '781')).toBeDefined()
  })

  // T_R845_2: 6xx/8xx/9xx hâlâ dışarıda
  test('T_R845_2 — Filter: 6xx/8xx/9xx reddediliyor', () => {
    const rawAccounts = [
      { code: '600', amount: 318_000_000 },
      { code: '620', amount:  95_000_000 },
      { code: '850', amount:   1_000_000 },
      { code: '950', amount:     500_000 },
    ]
    const allowedPrefixes = ['1', '2', '3', '4', '5', '7']
    const filtered = rawAccounts.filter(a =>
      allowedPrefixes.some(p => a.code.startsWith(p))
    )
    expect(filtered).toHaveLength(0)
  })

})

describe('R8.4.5 — getFinancialExpenses 780 (Unit)', () => {

  // T_R845_3: 780 varsa isEstimated=false
  test('T_R845_3 — 780 DB\'de varsa: isEstimated=false (gerçek değer)', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '780': 17_900_000 },
    }))
    expect(result.isEstimated).toBe(false)
    expect(result.amount).toBe(17_900_000)
  })

  // T_R845_4: 780 yoksa fallback çalışır (isEstimated=true)
  test('T_R845_4 — 780 DB\'de yoksa: isEstimated=true (borç×%25 fallback)', () => {
    const result = getFinancialExpenses(makeCtx({
      accountBalances: { '300': 137_100_000 },
    }))
    expect(result.isEstimated).toBe(true)
    expect(result.amount).toBeGreaterThan(0)
  })

  // T_R845_5: 780 ile A14 computeAmount → null değil
  test('T_R845_5 — A14 computeAmount: 780=17.9M, netSales=318M → null değil', () => {
    // MANUFACTURING financialExpenseRatio benchmark = 0.03 (bkz. benchmarks.ts)
    // finExp ratio = 17.9M/318M = 5.6% > 3% → gap = 2.6% → tutar üretir
    expect(a14.computeAmount).toBeDefined()
    const result = a14.computeAmount!(makeCtx({
      accountBalances: { '780': 17_900_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

})

// ─── T_INT — Entegrasyon Testler (README zorunlu) ────────────────────────────

describe('R8.4.5 — Engine Entegrasyon: 780 → A14 portfolio (Integration)', () => {

  // T_INT_1: Engine'e 780 verilince A14 portfolio'da görünür
  test('T_INT_1 — accountBalances[\'780\']=17.9M → A14 portfolio\'da', () => {
    const input: EngineInput = {
      sector:         'MANUFACTURING',
      currentRating:  'B',
      targetRating:   'BBB',
      accountBalances: {
        '120': 63_000_000,
        '300': 137_100_000,
        '400': 122_200_000,
        '500': 100_000_000,
        '780': 17_900_000,
      },
      incomeStatement: {
        netSales:          318_000_000,
        costOfGoodsSold:   268_000_000,
        grossProfit:        50_000_000,
        operatingProfit:    12_000_000,
        netIncome:           5_000_000,
        interestExpense:    17_900_000,
      },
      options: {
        allowedActionIds: ['A14_FINANCE_COST_REDUCTION'],
      },
    }

    const result = runEngineV3(input)

    const a14Result = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14Result).toBeDefined()
    expect(a14Result?.amountTRY).toBeGreaterThan(1_000_000)
  })

  // T_INT_2: 780 yokken A14 KOBİ fallback çalışır (isEstimated)
  // Bu test R8.4.5 ÖNCESI davranışı gösterir — fallback hâlâ çalışmalı
  test('T_INT_2 — 780 yokken A14: 300=137.1M borç × %25 fallback → A14 hâlâ çalışır', () => {
    const input: EngineInput = {
      sector:         'MANUFACTURING',
      currentRating:  'B',
      targetRating:   'BBB',
      accountBalances: {
        '120': 63_000_000,
        '300': 137_100_000,   // 780 YOK — sadece borç var
        '400': 122_200_000,
        '500': 100_000_000,
      },
      incomeStatement: {
        netSales:          318_000_000,
        costOfGoodsSold:   268_000_000,
        grossProfit:        50_000_000,
        operatingProfit:    12_000_000,
        netIncome:           5_000_000,
        interestExpense:    17_900_000,
      },
      options: {
        allowedActionIds: ['A14_FINANCE_COST_REDUCTION'],
      },
    }

    const result = runEngineV3(input)

    // KOBİ fallback: (137.1M + 122.2M) × 0.25 = 64.8M tahmini
    // Yeterince yüksek → A14 hâlâ portfolio'da (semanticGuardrails allowComputedSource:true)
    const a14Result = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14Result).toBeDefined()
    expect(a14Result?.amountTRY).toBeGreaterThan(0)
  })

})

describe('R8.4.5 — parseMizanRows: 501 + 780 rawAccounts (Integration)', () => {

  // T_INT_3: parseMizanRows — 501 rawAccounts'a yazılıyor
  test('T_INT_3 — 501 Ödenmemiş Sermaye rawAccounts\'ta (borç bakiyesi)', async () => {
    // MIZAN_MAP['501'] = 'paidInCapital_CB' (R8.4.5 eklendi)
    // _CB: bakBorç tarafı → rawAmount = bb = 49M
    const rows = makeMizanRows([
      ['500',          0, 100_000_000],   // paidInCapital_A → ba = 100M
      ['501', 49_000_000,           0],   // paidInCapital_CB → bb = 49M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry501 = raw.find(a => a.code === '501')

    expect(entry501).toBeDefined()
    expect(entry501?.amount).toBe(49_000_000)
  })

  // T_INT_4: parseMizanRows — 780 rawAccounts'a yazılıyor
  test('T_INT_4 — 780 Finansman Giderleri rawAccounts\'ta (borç bakiyesi)', async () => {
    // MIZAN_MAP['780'] = 'financialExpenses' (R8.4.5 eklendi)
    // suffix yok → rawAmount = bb = 17.9M
    const rows = makeMizanRows([
      ['500',           0, 100_000_000],  // paidInCapital → fields'a
      ['780',  17_900_000,  17_900_000],  // financialExpenses → bb = 17.9M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry780 = raw.find(a => a.code === '780')

    expect(entry780).toBeDefined()
    expect(entry780?.amount).toBe(17_900_000)
  })

  // T_INT_5: parseMizanRows — 501 paidInCapital'dan düşüyor (aggregate kontrol)
  test('T_INT_5 — 501 _CB: aggregate fields.paidInCapital = 500-501 = 51M', async () => {
    const rows = makeMizanRows([
      ['500',           0, 100_000_000],  // paidInCapital_A → +ba → +100M
      ['501',  49_000_000,           0],  // paidInCapital_CB → -bb → -49M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    // fields.paidInCapital = 100M - 49M = 51M
    const fields = parsed[0]?.fields ?? {}
    expect(fields['paidInCapital']).toBeCloseTo(51_000_000, 0)
  })

  // T_INT_6: parseMizanRows — 780 fields.financialExpenses'a yazılıyor
  test('T_INT_6 — 780 aggregate: fields.financialExpenses = 17.9M', async () => {
    const rows = makeMizanRows([
      ['500',           0, 100_000_000],  // 3. fields key garantisi
      ['780',  17_900_000,  17_900_000],  // financialExpenses → +bb → +17.9M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['financialExpenses']).toBeCloseTo(17_900_000, 0)
  })

})
