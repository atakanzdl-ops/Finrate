/**
 * R6 — diagnoseFinancialExpenseReduction / diagnoseOperatingExpenseReduction
 *
 * Yeni tanısal yardımcılar — ana akış (A14/A21 computeAmount) DOKUNULMAZ.
 * "Neden null?" sorusunu cevaplar.
 *
 * EvaluationNote:
 *   SECTOR_TARGET_MET  — rasyo zaten benchmark altında
 *   MATERIALITY_BELOW  — gap var ama tutar önemsiz
 *   DATA_NOT_FOUND     — hesap verisi eksik
 *
 * ORGANIKA A14 debug: 780 yüksek → diagnose=null (öneri üretildi; hata değil)
 * DEKAM: 780/300/400 yok → DATA_NOT_FOUND
 */

import {
  diagnoseFinancialExpenseReduction,
  diagnoseOperatingExpenseReduction,
} from '../ratioHelpers'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'

const a14 = ACTION_CATALOG_V3['A14_FINANCE_COST_REDUCTION']

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'TRADE',
    accountBalances:   {},
    totalAssets:       200_000_000,
    totalEquity:        60_000_000,
    totalRevenue:      100_000_000,
    netIncome:           3_000_000,
    netSales:          100_000_000,
    operatingProfit:     8_000_000,
    grossProfit:        20_000_000,
    interestExpense:     5_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

// ─── diagnoseFinancialExpenseReduction ───────────────────────────────────────

