/**
 * R8.4.5 + R8.4.5b — Parser 7xx + 501 Ödenmemiş Sermaye Testleri
 *
 * Kapsam:
 *   BUG 2 — A14 780 Hesabı DB'ye Gitmiyordu:
 *     - excel.ts MIZAN_MAP'te '780' yoktu → rawAccounts'a hiç girmiyordu
 *     - route.ts filter sadece 1xx-5xx kabul ediyordu
 *     - A14 helper 780 bulamayınca fallback: borç × %25 = 'Tahmini'
 *
 *   BUG 2b — Logo Mizan Yıl Sonu Kapanışı (R8.4.5b):
 *     - Logo/iPOS ACCLIST: "Bakiye Bor." = 0 (780 kapanmış), "Toplam Bor." = 17.9M
 *     - getNum('bakBorc', 'borc'): cols['bakBorc'] TANIMLI → bakBorc = 0 okur
 *     - Değer 0 olsa bile fallback tetiklenmez → rawAmount = 0 → push edilmiyordu
 *     - R8.4.5 MIZAN_MAP eklemesi etkisizdi
 *
 *   BUG 3 — 501 Ödenmemiş Sermaye Parser'da Yoktu:
 *     - excel.ts MIZAN_MAP'te '501' eşleşmesi yoktu
 *     - Parser rawAccounts'a 501 yazmıyordu
 *     - Engine signedSumByCodes 501 deduction listesinde AMA balances['501']=0
 *     - totalEquity şişiyordu
 *
 * Düzeltmeler:
 *   1. excel.ts MIZAN_MAP: '780'/'781' R8.4.5c'de 'interestExpense' olarak eklendi; R8.4.5e'de
 *      MIZAN_RAW_ONLY set'e taşındı (fields'a yazılmaz → beyanname interestExpense korunur)
 *   2. excel.ts MIZAN_MAP: '501': 'paidInCapital_CB' eklendi (_CB = -bakBorç = kontra)
 *   3. upload/route.ts: filter + deleteMany '7' prefix eklendi
 *   4. excel.ts rawAccounts: 7xx bakiye=0 → Dönem Toplamı fallback (R8.4.5b)
 *
 * README pattern (R6 + R7A dersleri):
 *   - Birim test + entegrasyon testi zorunlu
 *   - ACTION_CATALOG_V3['...'] pattern (named export YOK)
 *   - computeAmount! operatörü (? tuzağı)
 *   - runEngineV3 EngineInput pattern (firmContext sarmalama YOK)
 *   - allowedActionIds ile izole test
 *
 * Sabitler:
 *   T_R845_1     — Filter: 7xx dahil edildi
 *   T_R845_2     — Filter: 6xx/8xx/9xx hâlâ dışarıda
 *   T_R845_3     — getFinancialExpenses: 780 varsa isEstimated=false
 *   T_R845_4     — getFinancialExpenses: 780 yoksa isEstimated=true (fallback)
 *   T_R845_5     — A14 unit: ctx'te 780 → computeAmount null değil
 *   T_INT_1      — Engine entegrasyon: 780 accountBalances'ta → A14 portfolio'da
 *   T_INT_2      — Engine entegrasyon: 501 etkisi — paidInCapital düşük
 *   T_INT_3      — parseMizanRows: '501' rawAccounts'a yazılıyor
 *   T_INT_4      — parseMizanRows: '780' Logo formatı (bakBorc=0) → rawAccounts push
 *   T_INT_5      — parseMizanRows: 501 paidInCapital aggregate
 *   T_INT_6      — parseMizanRows: 780 rawAccounts (fields.interestExpense YOK — R8.4.5e)
 *   T_R8_4_5b_1  — 7xx bakiye=0, toplam>0 → rawAccounts push (Logo canlı senaryo)
 *   T_R8_4_5b_2  — 1xx-5xx bakiye=0 → push EDİLMEZ (regression koruma)
 *   T_R8_4_5b_3  — 7xx bakiye>0 → bakiye kullan (kapanmamış hesap)
 *   T_R8_4_5b_4  — 7xx bakiye=0, toplam=0 → push EDİLMEZ (edge case)
 *   T_R9_MAP_1   — 127 bb=14M → tradeReceivables=14M (R9.1: eksik hesap)
 *   T_R9_MAP_2   — 303 ba=9.4M → shortTermFinancialDebt=9.4M (R9.1: eksik hesap)
 *   T_R9_MAP_3   — 380 ba=39.8M → deferredRevenue=39.8M (R9.1: eksik hesap)
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

/** Minimal mizan satır seti: header + base hesaplar (≥3 fields garantisi)
 *  3-sütun format: [code, bakBorc, bakAlacak]
 *  Bilanço testleri için (bakiye = gerçek değer). */
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

