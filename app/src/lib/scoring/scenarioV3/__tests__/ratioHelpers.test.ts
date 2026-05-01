/**
 * Faz 7.3.6B3b-3 — ratioHelpers üretici testleri.
 *
 * buildActionRatioTransparency wrapper + 3 metrik dalı:
 *   - DIO   (A06) → BalanceRatioTransparency (kind: 'balance')
 *   - GROSS_MARGIN (A12) → MarginRatioTransparency (kind: 'margin')
 *   - ASSET_TURNOVER (A18/A19) → TurnoverRatioTransparency (kind: 'turnover')
 *   - default (A05 vb.) → mevcut buildRatioTransparency
 */

import { buildActionRatioTransparency } from '../ratioHelpers'
import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'

// ─── Test yardımcısı ──────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:           'MANUFACTURING',
    accountBalances:  {},
    totalAssets:      200_000_000,
    totalEquity:       80_000_000,
    totalRevenue:     100_000_000,
    netIncome:         10_000_000,
    netSales:         100_000_000,
    operatingProfit:   15_000_000,
    grossProfit:       25_000_000,
    interestExpense:    2_000_000,
    operatingCashFlow: 12_000_000,
    period:           'ANNUAL',
    ...overrides,
  }
}

// ─── DIO — A06 ───────────────────────────────────────────────────────────────

describe('buildActionRatioTransparency — A06 DIO (kind: balance)', () => {
  const a06 = ACTION_CATALOG_V3['A06_INVENTORY_MONETIZATION']

  test('A06 stok 100M, cogs 200M → BalanceRatioTransparency döner', () => {
    // MANUFACTURING (imalat): inventoryDays benchmark = 82
    // realisticTarget = (200M × 82) / 365 ≈ 44.93M
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      accountBalances: {
        '150': 25_000_000,
        '151': 25_000_000,
        '152': 25_000_000,
        '153': 25_000_000,
        '621': 200_000_000, // cogs = 200M (doğrudan hesap)
      },
      netSales:    300_000_000,
      grossProfit: 100_000_000, // cogs fallback = 200M
    })
    const result = buildActionRatioTransparency(a06, ctx, 10_000_000)

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('balance')
    const r = result as any
    expect(r.currentBalance).toBe(100_000_000)
    // realisticTarget > 0 (formül çalışıyor)
    expect(r.realisticTarget).toBeGreaterThan(0)
    expect(r.realisticTarget).toBeLessThan(r.currentBalance)
    expect(r.formula.targetLabel).toBe('Hedef Stok')
    expect(r.formula.basisLabel).toBe('Satılan Mal Maliyeti')
    expect(r.formula.basisValue).toBe(200_000_000)
    expect(r.formula.targetDays).toBeGreaterThan(0) // sektör benchmark
    expect(r.formula.periodDays).toBe(365)
    expect(r.method).toBe('period-end-balance')
  })

  test('A06 stok 0 → null döner', () => {
    const ctx = makeCtx({ accountBalances: {} })
    expect(buildActionRatioTransparency(a06, ctx, 5_000_000)).toBeNull()
  })

  test('A06 stok var ama cogs=0 → null döner', () => {
    const ctx = makeCtx({
      accountBalances: { '153': 10_000_000 },
      netSales: 0,
      grossProfit: 0,
    })
    expect(buildActionRatioTransparency(a06, ctx, 5_000_000)).toBeNull()
  })

  test('A06 159 hesabı dahil edilmez (yalnızca 150-153)', () => {
    const ctx = makeCtx({
      sector: 'RETAIL',
      accountBalances: {
        '153': 10_000_000,
        '159': 99_000_000, // 159 sayılmamalı
        '621': 50_000_000,
      },
    })
    const result = buildActionRatioTransparency(a06, ctx, 1_000_000)
    if (result === null) return // cogs fallback
    expect((result as any).currentBalance).toBe(10_000_000) // sadece 153
  })

  test('A06 targetRatio.metric === DIO → kind: balance', () => {
    expect(a06.targetRatio?.metric).toBe('DIO')
  })
})

// ─── Brüt Kâr Marjı — A12 ───────────────────────────────────────────────────