describe('R6 — diagnoseFinancialExpenseReduction', () => {

  // T1: ORGANIKA — 780 yüksek → öneri üretildi → null döner
  test('T1 — ORGANIKA: 780 yüksek (ratio>benchmark) → diagnose=null (öneri var)', () => {
    // sector=TRADE, benchmark=0.03; 780=8M/100M=0.08 > 0.03 → öneri üretildi
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      accountBalances: { '780': 8_000_000 },
    }))
    // Öneri üretildi → null (tanı gerekmiyor)
    expect(result).toBeNull()
  })

  // T2: ORGANIKA deterministic — currentRatio ~0.32, MANUFACTURING benchmark=0.04
  test('T2 — currentRatio=0.32, benchmark=0.04 → null (öneri üretildi)', () => {
    // netSales=25M, 780=8M → ratio=0.32 > 0.04 (MANUFACTURING)
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '780': 8_000_000 },
      netSales:        25_000_000,
    }))
    expect(result).toBeNull()
  })

  // T3: DEKAM — 780/300/400 yok → DATA_NOT_FOUND
  test('T3 — DEKAM: 780/mali borç yok → DATA_NOT_FOUND', () => {
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '102': 93_000, '320': 71_900_000, '621': 350_500_000 },
      netSales:        328_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('DATA_NOT_FOUND')
  })

  // T4: Hedef altı — ratio ≤ benchmark → SECTOR_TARGET_MET
  test('T4 — Düşük fin gideri: 780=1M/50M → SECTOR_TARGET_MET (TRADE 0.03)', () => {
    // ratio = 1M/50M = 0.02 < 0.03 → SECTOR_TARGET_MET
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      accountBalances: { '780': 1_000_000 },
      netSales:        50_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('SECTOR_TARGET_MET')
    expect(result!.currentRatio).toBeCloseTo(0.02, 3)
    expect(result!.benchmarkRatio).toBe(0.03)
    expect(result!.gap).toBe(0)
  })

  // T5: netSales=0 → DATA_NOT_FOUND
  test('T5 — netSales=0 → DATA_NOT_FOUND', () => {
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      accountBalances: { '780': 5_000_000 },
      netSales:        0,
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('DATA_NOT_FOUND')
  })

  // T6: KOBİ fallback (780 yok, borç var) → öneri üretildi → null
  test('T6 — KOBİ fallback: 780 yok, 300=30M → öneri üretildi → null', () => {
    // 300=30M → getFinancialExpenses → isEstimated=true, amount=7.5M (0.25×30M)
    // TRADE benchmark=0.03; ratio=7.5M/100M=0.075 > 0.03 → öneri var
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      accountBalances: { '300': 30_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T7: userMessage Türkçe ve anlamlı
  test('T7 — userMessage Türkçe ve anlamlı (SECTOR_TARGET_MET case)', () => {
    const result = diagnoseFinancialExpenseReduction(makeCtx({
      accountBalances: { '780': 500_000 },
      netSales:        50_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!.userMessage).toBeTruthy()
    expect(result!.userMessage.length).toBeGreaterThan(20)
  })

})

// ─── ORGANIKA A14 Debug (ADIM 17 — Atakan için) ──────────────────────────────

/**
 * ORGANIKA A14 tanısal çıktısı.
 *
 * ORGANIKA profili (yaklaşık değerler):
 *   - Sektör: MANUFACTURING (veya TRADE)
 *   - KV borç (300) = 22.8M → 780 yoksa borç×0.25 = 5.7M isEstimated finExp
 *   - Net satış ≈ 38M → finExp ratio ≈ 0.15 >> benchmark 0.04 → öneri üretilmeli
 *
 * NOT: 780 yoksa KOBİ fallback (300×0.25) devreye girer.
 * Eğer diagnose=null → A14 öneri üretiyor (beklenen durum).
 * Eğer diagnose döner → sebebi userMessage'da.
 */
describe('ORGANIKA — A14 Debug Output', () => {

  test('ORGANIKA: 780 yok, 300=22.8M → KOBİ finExp=5.7M → diagnose=null veya DATA_NOT_FOUND', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '102': 960_000, '300': 22_800_000 },
      netSales:        38_000_000,
    })

    const result = diagnoseFinancialExpenseReduction(ctx)

    // Debug çıktısı — Atakan'ın incelemesi için
    console.log('\n=== ORGANIKA A14 Diagnostik ===')
    if (result === null) {
      console.log('✅ A14 ÖNERI ÜRETİLDİ (diagnose=null → aksiyon hesaplandı)')
    } else {
      console.log('⚠️  A14 ÖNERI YOK:', result.evaluationNote)
      console.log('   Mesaj:', result.userMessage)
      if (result.currentRatio !== undefined) {
        console.log(`   currentRatio: ${(result.currentRatio * 100).toFixed(2)}%`)
      }
      if (result.benchmarkRatio !== undefined) {
        console.log(`   benchmarkRatio: ${(result.benchmarkRatio * 100).toFixed(2)}%`)
      }
    }
    console.log('==============================\n')

    // Assertion: 5.7M / 38M = 0.15 > 0.04 (MANUFACTURING) → öneri üretilmeli
    // diagnose = null (öneri var) VEYA DATA_NOT_FOUND (780 yok + borç×0.25 hesaba katılmıyorsa)
    // Beklenen: null (KOBİ fallback devreye giriyor)
    expect(result).toBeNull()  // 5.7M/38M = 15% >> 4% benchmark → öneri üretildi
  })

  test('ORGANIKA: 780=0, 300=0 (hiç finansman) → DATA_NOT_FOUND', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '102': 960_000 },
      netSales:        38_000_000,
    })
    const result = diagnoseFinancialExpenseReduction(ctx)
    console.log('\n=== ORGANIKA A14 Debug (no-debt) ===')
    console.log(result ? `${result.evaluationNote}: ${result.userMessage}` : 'öneri üretildi')
    console.log('=====================================\n')
    expect(result?.evaluationNote).toBe('DATA_NOT_FOUND')
  })

})

// ─── diagnoseOperatingExpenseReduction ───────────────────────────────────────

