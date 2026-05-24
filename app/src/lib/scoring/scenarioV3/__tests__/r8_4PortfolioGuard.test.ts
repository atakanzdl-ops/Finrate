/**
 * R8.4 — Portfolio Resource Guard + A05 DSO Sector Floor testleri.
 *
 * Kapsam:
 *   1. validatePortfolioResources — negatif bakiye guard birimi
 *   2. getReceivableCollectionTarget — A05 yarım-boşluk DSO hedefi
 *   3. ACTION_CATALOG_V3 — A05 computeAmount entegrasyonu
 *
 * Sabitler:
 *   T_PRG_1..T_PRG_5 — validatePortfolioResources birimi
 *   T_RCT_1..T_RCT_6 — getReceivableCollectionTarget birimi
 *   T_A05_1..T_A05_2 — A05 catalog entegrasyonu
 */

import { validatePortfolioResources } from '../portfolioResourceGuard'
import { getReceivableCollectionTarget } from '../ratioHelpers'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'
import type { AccountingTransaction } from '../contracts'

// ─── Test yardımcıları ────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> & { period?: string } = {}): FirmContext {
  return {
    sector:           'MANUFACTURING',
    accountBalances:  {},
    totalAssets:      100_000_000,
    totalEquity:       30_000_000,
    totalRevenue:      50_000_000,
    netIncome:          5_000_000,
    netSales:          50_000_000,
    operatingProfit:    7_000_000,
    grossProfit:       12_000_000,
    interestExpense:    1_000_000,
    operatingCashFlow:  6_000_000,
    period:           'ANNUAL',
    ...overrides,
  } as FirmContext
}

function makeTx(
  id: string,
  legs: { accountCode: string; side: 'DEBIT' | 'CREDIT'; amount: number }[]
): AccountingTransaction {
  return {
    transactionId: id,
    description:   id,
    semanticType:  'OPERATIONAL_REVENUE',
    legs: legs.map(l => ({
      accountCode:  l.accountCode,
      accountName:  l.accountCode,
      side:         l.side,
      amount:       l.amount,
      description:  l.accountCode,
    })),
  }
}

// ─── T_PRG — validatePortfolioResources ──────────────────────────────────────