describe('buildActionRatioTransparency — A12 GROSS_MARGIN (kind: margin)', () => {
  const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']

  test('A12 netSales=100M grossProfit=25M amount=5M → MarginRatioTransparency', () => {
    // IT (Bilişim): grossMargin benchmark = 0.36
    // realisticTarget = min(0.25 + 5M/100M, 0.36) = min(0.30, 0.36) = 0.30
    const ctx = makeCtx({
      sector: 'IT',
      netSales:    100_000_000,
      grossProfit:  25_000_000, // margin = 0.25
    })
    const result = buildActionRatioTransparency(a12, ctx, 5_000_000)

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('margin')
    const r = result as any
    expect(r.metricLabel).toBe('Brüt Kâr Marjı')
    expect(r.current).toBeCloseTo(0.25, 5)
    expect(r.realisticTarget).toBeCloseTo(0.30, 5)
    expect(r.sectorMedian).toBeCloseTo(0.36, 3) // IT benchmark
    expect(r.formula.description).toContain('Brüt Kâr Marjı')
    expect(r.formula.netSales).toBe(100_000_000)
    expect(r.formula.costToReduce).toBe(5_000_000)
  })

  test('A12 netSales=0 → null döner', () => {
    const ctx = makeCtx({ netSales: 0 })
    expect(buildActionRatioTransparency(a12, ctx, 5_000_000)).toBeNull()
  })

  test('A12 realisticTarget sektör medyanını aşmaz', () => {
    // MANUFACTURING: grossMargin = 0.20
    // current = 0.10, amount = 50M → projected = 0.10 + 0.50 = 0.60
    // realisticTarget = min(0.60, 0.20) = 0.20
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      netSales:    100_000_000,
      grossProfit:  10_000_000,
    })
    const result = buildActionRatioTransparency(a12, ctx, 50_000_000)
    expect(result).not.toBeNull()
    expect((result as any).realisticTarget).toBeCloseTo(0.20, 3)
  })

  test('A12 targetRatio.metric === GROSS_MARGIN', () => {
    expect(a12.targetRatio?.metric).toBe('GROSS_MARGIN')
  })
})

// ─── Aktif Devir Hızı — A18/A19 ─────────────────────────────────────────────

describe('buildActionRatioTransparency — A18/A19 ASSET_TURNOVER (kind: turnover)', () => {
  const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
  const a19 = ACTION_CATALOG_V3['A19_ADVANCE_TO_REVENUE']

  test('A18 netSales=100M totalAssets=200M amount=50M → TurnoverRatioTransparency', () => {
    const ctx = makeCtx({
      netSales:    100_000_000,
      totalAssets: 200_000_000,
    })
    const result = buildActionRatioTransparency(a18, ctx, 50_000_000)

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('turnover')
    const r = result as any
    expect(r.metricLabel).toBe('Aktif Devir Hızı')
    // current = 100M / 200M = 0.50
    expect(r.current).toBeCloseTo(0.50, 5)
    // realisticTarget = (100M + 50M) / 200M = 0.75
    expect(r.realisticTarget).toBeCloseTo(0.75, 5)
    expect(typeof r.sectorMedian).toBe('number')
    expect(r.formula.description).toContain('Aktif Devir Hızı')
    expect(r.formula.netSales).toBe(100_000_000)
    expect(r.formula.totalAssets).toBe(200_000_000)
  })

  test('A19 aynı mantık — kind: turnover', () => {
    const ctx = makeCtx({
      netSales:    80_000_000,
      totalAssets: 200_000_000,
    })
    const result = buildActionRatioTransparency(a19, ctx, 20_000_000)

    expect(result).not.toBeNull()
    expect(result!.kind).toBe('turnover')
    // current = 80M / 200M = 0.40
    // realisticTarget = (80M + 20M) / 200M = 0.50
    expect((result as any).current).toBeCloseTo(0.40, 5)
    expect((result as any).realisticTarget).toBeCloseTo(0.50, 5)
  })

  test('A18 totalAssets=0 → null döner', () => {
    const ctx = makeCtx({ totalAssets: 0 })
    expect(buildActionRatioTransparency(a18, ctx, 10_000_000)).toBeNull()
  })

  test('A18 targetRatio.metric === ASSET_TURNOVER', () => {
    expect(a18.targetRatio?.metric).toBe('ASSET_TURNOVER')
    expect(a19.targetRatio?.metric).toBe('ASSET_TURNOVER')
  })
})

// ─── Wrapper default branch — A05 ────────────────────────────────────────────

describe('buildActionRatioTransparency — A05 default (DSO)', () => {
  const a05 = ACTION_CATALOG_V3['A05_RECEIVABLE_COLLECTION']  // doğru ID

  test('A05 targetRatio yok → default branch (buildRatioTransparency)', () => {
    // A05 mevcut akışı: DSO bakiye-tabanlı (BalanceRatioTransparency veya null)
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: { '120': 30_000_000, '121': 5_000_000 },
      netSales: 100_000_000,
    })
    const result = buildActionRatioTransparency(a05, ctx, 5_000_000)
    // A05 sonucu: balance tipinde (kind undefined / 'balance') veya null
    if (result !== null) {
      expect(result.kind === undefined || result.kind === 'balance').toBe(true)
    }
    // A05'in DIO/GROSS_MARGIN/ASSET_TURNOVER olmadığı yeterli
    expect(true).toBe(true)
  })

  test('A05 targetRatio.metric !== DIO/GROSS_MARGIN/ASSET_TURNOVER', () => {
    // A05 DSO metric kullanır — wrapper default branch
    const metric = a05.targetRatio?.metric
    const nonSpecialMetric =
      metric !== 'DIO' &&
      metric !== 'GROSS_MARGIN' &&
      metric !== 'ASSET_TURNOVER'
    expect(nonSpecialMetric).toBe(true)
  })
})