describe('R6 — diagnoseOperatingExpenseReduction', () => {

  // T8: Yüksek opex → öneri üretildi → null
  test('T8 — Yüksek opex: 632=20M/100M=0.20 > TRADE 0.105 → null (öneri var)', () => {
    const result = diagnoseOperatingExpenseReduction(makeCtx({
      accountBalances: { '632': 20_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T9: Düşük opex → SECTOR_TARGET_MET
  test('T9 — Düşük opex: 632=5M/100M=0.05 < TRADE 0.105 → SECTOR_TARGET_MET', () => {
    const result = diagnoseOperatingExpenseReduction(makeCtx({
      accountBalances: { '632': 5_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('SECTOR_TARGET_MET')
    expect(result!.currentRatio).toBeCloseTo(0.05, 3)
    expect(result!.benchmarkRatio).toBeCloseTo(0.105, 3)
  })

  // T10: KOBİ — hesap yok, fallback = grossProfit - operatingProfit
  test('T10 — KOBİ fallback: grossProfit=20M, operatingProfit=5M → opex=15M → null (öneri var)', () => {
    // fallback = 20M - 5M = 15M; ratio = 0.15 > 0.105 → öneri üretildi
    const result = diagnoseOperatingExpenseReduction(makeCtx({
      accountBalances: {},
      grossProfit:     20_000_000,
      operatingProfit:  5_000_000,
    }))
    expect(result).toBeNull()
  })

  // T11: KOBİ fallback negatif → DATA_NOT_FOUND
  test('T11 — KOBİ fallback negatif (grossProfit < operatingProfit) → DATA_NOT_FOUND', () => {
    const result = diagnoseOperatingExpenseReduction(makeCtx({
      accountBalances: {},
      grossProfit:      3_000_000,
      operatingProfit: 10_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('DATA_NOT_FOUND')
  })

  // T12: netSales=0 → DATA_NOT_FOUND
  test('T12 — netSales=0 → DATA_NOT_FOUND', () => {
    const result = diagnoseOperatingExpenseReduction(makeCtx({
      netSales:        0,
      accountBalances: { '632': 5_000_000 },
    }))
    expect(result).not.toBeNull()
    expect(result!.evaluationNote).toBe('DATA_NOT_FOUND')
  })

})

// ─── Sonnet K2 — ORGANIKA A14 ana akış DİREKT doğrulama ──────────────────────

/**
 * Sonnet K2: "Diagnostic 'öneri üretildi' diyor.
 * A14.computeAmount(organikaCtx) DIRECT çağrısı SAYI mı NULL mı?"
 *
 * ORGANIKA hesaplama:
 *   780 yok, 300=22.8M → KOBİ finExp = 22.8M × 0.25 = 5.7M (isEstimated)
 *   MANUFACTURING benchmark = 0.04
 *   currentRatio = 5.7M / 17.7M = 0.322 >> 0.04
 *   gap = 0.282; reduction = 0.282 × 17.7M × 0.5 = 2,496,300
 *   cap = 5.7M × 0.30 = 1,710,000
 *   result = min(2,496,300; 1,710,000) = 1,710,000
 */
describe('Sonnet K2 — ORGANIKA A14 computeAmount DİREKT ÇAĞRI', () => {

  test('A14.computeAmount(organikaCtx): SAYI dönmeli (~1.71M)', () => {
    const organikaCtx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '300': 22_800_000 },   // 780 yok → KOBİ fallback
      netSales:        17_700_000,
      totalAssets:     106_000_000,
    })

    const amount = a14.computeAmount!(organikaCtx)

    // Kritik debug çıktısı — Atakan için
    console.log('\n=== ORGANIKA A14 ANA AKIŞ DOĞRULAMA (Sonnet K2) ===')
    console.log('A14.computeAmount(organikaCtx) =', amount)
    if (amount !== null) {
      console.log(`✅ TUTAR: ${(amount / 1_000_000).toFixed(2)}M TL`)
      console.log('   780 yok → KOBİ fallback (300×%25=5.7M), MANUFACTURING bm=%4')
      console.log(`   currentRatio: ${(5_700_000 / 17_700_000 * 100).toFixed(1)}%`)
      console.log('   gap=28.2%, half-gap=2.496M, cap=1.71M → min=1.71M')
    } else {
      console.log('⚠️  NULL — A14 ana akış ORGANIKA için öneri üretMEDİ!')
      console.log('   Diagnostic ile çelişiyor — kök neden araştırılmalı')
    }
    console.log('===================================================\n')

    // Beklenen: ~1.71M (cap devreye giriyor)
    expect(amount).not.toBeNull()
    expect(amount!).toBeCloseTo(1_710_000, -4)   // 10K hassasiyet
  })

  // Daha geniş ORGANIKA profili (netSales=38M ile)
  test('A14.computeAmount: netSales=38M, 300=22.8M → ~1.71M (cap hâlâ bağlayıcı)', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '300': 22_800_000 },
      netSales:        38_000_000,
      totalAssets:     106_000_000,
    })
    const amount = a14.computeAmount!(ctx)
    console.log('ORGANIKA (38M satış) A14 amount:', amount)

    // finExp=5.7M, currentRatio=5.7/38=0.150 > 0.04
    // gap=0.11; reduction=0.11×38M×0.5=2.09M
    // cap=5.7M×0.30=1.71M → min(2.09M, 1.71M) = 1.71M
    expect(amount).not.toBeNull()
    expect(amount!).toBeCloseTo(1_710_000, -4)
  })

})