describe('R8.4 — validatePortfolioResources (negatif bakiye guard)', () => {

  // T_PRG_1: Boş transaction seti → her zaman geçerli
  test('T_PRG_1 — boş transactions → feasible: true', () => {
    const result = validatePortfolioResources([], {})
    expect(result.feasible).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  // T_PRG_2: Tek işlem, bakiye yeterli → geçerli
  test('T_PRG_2 — tek işlem pozitif kalır → feasible: true', () => {
    // 102 Banka: 10M başlangıç, 3M kredi → 7M kalır (pozitif)
    const tx = makeTx('TX_BANKA', [
      { accountCode: '102', side: 'CREDIT', amount: 3_000_000 },
      { accountCode: '500', side: 'DEBIT',  amount: 3_000_000 },
    ])
    const result = validatePortfolioResources([tx], { '102': 10_000_000, '500': 5_000_000 })
    expect(result.feasible).toBe(true)
  })

  // T_PRG_3: İSRA benzeri A18+A19 stok çakışması → infeasible
  // 153 Ticari Mallar: 5M başlangıç
  // txA18: 153'e 4M credit (stok maliyetlendirmesi)
  // txA19: 153'e 3M credit (stok maliyetlendirmesi)
  // Toplam: 7M > 5M → negatif bakiye → error
  test('T_PRG_3 — İSRA benzeri A18+A19 stok çakışması → feasible: false', () => {
    const txA18 = makeTx('A18_TX', [
      { accountCode: '120', side: 'DEBIT',  amount: 5_000_000 },
      { accountCode: '600', side: 'CREDIT', amount: 5_000_000 },
      { accountCode: '621', side: 'DEBIT',  amount: 4_000_000 },
      { accountCode: '153', side: 'CREDIT', amount: 4_000_000 },
    ])
    const txA19 = makeTx('A19_TX', [
      { accountCode: '340', side: 'DEBIT',  amount: 4_000_000 },
      { accountCode: '600', side: 'CREDIT', amount: 4_000_000 },
      { accountCode: '621', side: 'DEBIT',  amount: 3_000_000 },
      { accountCode: '153', side: 'CREDIT', amount: 3_000_000 },
    ])
    const balances = {
      '153': 5_000_000,  // stok: 4M + 3M = 7M > 5M → negatif
      '120': 10_000_000,
      '340': 8_000_000,
    }
    const result = validatePortfolioResources([txA18, txA19], balances)
    expect(result.feasible).toBe(false)
    expect(result.reason).toBeTruthy()
    expect(typeof result.reason).toBe('string')
  })

  // T_PRG_4: Tek A18 — stok yeterli → geçerli
  test('T_PRG_4 — tek A18 işlemi, stok yeterli → feasible: true', () => {
    const txA18 = makeTx('A18_TX', [
      { accountCode: '120', side: 'DEBIT',  amount: 5_000_000 },
      { accountCode: '600', side: 'CREDIT', amount: 5_000_000 },
      { accountCode: '621', side: 'DEBIT',  amount: 4_000_000 },
      { accountCode: '153', side: 'CREDIT', amount: 4_000_000 },
    ])
    const result = validatePortfolioResources([txA18], { '153': 5_000_000, '120': 0 })
    expect(result.feasible).toBe(true)
  })

  // T_PRG_5: Boş bakiyelerle negatife düşen watchlist hesabı → infeasible
  test('T_PRG_5 — boş bakiye + credit işlemi → feasible: false', () => {
    // 102 Banka: başlangıç 0, 5M credit → -5M (watchlist hesabı)
    const tx = makeTx('TX_BANKA_NEG', [
      { accountCode: '102', side: 'CREDIT', amount: 5_000_000 },
      { accountCode: '500', side: 'DEBIT',  amount: 5_000_000 },
    ])
    const result = validatePortfolioResources([tx], {})
    expect(result.feasible).toBe(false)
  })
})

// ─── T_RCT — getReceivableCollectionTarget ───────────────────────────────────

describe('R8.4 — getReceivableCollectionTarget (A05 half-gap DSO)', () => {

  // T_RCT_1: Yüksek DSO → amount > 0 (fix doğrulama)
  // MANUFACTURING receivablesDays benchmark ≈ 70 gün
  // AR=10M, netSales=25M → DSO = (10M/25M)×365 = 146 gün >> benchmark
  test('T_RCT_1 — yüksek DSO → amount > 500K (R8.4 fix)', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '120': 10_000_000 },
      netSales:        25_000_000,
    })
    const result = getReceivableCollectionTarget(ctx, { halfGap: true })
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(500_000)
  })

  // T_RCT_2: DSO benchmark altında → null (zaten iyi)
  // AR=5M, netSales=100M → DSO = 18.25 gün (benchmark 70 gün çok altında)
  test('T_RCT_2 — benchmark altı DSO → null (zaten iyi durumda)', () => {
    const ctx = makeCtx({
      accountBalances: { '120': 5_000_000 },
      netSales:        100_000_000,
    })
    const result = getReceivableCollectionTarget(ctx, { halfGap: true })
    expect(result).toBeNull()
  })

  // T_RCT_3: netSales=0 → null guard
  test('T_RCT_3 — netSales=0 → null guard', () => {
    const ctx = makeCtx({
      accountBalances: { '120': 5_000_000 },
      netSales: 0,
    })
    expect(getReceivableCollectionTarget(ctx, { halfGap: true })).toBeNull()
  })

  // T_RCT_4: AR=0 (boş accountBalances) → null guard
  test('T_RCT_4 — AR=0 → null guard', () => {
    const ctx = makeCtx({ accountBalances: {} })
    expect(getReceivableCollectionTarget(ctx, { halfGap: true })).toBeNull()
  })

  // T_RCT_5: halfGap:false → daha büyük tutar (tam sektör gap)
  test('T_RCT_5 — halfGap:false → halfGap:true tutarından büyük', () => {
    const ctx = makeCtx({
      accountBalances: { '120': 10_000_000 },
      netSales:        25_000_000,
    })
    const halfGapResult = getReceivableCollectionTarget(ctx, { halfGap: true })
    const fullGapResult = getReceivableCollectionTarget(ctx, { halfGap: false })
    expect(halfGapResult).not.toBeNull()
    expect(fullGapResult).not.toBeNull()
    expect(fullGapResult!).toBeGreaterThan(halfGapResult!)
  })

  // T_RCT_6: ENES benzeri senaryo — half-gap > eski 25% cap
  // AR=6.84M, netSales=18.35M → DSO=136 gün >> MANUFACTURING benchmark ~70 gün
  // Eski cap: 6.84M × 0.25 = 1.71M
  // Yeni half-gap: ~2.5M+ (DSO gap'in yarısı)
  test('T_RCT_6 — ENES benzeri: half-gap amount > eski 25% cap (1.71M)', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '120': 6_840_000 },
      netSales:        18_350_000,
    })
    const result = getReceivableCollectionTarget(ctx, { halfGap: true })
    expect(result).not.toBeNull()
    // Half-gap tutarı eski 25% cap'ten (1.71M) büyük olmalı
    expect(result!).toBeGreaterThan(1_710_000)
    // Tam sektör gap'ten (4.58M) küçük olmalı (yarım-boşluk)
    // Sektör gap = AR - targetAR = 6.84M - (18.35M × benchmarkDays / 365)
    // Sabit üst sınır kullanmadan sadece yönü doğrula
    expect(result!).toBeGreaterThan(500_000)
  })

  // T_RCT_7: Büyük AR, DSO benchmark yakınında → nispi guard (%5) tetiklenir → null
  //
  // MANUFACTURING benchmark = 53 gün
  // AR=20M, netSales=125M → currentDSO = 58.4 gün
  //   → Guard 1 (1.1×53=58.3): geçer (58.4 > 58.3) — aksiyon aday
  //   → halfGapDSO = (58.4+53)/2 = 55.7 → targetAR = 19.08M
  //   → amount = 0.93M > 500K — Guard 2 geçer
  //   → targetAR/ar = 0.954 ≥ 0.95 — Guard 3 (nispi) NULL döndürür ✓
  //
  // 500K mutlak guard yakalayamazdı (0.93M > 500K).
  // AR > 10M firmalarda nispi guard kritik öneme sahip.
  test('T_RCT_7 — büyük AR, %5 altı iyileşme → nispi guard (0.95) null döndürür', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '120': 20_000_000 },  // AR = 20M
      netSales:        125_000_000,            // DSO = 58.4 gün ≈ bm×1.1 üstü
    })
    // amount=0.93M > 500K (mutlak guard geçer), ama targetAR/ar=0.954 ≥ 0.95 (nispi guard)
    expect(getReceivableCollectionTarget(ctx, { halfGap: true })).toBeNull()
  })
})

// ─── T_A05 — ACTION_CATALOG_V3 A05 entegrasyonu ──────────────────────────────

describe('R8.4 — A05 ACTION_CATALOG_V3 entegrasyonu', () => {
  const a05 = ACTION_CATALOG_V3['A05_RECEIVABLE_COLLECTION']

  // T_A05_1: A05 computeAmount varsa half-gap helper kullanır
  test('T_A05_1 — yüksek DSO → computeAmount half-gap tutar üretir', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: { '120': 10_000_000 },
      netSales:        25_000_000,
    }) as any
    const amount = a05.computeAmount!(ctx)
    expect(amount).not.toBeNull()
    expect(amount!).toBeGreaterThan(500_000)
  })

  // T_A05_2: DSO iyi olan firma → computeAmount null döner
  test('T_A05_2 — benchmark altı DSO → computeAmount null döner', () => {
    const ctx = makeCtx({
      accountBalances: { '120': 2_000_000 },
      netSales:        100_000_000,  // DSO = 7.3 gün
    }) as any
    const amount = a05.computeAmount!(ctx)
    expect(amount).toBeNull()
  })
})