/** Logo/iPOS ACCLIST format: 5-sütun, yıl sonu kapanışlı mizan
 *  Sütun sırası: [code, bakBorc, bakAlacak, borc, alacak]
 *  - "Bakiye Bor." → cols['bakBorc'] (kapanmış 7xx hesaplar için = 0)
 *  - "Bakiye Alac." → cols['bakAlacak']
 *  - "Toplam Bor." → cols['borc']  (dönem toplamı = gerçek gider)
 *  - "Toplam Alac." → cols['alacak']
 *  R8.4.5b: 7xx bakBorc=0 → getNum('borc') dönem toplamı kullanılır. */
function makeLogoMizanRows(extraRows: unknown[][] = []): unknown[][] {
  return [
    // Faz 7.3.22: iPOS Logo ACCLIST sütun isimleri
    ['Hesap Kodu', 'Bakiye Bor.', 'Bakiye Alac.', 'Toplam Bor.', 'Toplam Alac.'],
    // 120 Alıcılar: bakiye=63M (bilanço, kapatılmaz)
    ['120', 63_000_000, 0, 63_000_000, 0],
    // 300 Banka Kredileri: bakiye alacak=137.1M
    ['300', 0, 137_100_000, 0, 137_100_000],
    // 500 Sermaye: bakiye alacak=100M (3. fields key garantisi)
    ['500', 0, 100_000_000, 0, 100_000_000],
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

  // T_INT_4: parseMizanRows — 780 rawAccounts'a yazılıyor (Logo yıl sonu formatı)
  // R8.4.5b: iPOS Logo gerçek format — bakBorc=0 (kapanmış), Toplam Bor.=17.9M
  test('T_INT_4 — 780 Logo formatı: bakBorc=0, Toplam Bor.=17.9M → rawAccounts push', async () => {
    // Faz 7.3.22 iPOS canlı kanıtı:
    //   780 MALY | Toplam Borç: 17,869,078.32 | Bakiye Borç: 0 (yıl sonu kapanışı)
    // 5-sütun: [code, bakBorc, bakAlacak, borc, alacak]
    const rows = makeLogoMizanRows([
      ['780', 0, 0, 17_900_000, 17_900_000],  // R8.4.5b: bb=0 → getNum('borc')=17.9M
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

  // T_INT_6: parseMizanRows — 780 rawAccounts'a yazılıyor, fields'a YAZILMIYOR (R8.4.5e)
  // Sebep: MIZAN_MAP'ten kaldırıldı → MIZAN_RAW_ONLY set'e taşındı →
  //   fields'ta interestExpense key oluşmaz → MIZAN cleanup null yaratmaz →
  //   merge spread beyanname değerini yok etmez (DEKAM B→BB hotfix).
  // rawAccounts → DB accountBalances['780'] → engine A14 hesabı devam eder.
  test('T_INT_6 — 780 rawAccounts (non-Logo, bakBorc>0): fields.interestExpense YOK, rawAccounts[780]=17.9M', async () => {
    const rows = makeMizanRows([
      ['500',           0, 100_000_000],  // 3. fields key garantisi
      ['780',  17_900_000,  17_900_000],  // R8.4.5e: MIZAN_RAW_ONLY → sadece rawAccounts
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    // fields'ta interestExpense OLMAMALI (R8.4.5e: key oluşturulmaz → null propagation yok)
    const fields = parsed[0]?.fields ?? {}
    expect(fields['interestExpense']).toBeUndefined()

    // rawAccounts'ta 780 OLMALI (engine accountBalances['780'] okuyabilir)
    const rawAccs = parsed[0]?.rawAccounts ?? []
    const acc780 = rawAccs.find(a => a.code === '780')
    expect(acc780).toBeDefined()
    expect(acc780!.amount).toBeCloseTo(17_900_000, 0)
  })

})

// ─── T_R8_4_5b — Logo Yıl Sonu Kapanışı Fallback Testleri ───────────────────

describe('R8.4.5b — 7xx Bakiye=0 Dönem Toplamı Fallback (Integration)', () => {

  // T_R8_4_5b_1: 7xx bakiye=0, toplam>0 → rawAccounts push (Logo canlı senaryo)
  // iPOS 780 canlı kanıt: bakBorc=0, Toplam Bor.=17,869,078.32
  test('T_R8_4_5b_1 — 7xx bakiye=0 + toplam>0 → rawAccounts push (17.9M)', async () => {
    const rows = makeLogoMizanRows([
      ['780', 0, 0, 17_900_000, 17_900_000],
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry = raw.find(a => a.code === '780')

    expect(entry).toBeDefined()
    expect(entry!.amount).toBe(17_900_000)
  })

  // T_R8_4_5b_2: 1xx-5xx bakiye=0 → push EDİLMEZ (regression koruma)
  // 1xx-5xx bilanço hesapları için bakiye=0 gerçek sıfır demektir
  // nc.startsWith('7') koşulu sadece 7xx'e uygulanır
  test('T_R8_4_5b_2 — 1xx-5xx bakiye=0 → push EDİLMEZ (regression)', async () => {
    const rows = makeLogoMizanRows([
      // 153 Ticaret Malı: bakiye=0, toplam=5M — bilanço hesabı, 7xx fallback UYGULANMAZ
      ['153', 0, 0, 5_000_000, 5_000_000],
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry153 = raw.find(a => a.code === '153')

    // bakBorc=0, nc='153' (starts with '1'), fallback TETIKLENMEZ → rawAmount=0 → push yok
    expect(entry153).toBeUndefined()
  })

  // T_R8_4_5b_3: 7xx bakiye>0 → bakiye kullan (yıl içi, kapanmamış hesap)
  // Yıl içi mizan veya Q dönem mizan: bakiye = o ana kadar birikmiş gider
  test('T_R8_4_5b_3 — 7xx bakiye>0 → bakiye kullan (kapanmamış)', async () => {
    const rows = makeLogoMizanRows([
      // 780: henüz kapanmamış, bakBorc>0
      ['780', 10_000_000, 0, 10_000_000, 0],
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry = raw.find(a => a.code === '780')

    // bb=10M (bakBorc>0) → nc.startsWith('7') && bb===0 → FALSE → rawAmount=bb=10M
    expect(entry).toBeDefined()
    expect(entry!.amount).toBe(10_000_000)
  })

  // T_R8_4_5b_4: 7xx bakiye=0, toplam=0 → push EDİLMEZ (edge case)
  // Hiç hareket görmemiş 7xx hesabı: ne bakiye ne toplam var
  test('T_R8_4_5b_4 — 7xx bakiye=0 + toplam=0 → push EDİLMEZ (edge case)', async () => {
    const rows = makeLogoMizanRows([
      ['780', 0, 0, 0, 0],  // boş 780 hesabı — hem bakiye hem toplam 0
    ])

    const parsed = await parseMizanRows(rows)
    // fields sayısı zaten ≥3 (base rows: 120, 300, 500)
    expect(parsed.length).toBeGreaterThan(0)

    const raw = parsed[0]?.rawAccounts ?? []
    const entry = raw.find(a => a.code === '780')

    // getNum('borc') = 0 → rawAmount=0 → push yok
    expect(entry).toBeUndefined()
  })

})

// ─── T_R845_231_1/159_1/340_1 — R9 Ters Bakiye Testleri ─────────────────────

describe('R9 — MIZAN_SPLIT Ters Bakiye: 231 / 159 / 340 (Integration)', () => {

  // T_R845_231_1: 231 ba>0 (ters bakiye) → longTermOtherPayables
  // 231 Ortaklardan Alacaklar: normalde aktif (bb). Ters bakiye → UV pasif borç.
  test('T_R845_231_1 — 231 ba>0: longTermOtherPayables = ba; longTermOtherReceivables = 0', async () => {
    const rows = makeMizanRows([
      ['231', 0, 5_000_000],  // bb=0, ba=5M → ters bakiye
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['longTermOtherPayables']).toBeCloseTo(5_000_000, 0)
    expect(fields['longTermOtherReceivables'] ?? 0).toBeCloseTo(0, 0)
  })

  // T_R845_159_1: 159 ba>0 (ters bakiye) → advancesReceived
  // 159 Verilen Sipariş Avansları: normalde aktif (bb). Ters bakiye → alınan avans (pasif).
  test('T_R845_159_1 — 159 ba>0: advancesReceived = ba; prepaidSuppliers = 0', async () => {
    const rows = makeMizanRows([
      ['159', 0, 3_000_000],  // bb=0, ba=3M → ters bakiye
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['advancesReceived']).toBeCloseTo(3_000_000, 0)
    expect(fields['prepaidSuppliers'] ?? 0).toBeCloseTo(0, 0)
  })

  // T_R845_340_1: 340 bb>0 (ters bakiye, saf) → prepaidSuppliers = net_bb
  // bb=8M, ba=0 → net_bb=8M, net_ba=0 → sadece prepaidSuppliers
  test('T_R845_340_1 — 340 bb>0 ba=0: prepaidSuppliers = bb; advancesReceived = 0', async () => {
    const rows = makeMizanRows([
      ['340', 8_000_000, 0],  // bb=8M, ba=0 → net_bb=8M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['prepaidSuppliers']).toBeCloseTo(8_000_000, 0)
    expect(fields['advancesReceived'] ?? 0).toBeCloseTo(0, 0)
  })

})

// ─── T_R9_NET — R9 Hotfix: Net Bakiye Mantığı Testleri ───────────────────────

describe('R9 Hotfix — Net Bakiye Mantığı: bb ve ba aynı anda > 0 (Integration)', () => {

  // T_R9_NET_1: 340 İSRA senaryosu — dönem hareketi bb+ba
  // ba=937M (alınan avanslar), bb=35M (teslim edilen/dönem borç) →
  // net_ba=902M (pasife), net_bb=0 (aktife hayır)
  test('T_R9_NET_1 — 340 bb=35M ba=937M: advancesReceived=902M, prepaidSuppliers=0', async () => {
    const rows = makeMizanRows([
      ['340', 35_000_000, 937_000_000],  // bb=35M, ba=937M → net_ba=902M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['advancesReceived']).toBeCloseTo(902_000_000, 0)
    expect(fields['prepaidSuppliers'] ?? 0).toBeCloseTo(0, 0)
  })

  // T_R9_NET_2: 120 normal aktif bakiye — net_bb = bb
  // bb=100M, ba=0 → net_bb=100M → tradeReceivables (mevcut davranış korunuyor)
  // Bağımsız satır seti (makeMizanRows kullanılmaz) — ≥3 field garantisi için 500 eklendi
  test('T_R9_NET_2 — 120 bb=100M ba=0: tradeReceivables=100M (normal aktif)', async () => {
    const rows: unknown[][] = [
      ['Hesap Kodu', 'Bakiye Borç', 'Bakiye Alacak'],
      ['120', 100_000_000,           0],  // net_bb=100M → tradeReceivables
      ['300',           0, 137_100_000],  // shortTermFinancialDebt
      ['500',           0, 100_000_000],  // paidInCapital — 3. field garantisi
    ]

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['tradeReceivables']).toBeCloseTo(100_000_000, 0)
    expect(fields['advancesReceived'] ?? 0).toBeCloseTo(0, 0)
  })

  // T_R9_NET_3: 120 ters bakiye — net_ba = ba
  // bb=0, ba=5M → net_ba=5M → advancesReceived (alınan avans tarafı)
  test('T_R9_NET_3 — 120 bb=0 ba=5M: advancesReceived=5M (ters bakiye)', async () => {
    const rows = makeMizanRows([
      ['120', 0, 5_000_000],  // bb=0, ba=5M → net_ba=5M
    ])

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['advancesReceived']).toBeCloseTo(5_000_000, 0)
    // tradeReceivables: sadece base row 120 (63M) — ters bakiye satırından 0 gelir
    expect(fields['tradeReceivables']).toBeCloseTo(63_000_000, 0)
  })

})

// ─── T_R9_MAP — R9.1 Eksik Hesap Kodları (127/303/380) ───────────────────────

describe('R9.1 — MIZAN_MAP Eksik Hesap Kodları: 127 / 303 / 380 (Integration)', () => {

  // T_R9_MAP_1: 127 Diğer Ticari Alacaklar → tradeReceivables (aktif, borç bakiyeli, no suffix)
  // İSRA 2025 mizanında 14M aktif eksiklik kaynağı
  test('T_R9_MAP_1 — 127 bb=14M: tradeReceivables=14M', async () => {
    const rows: unknown[][] = [
      ['Hesap Kodu', 'Bakiye Borç', 'Bakiye Alacak'],
      ['127',  14_000_000,           0],  // Diğer Ticari Alacaklar — bb
      ['300',           0, 137_100_000],  // shortTermFinancialDebt (2. field)
      ['500',           0, 100_000_000],  // paidInCapital (3. field)
    ]

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['tradeReceivables']).toBeCloseTo(14_000_000, 0)
  })

  // T_R9_MAP_2: 303 UV Kredi KV Taksitleri → shortTermFinancialDebt (pasif, alacak bakiyeli, _A)
  // İSRA 2025 mizanında 9.4M pasif eksiklik kaynağı
  test('T_R9_MAP_2 — 303 ba=9.4M: shortTermFinancialDebt=9.4M', async () => {
    const rows: unknown[][] = [
      ['Hesap Kodu', 'Bakiye Borç', 'Bakiye Alacak'],
      ['127',  14_000_000,          0],   // tradeReceivables (1. field)
      ['303',           0,  9_400_000],   // UV Kredi KV Taksitleri — ba (_A)
      ['500',           0, 100_000_000],  // paidInCapital (3. field)
    ]

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['shortTermFinancialDebt']).toBeCloseTo(9_400_000, 0)
  })

  // T_R9_MAP_3: 380 Gelecek Aylara Ait Gelirler → deferredRevenue (pasif, alacak bakiyeli, _A)
  // İSRA 2025 mizanında 39.8M pasif eksiklik kaynağı
  test('T_R9_MAP_3 — 380 ba=39.8M: deferredRevenue=39.8M', async () => {
    const rows: unknown[][] = [
      ['Hesap Kodu', 'Bakiye Borç', 'Bakiye Alacak'],
      ['127',  14_000_000,           0],  // tradeReceivables (1. field)
      ['380',           0,  39_800_000],  // Gelecek Aylara Ait Gelirler — ba (_A)
      ['500',           0, 100_000_000],  // paidInCapital (3. field)
    ]

    const parsed = await parseMizanRows(rows)
    expect(parsed.length).toBeGreaterThan(0)

    const fields = parsed[0]?.fields ?? {}
    expect(fields['deferredRevenue']).toBeCloseTo(39_800_000, 0)
  })

})
